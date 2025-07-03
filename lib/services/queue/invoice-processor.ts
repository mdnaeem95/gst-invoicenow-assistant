// lib/services/queue/invoice-processor.ts
import { Redis } from 'ioredis'
import { Job, Queue, Worker, QueueEvents } from 'bullmq'
import { createClient } from '@/lib/supabase/server'
import { OCROrchestrator } from '../ocr/ocr-orchestrator'
import { InvoiceNowGenerator } from '../invoicenow-generator'
import { logInvoiceAction, updateInvoiceStatus } from '@/lib/db/invoice-helpers'
import { SingaporeGSTValidator } from '@/lib/validation/gst-validator'

interface ProcessingJob {
  invoiceId: string
  userId: string
  fileUrl: string
  fileName: string
  mimeType: string
  retryCount?: number
  options?: {
    priority?: number
    preferredOCR?: string
    autoFix?: boolean
    skipValidation?: boolean
  }
}

export class InvoiceProcessingQueue {
  private queue: Queue<ProcessingJob>
  private worker: Worker<ProcessingJob> | null = null
  private events: QueueEvents
  private redis: Redis
  private ocrOrchestrator: OCROrchestrator
  private validator: SingaporeGSTValidator
  private xmlGenerator: InvoiceNowGenerator

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null
    })

    // Initialize queue
    this.queue = new Queue<ProcessingJob>('invoice-processing', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 100      // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600 // Keep failed jobs for 7 days
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000 // Start with 2s delay
        }
      }
    })

    // Initialize queue events for monitoring
    this.events = new QueueEvents('invoice-processing', {
      connection: this.redis
    })

    // Initialize services
    this.ocrOrchestrator = new OCROrchestrator()
    this.validator = new SingaporeGSTValidator()
    this.xmlGenerator = new InvoiceNowGenerator()

    this.setupEventListeners()
  }

  /**
   * Add invoice to processing queue
   */
  async addInvoice(job: ProcessingJob): Promise<string> {
    const priority = job.options?.priority || 0
    
    const queuedJob = await this.queue.add('process-invoice', job, {
      priority,
      delay: 0,
      // Group by user for fair processing
      lifo: false // First In First Out
    })

    console.log(`Invoice ${job.invoiceId} added to queue with job ID: ${queuedJob.id}`)
    
    return queuedJob.id!
  }

  /**
   * Start processing worker
   */
  async startWorker(concurrency: number = 3) {
    if (this.worker) {
      console.log('Worker already running')
      return
    }

    this.worker = new Worker<ProcessingJob>(
      'invoice-processing',
      async (job) => this.processInvoice(job),
      {
        connection: this.redis,
        concurrency,
        limiter: {
          max: 10,        // Max 10 jobs
          duration: 1000  // per second
        }
      }
    )

    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`)
    })

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err)
    })

    console.log(`Worker started with concurrency: ${concurrency}`)
  }

  /**
   * Stop processing worker
   */
  async stopWorker() {
    if (this.worker) {
      await this.worker.close()
      this.worker = null
      console.log('Worker stopped')
    }
  }

  /**
   * Process a single invoice
   */
  private async processInvoice(job: Job<ProcessingJob>): Promise<any> {
    const { invoiceId, userId, fileUrl, fileName, mimeType, options } = job.data
    const supabase = await createClient()
    
    try {
      // Update job progress
      await job.updateProgress(10)
      
      // Log processing start
      await logInvoiceAction(invoiceId, userId, 'ocr_start', 'started')
      await updateInvoiceStatus(invoiceId, 'processing')

      // Download file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('invoices')
        .download(fileUrl.replace(/^.*\/invoices\//, ''))
      
      if (downloadError) throw new Error(`Failed to download file: ${downloadError.message}`)
      
      const fileBuffer = Buffer.from(await fileData.arrayBuffer())
      await job.updateProgress(20)

      // OCR Processing with retry logic
      let ocrResult
      let ocrAttempts = 0
      const maxOCRAttempts = 2

      while (ocrAttempts < maxOCRAttempts) {
        try {
          ocrResult = await this.ocrOrchestrator.extractInvoiceData(
            fileBuffer, 
            fileName,
            {
              preferredProvider: options?.preferredOCR,
              minConfidence: 0.7,
              enableTemplateMatching: true
            }
          )
          break
        } catch (error) {
          ocrAttempts++
          if (ocrAttempts >= maxOCRAttempts) throw error
          
          console.log(`OCR attempt ${ocrAttempts} failed, retrying...`)
          await new Promise(resolve => setTimeout(resolve, 1000 * ocrAttempts))
        }
      }

      await job.updateProgress(50)
      await logInvoiceAction(invoiceId, userId, 'ocr_complete', 'completed', {
        confidence: ocrResult?.confidence,
        provider: ocrResult?.provider,
        processingTime: ocrResult?.processingTime
      })

      // Update invoice with extracted data
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          invoice_number: ocrResult?.invoiceNumber,
          invoice_date: ocrResult?.invoiceDate,
          due_date: ocrResult?.dueDate,
          customer_name: ocrResult?.customerName,
          customer_uen: ocrResult?.customerUEN,
          vendor_name: ocrResult?.vendorName,
          vendor_uen: ocrResult?.vendorUEN,
          subtotal: ocrResult?.subtotal,
          gst_amount: ocrResult?.gstAmount,
          total_amount: ocrResult?.totalAmount,
          ocr_confidence_score: ocrResult?.confidence,
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', invoiceId)

      if (updateError) throw updateError
      await job.updateProgress(60)

      // Insert line items
      if (ocrResult?.items && ocrResult.items.length > 0) {
        const items = ocrResult.items.map((item: any, index: any) => ({
          invoice_id: invoiceId,
          line_number: index + 1,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          unit_of_measure: 'EA',
          line_amount: item.amount,
          total_amount: item.amount * 1.09, // Including GST
          tax_category: 'S',
          gst_rate: 9,
          gst_amount: item.amount * 0.09
        }))

        await supabase.from('invoice_items').insert(items)
      }

      await job.updateProgress(70)

      // Validation (unless skipped)
      if (!options?.skipValidation) {
        await logInvoiceAction(invoiceId, userId, 'validation', 'started')
        
        const { data: invoiceData } = await supabase
          .from('invoices')
          .select('*, items:invoice_items(*)')
          .eq('id', invoiceId)
          .single()

        const validationResult = await this.validator.validateInvoice(invoiceData)
        
        await job.updateProgress(80)

        // Auto-fix if enabled and has suggestions
        if (options?.autoFix && validationResult.suggestions.length > 0) {
          const fixed = await this.validator.autoFixInvoice(invoiceData, validationResult)
          
          await supabase
            .from('invoices')
            .update(fixed)
            .eq('id', invoiceId)
        }

        // Store validation results
        await supabase
          .from('invoice_processing_logs')
          .insert({
            invoice_id: invoiceId,
            user_id: userId,
            action: 'validation',
            status: validationResult.isValid ? 'completed' : 'failed',
            details: validationResult
          })

        if (!validationResult.isValid && validationResult.errors.some(e => e.severity === 'critical')) {
          throw new Error(`Critical validation errors: ${validationResult.errors.map(e => e.message).join(', ')}`)
        }
      }

      await job.updateProgress(90)

      // Generate XML
      await logInvoiceAction(invoiceId, userId, 'xml_generation', 'started')
      
      const { data: finalInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      const xmlContent = this.xmlGenerator.generateXML(
        {
          ...ocrResult,
          ...finalInvoice // Merge with any updates
        },
        {
          name: profile.company_name,
          uen: profile.company_uen,
          address: profile.company_address || '',
          gstNumber: profile.gst_number
        }
      )

      // Save XML
      const xmlFileName = `${userId}/${invoiceId}/invoicenow-${finalInvoice.invoice_number}.xml`
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(xmlFileName, Buffer.from(xmlContent), {
          contentType: 'application/xml',
          upsert: true
        })

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('invoices')
          .getPublicUrl(xmlFileName)

        await supabase
          .from('invoices')
          .update({ 
            converted_xml_url: urlData.publicUrl,
            status: 'draft', // Ready for review
            processing_completed_at: new Date().toISOString(),
            processing_duration_ms: Date.now() - job.timestamp
          })
          .eq('id', invoiceId)
      }

      await job.updateProgress(100)
      await logInvoiceAction(invoiceId, userId, 'xml_generation', 'completed')

      // Send notification (webhook or email)
      await this.notifyCompletion(invoiceId, userId)

      return {
        success: true,
        invoiceId,
        confidence: ocrResult?.confidence,
        warnings: ocrResult?.warnings
      }

    } catch (error) {
      console.error('Processing error:', error)
      
      // Log the error
      await logInvoiceAction(
        invoiceId, 
        userId, 
        'processing', 
        'failed', 
        null,
        error instanceof Error ? error.message : 'Unknown error'
      )

      // Update invoice status
      await updateInvoiceStatus(
        invoiceId, 
        'failed',
        error instanceof Error ? error.message : 'Processing failed'
      )

      // Rethrow to trigger retry
      throw error
    }
  }

  /**
   * Setup event listeners for monitoring
   */
  private setupEventListeners() {
    this.events.on('completed', ({ jobId, returnvalue }) => {
      console.log(`Job ${jobId} completed with result:`, returnvalue)
    })

    this.events.on('failed', ({ jobId, failedReason }) => {
      console.error(`Job ${jobId} failed:`, failedReason)
    })

    this.events.on('progress', ({ jobId, data }) => {
      console.log(`Job ${jobId} progress: ${data}%`)
    })
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount()
    ])

    return {
      waiting,
      active,
      completed,
      failed,
      isPaused: await this.queue.isPaused()
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string) {
    const job = await this.queue.getJob(jobId)
    if (!job) return null

    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    }
  }

  /**
   * Retry failed job
   */
  async retryJob(jobId: string) {
    const job = await this.queue.getJob(jobId)
    if (!job) throw new Error('Job not found')

    const state = await job.getState()
    if (state !== 'failed') {
      throw new Error(`Job is not in failed state (current: ${state})`)
    }

    await job.retry()
    return true
  }

  /**
   * Notify completion
   */
  private async notifyCompletion(invoiceId: string, userId: string) {
    // Send webhook if configured
    if (process.env.WEBHOOK_URL) {
      try {
        await fetch(process.env.WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'invoice.processed',
            invoiceId,
            userId,
            timestamp: new Date().toISOString()
          })
        })
      } catch (error) {
        console.error('Webhook notification failed:', error)
      }
    }

    // Queue email notification
    // ... email service implementation
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await this.stopWorker()
    await this.queue.close()
    await this.events.close()
    await this.redis.quit()
  }
}

// lib/services/queue/queue-monitor.ts
export class QueueMonitor {
  private queue: InvoiceProcessingQueue
  private interval: NodeJS.Timeout | null = null

  constructor(queue: InvoiceProcessingQueue) {
    this.queue = queue
  }

  start(intervalMs: number = 30000) {
    this.interval = setInterval(async () => {
      const stats = await this.queue.getQueueStats()
      console.log('Queue Stats:', stats)

      // Alert if too many failed jobs
      if (stats.failed > 100) {
        console.error('High number of failed jobs detected!')
        // Send alert...
      }

      // Alert if queue is backing up
      if (stats.waiting > 1000) {
        console.warn('Queue backlog detected!')
        // Scale up workers...
      }
    }, intervalMs)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
}
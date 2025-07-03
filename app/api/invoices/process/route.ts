// app/api/invoices/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InvoiceProcessingQueue } from '@/lib/services/queue/invoice-processor'
import { v4 as uuidv4 } from 'uuid'

// Initialize queue (in production, this would be a singleton)
const processingQueue = new InvoiceProcessingQueue()

// Start worker if not already running
processingQueue.startWorker(parseInt(process.env.WORKER_CONCURRENCY || '3'))

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file
    const formData = await request.formData()
    const file = formData.get('file') as File
    const priority = formData.get('priority') as string || '0'
    const autoFix = formData.get('autoFix') === 'true'
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file
    const validationResult = validateFile(file)
    if (!validationResult.isValid) {
      return NextResponse.json(
        { success: false, error: validationResult.error },
        { status: 400 }
      )
    }

    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (!user || authError) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check user's processing quota
    const quotaCheck = await checkUserQuota(user.id)
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: quotaCheck.message,
          quotaInfo: quotaCheck.quotaInfo 
        },
        { status: 429 }
      )
    }

    // Create invoice record with initial status
    const invoiceId = uuidv4()
    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        id: invoiceId,
        user_id: user.id,
        status: 'processing',
        original_filename: file.name,
        invoice_number: `PROCESSING-${Date.now()}`, // Temporary
        invoice_date: new Date().toISOString().split('T')[0],
        customer_name: 'Processing...',
        subtotal: 0,
        gst_amount: 0,
        total_amount: 0,
        currency: 'SGD'
      })
      .select()
      .single()

    if (!invoice || insertError) {
      console.error('Failed to create invoice record:', insertError)
      return NextResponse.json(
        { success: false, error: 'Failed to create invoice record' },
        { status: 500 }
      )
    }

    // Upload file to storage
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const fileName = `${user.id}/${invoiceId}/original-${file.name}`
    
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: true
      })

    if (uploadError) {
      // Cleanup invoice record
      await supabase.from('invoices').delete().eq('id', invoiceId)
      
      return NextResponse.json(
        { success: false, error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('invoices')
      .getPublicUrl(fileName)

    // Update invoice with file URL
    await supabase
      .from('invoices')
      .update({ original_file_url: urlData.publicUrl })
      .eq('id', invoiceId)

    // Add to processing queue
    const jobId = await processingQueue.addInvoice({
      invoiceId,
      userId: user.id,
      fileUrl: urlData.publicUrl,
      fileName: file.name,
      mimeType: file.type,
      options: {
        priority: parseInt(priority),
        autoFix,
        preferredOCR: request.headers.get('X-Preferred-OCR') || undefined
      }
    })

    // Log the upload action
    await supabase
      .from('invoice_processing_logs')
      .insert({
        invoice_id: invoiceId,
        user_id: user.id,
        action: 'upload',
        status: 'completed',
        details: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          jobId
        }
      })

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoiceId,
        status: 'processing',
        jobId
      },
      message: 'Invoice queued for processing'
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// Helper functions
function validateFile(file: File): { isValid: boolean; error?: string } {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'image/jpeg',
    'image/png'
  ]
  
  if (!allowedTypes.includes(file.type)) {
    return { 
      isValid: false, 
      error: 'Invalid file type. Supported formats: PDF, Excel, JPEG, PNG' 
    }
  }

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    return { 
      isValid: false, 
      error: 'File size exceeds 10MB limit' 
    }
  }

  return { isValid: true }
}

async function checkUserQuota(userId: string): Promise<{
  allowed: boolean
  message?: string
  quotaInfo?: any
}> {
  const supabase = await createClient()
  
  // Get user's subscription info
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_plan, subscription_status')
    .eq('id', userId)
    .single()

  // Get current month's invoice count
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfMonth.toISOString())

  const quotaLimits = {
    'starter': 50,
    'professional': 200,
    'business': -1 // Unlimited
  }

  const limit = quotaLimits[profile?.subscription_plan || 'starter']
  
  if (limit !== -1 && (count || 0) >= limit) {
    return {
      allowed: false,
      message: `Monthly invoice limit reached (${count}/${limit})`,
      quotaInfo: {
        used: count,
        limit,
        plan: profile?.subscription_plan
      }
    }
  }

  return {
    allowed: true,
    quotaInfo: {
      used: count || 0,
      limit: limit === -1 ? 'Unlimited' : limit,
      plan: profile?.subscription_plan
    }
  }
}
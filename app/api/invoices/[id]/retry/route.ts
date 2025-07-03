// app/api/invoices/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (!user || authError) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get invoice
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!invoice || error) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    if (invoice.status !== 'failed') {
      return NextResponse.json(
        { success: false, error: 'Only failed invoices can be retried' },
        { status: 400 }
      )
    }

    // Get the last job ID
    const { data: logs } = await supabase
      .from('invoice_processing_logs')
      .select('*')
      .eq('invoice_id', id)
      .order('created_at', { ascending: false })
      .limit(1)

    const jobId = logs?.[0]?.details?.jobId
    
    if (jobId) {
      // Try to retry the existing job
      try {
        await processingQueue.retryJob(jobId)
        
        // Update invoice status
        await supabase
          .from('invoices')
          .update({ 
            status: 'processing',
            error_message: null 
          })
          .eq('id', id)

        return NextResponse.json({
          success: true,
          message: 'Invoice queued for retry',
          jobId
        })
      } catch (retryError) {
        // Job might be too old, create a new one
        console.log('Could not retry job, creating new one:', retryError)
      }
    }

    // Create a new processing job
    const newJobId = await processingQueue.addInvoice({
      invoiceId: id,
      userId: user.id,
      fileUrl: invoice.original_file_url,
      fileName: invoice.original_filename,
      mimeType: 'application/pdf', // Default
      retryCount: (invoice.retry_count || 0) + 1,
      options: {
        priority: 1, // Higher priority for retries
        autoFix: true
      }
    })

    // Update invoice status
    await supabase
      .from('invoices')
      .update({ 
        status: 'processing',
        error_message: null,
        retry_count: (invoice.retry_count || 0) + 1
      })
      .eq('id', id)

    // Log retry action
    await supabase
      .from('invoice_processing_logs')
      .insert({
        invoice_id: id,
        user_id: user.id,
        action: 'retry',
        status: 'started',
        details: { jobId: newJobId }
      })

    return NextResponse.json({
      success: true,
      message: 'Invoice queued for retry',
      jobId: newJobId
    })
    
  } catch (error) {
    console.error('Retry error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retry invoice' },
      { status: 500 }
    )
  }
}
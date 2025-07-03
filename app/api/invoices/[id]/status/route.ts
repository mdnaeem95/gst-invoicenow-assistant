// app/api/invoices/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InvoiceProcessingQueue } from '@/lib/services/queue/invoice-processor'
import { v4 as uuidv4 } from 'uuid'

export async function GET(
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

    // Get invoice status
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select(`
        id,
        status,
        processing_started_at,
        processing_completed_at,
        processing_duration_ms,
        ocr_confidence_score,
        error_message,
        invoice_number,
        customer_name,
        total_amount
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!invoice || error) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // Get processing logs
    const { data: logs } = await supabase
      .from('invoice_processing_logs')
      .select('*')
      .eq('invoice_id', id)
      .order('created_at', { ascending: true })

    // Get job status from queue if still processing
    let jobStatus = null
    if (invoice.status === 'processing') {
      const latestLog = logs?.find(log => log.details?.jobId)
      if (latestLog?.details?.jobId) {
        jobStatus = await processingQueue.getJobStatus(latestLog.details.jobId)
      }
    }

    return NextResponse.json({
      success: true,
      invoice: {
        ...invoice,
        processingLogs: logs,
        jobStatus
      }
    })
    
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get status' },
      { status: 500 }
    )
  }
}
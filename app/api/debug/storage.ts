import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // List all buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    
    // Try to list files in invoices bucket
    let invoiceFiles = null
    let invoiceError = null
    
    try {
      const { data, error } = await supabase.storage
        .from('invoices')
        .list('', {
          limit: 10,
          offset: 0
        })
      invoiceFiles = data
      invoiceError = error
    } catch (e) {
      invoiceError = e
    }

    // Get a sample public URL
    const sampleUrl = supabase.storage
      .from('invoices')
      .getPublicUrl('sample.txt')

    return NextResponse.json({
      buckets: buckets || [],
      bucketsError: bucketsError?.message,
      invoiceFiles: invoiceFiles || [],
      invoiceError: invoiceError?.message || String(invoiceError),
      samplePublicUrl: sampleUrl.data?.publicUrl,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    })
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
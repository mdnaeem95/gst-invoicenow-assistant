import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET single invoice
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

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*)
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

    return NextResponse.json({ success: true, invoice })
    
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// DELETE invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (!user || authError) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify invoice belongs to user
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, user_id, original_file_url, converted_xml_url')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!invoice || fetchError) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // Delete files from storage if they exist
    if (invoice.original_file_url || invoice.converted_xml_url) {
      const filesToDelete = []
      
      if (invoice.original_file_url) {
        const originalPath = invoice.original_file_url.split('/').slice(-3).join('/')
        filesToDelete.push(originalPath)
      }
      
      if (invoice.converted_xml_url) {
        const xmlPath = invoice.converted_xml_url.split('/').slice(-3).join('/')
        filesToDelete.push(xmlPath)
      }

      if (filesToDelete.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('invoices')
          .remove(filesToDelete)
          
        if (storageError) {
          console.error('Storage deletion error:', storageError)
          // Continue with invoice deletion even if storage fails
        }
      }
    }

    // Delete invoice (cascade will delete related items)
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete invoice' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
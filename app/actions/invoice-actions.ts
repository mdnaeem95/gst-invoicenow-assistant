'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function deleteInvoice(invoiceId: string) {
  console.log('=== DELETE INVOICE ACTION STARTED ===')
  console.log('Invoice ID:', invoiceId)
  
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (!user || authError) {
      console.error('Auth error:', authError)
      return { success: false, error: 'Unauthorized' }
    }

    console.log('User ID:', user.id)

    // Get invoice details first to delete storage files
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, user_id, original_file_url, converted_xml_url')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single()

    if (!invoice || fetchError) {
      console.error('Fetch error:', fetchError)
      return { success: false, error: 'Invoice not found' }
    }

    console.log('Found invoice:', invoice)

    // Delete files from storage
    const filesToDelete = []
    
    if (invoice.original_file_url) {
      console.log('Original URL:', invoice.original_file_url)
      // Extract path from URL - handle different URL formats
      const match = invoice.original_file_url.match(/\/storage\/v1\/object\/public\/invoices\/(.+)/)
      if (match && match[1]) {
        const path = decodeURIComponent(match[1])
        console.log('Original path to delete:', path)
        filesToDelete.push(path)
      }
    }
    
    if (invoice.converted_xml_url) {
      console.log('XML URL:', invoice.converted_xml_url)
      // Extract path from URL - handle different URL formats
      const match = invoice.converted_xml_url.match(/\/storage\/v1\/object\/public\/invoices\/(.+)/)
      if (match && match[1]) {
        const path = decodeURIComponent(match[1])
        console.log('XML path to delete:', path)
        filesToDelete.push(path)
      }
    }

    console.log('Files to delete:', filesToDelete)

    if (filesToDelete.length > 0) {
      const { data: storageData, error: storageError } = await supabase.storage
        .from('invoices')
        .remove(filesToDelete)
        
      console.log('Storage deletion result:', { data: storageData, error: storageError })
      
      if (storageError) {
        console.error('Storage deletion error:', storageError)
        // Continue with invoice deletion even if storage fails
      }
    }

    // Delete invoice (cascade will delete related items)
    const { data: deleteData, error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .select() // Add select to see what was deleted

    console.log('Delete result:', { data: deleteData, error: deleteError })

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return { success: false, error: 'Failed to delete invoice' }
    }

    console.log('=== DELETE INVOICE ACTION COMPLETED ===')

    // Revalidate the invoices page to show updated list
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoiceId}`)
    
    return { success: true }
    
  } catch (error) {
    console.error('Unexpected error:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}
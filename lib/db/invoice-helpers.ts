// lib/db/invoice-helpers.ts
import { createClient } from '@/lib/supabase/server'
import { 
  Invoice, 
  InvoiceItem, 
  ProcessingLog, 
  InvoiceStatus,
  CreateInvoiceInput,
  CreateInvoiceItemInput 
} from '@/types'

/**
 * Create a new invoice with items
 */
export async function createInvoice(
  userId: string,
  data: CreateInvoiceInput
): Promise<{ invoice: Invoice | null; error: Error | null }> {
  const supabase = await createClient()
  
  try {
    // Start a transaction by creating the invoice first
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        invoice_number: data.invoice_number,
        invoice_date: data.invoice_date,
        due_date: data.due_date,
        customer_name: data.customer_name,
        customer_uen: data.customer_uen,
        customer_address: data.customer_address,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        payment_terms: data.payment_terms,
        notes: data.notes,
        status: 'draft',
        currency: 'SGD',
        subtotal: 0,
        gst_amount: 0,
        total_amount: 0,
      })
      .select()
      .single()

    if (invoiceError) throw invoiceError

    // Calculate totals
    let subtotal = 0
    let totalGST = 0

    // Create invoice items
    const itemsToInsert = data.items.map((item, index) => {
      const quantity = item.quantity || 1
      const unitPrice = item.unit_price || 0
      const discountPercentage = item.discount_percentage || 0
      const gstRate = item.gst_rate || 9 // Default 9% GST
      
      const lineAmount = quantity * unitPrice
      const discountAmount = lineAmount * (discountPercentage / 100)
      const amountAfterDiscount = lineAmount - discountAmount
      const gstAmount = amountAfterDiscount * (gstRate / 100)
      const totalAmount = amountAfterDiscount + gstAmount
      
      subtotal += amountAfterDiscount
      totalGST += gstAmount

      return {
        invoice_id: invoice.id,
        line_number: index + 1,
        description: item.description,
        item_code: item.item_code,
        quantity,
        unit_price: unitPrice,
        discount_percentage: discountPercentage,
        discount_amount: discountAmount,
        tax_category: 'S', // Standard rate
        gst_rate: gstRate,
        gst_amount: gstAmount,
        line_amount: amountAfterDiscount,
        total_amount: totalAmount,
        unit_of_measure: 'EA', // Default to 'Each'
      }
    })

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert)

      if (itemsError) throw itemsError
    }

    // Update invoice totals
    const totalAmount = subtotal + totalGST
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        subtotal,
        gst_amount: totalGST,
        total_amount: totalAmount,
      })
      .eq('id', invoice.id)
      .select(`
        *,
        items:invoice_items(*)
      `)
      .single()

    if (updateError) throw updateError

    // Log the creation
    await logInvoiceAction(invoice.id, userId, 'upload', 'completed')

    return { invoice: updatedInvoice, error: null }
  } catch (error) {
    console.error('Error creating invoice:', error)
    return { invoice: null, error: error as Error }
  }
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus,
  errorMessage?: string
): Promise<{ success: boolean; error: Error | null }> {
  const supabase = await createClient()
  
  try {
    const updateData: any = { status }
    
    if (status === InvoiceStatus.Failed && errorMessage) {
      updateData.error_message = errorMessage
    }
    
    if (status === InvoiceStatus.Processing) {
      updateData.processing_started_at = new Date().toISOString()
    }
    
    if (status === InvoiceStatus.Submitted || status === InvoiceStatus.Failed) {
      updateData.processing_completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId)

    if (error) throw error

    return { success: true, error: null }
  } catch (error) {
    console.error('Error updating invoice status:', error)
    return { success: false, error: error as Error }
  }
}

/**
 * Log invoice processing action
 */
export async function logInvoiceAction(
  invoiceId: string,
  userId: string,
  action: ProcessingLog['action'],
  status: ProcessingLog['status'],
  details?: any,
  errorMessage?: string
): Promise<void> {
  const supabase = await createClient()
  
  try {
    await supabase
      .from('invoice_processing_logs')
      .insert({
        invoice_id: invoiceId,
        user_id: userId,
        action,
        status,
        details,
        error_message: errorMessage,
      })
  } catch (error) {
    console.error('Error logging invoice action:', error)
  }
}

/**
 * Get invoice with all relations
 */
export async function getInvoiceWithDetails(
  invoiceId: string,
  userId: string
): Promise<{ invoice: Invoice | null; error: Error | null }> {
  const supabase = await createClient()
  
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*),
        processing_logs:invoice_processing_logs(*),
        peppol_submissions(*)
      `)
      .eq('id', invoiceId)
      .eq('user_id', userId)
      .single()

    if (error) throw error

    return { invoice: data, error: null }
  } catch (error) {
    console.error('Error fetching invoice:', error)
    return { invoice: null, error: error as Error }
  }
}

/**
 * Get user's invoice statistics
 */
export async function getInvoiceStatistics(userId: string): Promise<{
  total: number
  byStatus: Record<InvoiceStatus, number>
  totalAmount: number
  totalGST: number
  averageAmount: number
  processingSuccessRate: number
}> {
  const supabase = await createClient()
  
  try {
    // Get all invoices for statistics
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('status, total_amount, gst_amount')
      .eq('user_id', userId)

    if (error) throw error

    const stats = {
      total: invoices?.length || 0,
      byStatus: {
        [InvoiceStatus.Draft]: 0,
        [InvoiceStatus.Processing]: 0,
        [InvoiceStatus.Submitted]: 0,
        [InvoiceStatus.Failed]: 0,
        [InvoiceStatus.Delivered]: 0,
      },
      totalAmount: 0,
      totalGST: 0,
      averageAmount: 0,
      processingSuccessRate: 0,
    }

    if (invoices && invoices.length > 0) {
      invoices.forEach(invoice => {
        stats.byStatus[invoice.status as InvoiceStatus]++
        stats.totalAmount += invoice.total_amount || 0
        stats.totalGST += invoice.gst_amount || 0
      })

      stats.averageAmount = stats.totalAmount / invoices.length
      
      const successfulCount = stats.byStatus[InvoiceStatus.Submitted] + 
                            stats.byStatus[InvoiceStatus.Delivered]
      const processedCount = stats.total - stats.byStatus[InvoiceStatus.Draft]
      
      stats.processingSuccessRate = processedCount > 0 
        ? (successfulCount / processedCount) * 100 
        : 0
    }

    return stats
  } catch (error) {
    console.error('Error calculating statistics:', error)
    return {
      total: 0,
      byStatus: {
        [InvoiceStatus.Draft]: 0,
        [InvoiceStatus.Processing]: 0,
        [InvoiceStatus.Submitted]: 0,
        [InvoiceStatus.Failed]: 0,
        [InvoiceStatus.Delivered]: 0,
      },
      totalAmount: 0,
      totalGST: 0,
      averageAmount: 0,
      processingSuccessRate: 0,
    }
  }
}

/**
 * Save invoice file URLs
 */
export async function saveInvoiceFiles(
  invoiceId: string,
  originalFileUrl?: string,
  xmlFileUrl?: string
): Promise<{ success: boolean; error: Error | null }> {
  const supabase = await createClient()
  
  try {
    const updateData: any = {}
    
    if (originalFileUrl) {
      updateData.original_file_url = originalFileUrl
    }
    
    if (xmlFileUrl) {
      updateData.converted_xml_url = xmlFileUrl
    }

    const { error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId)

    if (error) throw error

    return { success: true, error: null }
  } catch (error) {
    console.error('Error saving file URLs:', error)
    return { success: false, error: error as Error }
  }
}

/**
 * Check if invoice number already exists for user
 */
export async function checkInvoiceNumberExists(
  userId: string,
  invoiceNumber: string
): Promise<boolean> {
  const supabase = await createClient()
  
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('id')
      .eq('user_id', userId)
      .eq('invoice_number', invoiceNumber)
      .single()

    if (error && error.code === 'PGRST116') {
      // No rows returned = invoice number doesn't exist
      return false
    }

    return !!data
  } catch (error) {
    console.error('Error checking invoice number:', error)
    return false
  }
}
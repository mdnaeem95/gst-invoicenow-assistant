export interface Invoice {
    id: string
    invoice_number: string
    invoice_date: string
    due_date?: string
    customer_name: string
    customer_uen?: string
    subtotal: number
    gst_amount: number
    total_amount: number
    status: 'draft' | 'processing' | 'submitted' | 'failed' | 'delivered'
    peppol_id?: string
    original_file_url?: string
    converted_xml_url?: string
    error_message?: string
    created_at: string
    updated_at: string
    items?: InvoiceItem[]
  }
  
  export interface InvoiceItem {
    id: string
    description: string
    quantity: number
    unit_price: number
    amount: number
    gst_rate: number
  }
  
  export interface ConversionResult {
    success: boolean
    xml?: string
    errors?: string[]
  }
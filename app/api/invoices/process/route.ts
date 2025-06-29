import { NextRequest, NextResponse } from 'next/server'
import { InvoiceParser } from '@/lib/services/invoice-parser'
import { InvoiceNowGenerator } from '@/lib/services/invoicenow-generator'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get form data
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Upload original file to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}/${Date.now()}.${fileExt}`
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(fileName, file)
    
    if (uploadError) {
      throw uploadError
    }

    // Parse the invoice
    const parser = new InvoiceParser()
    const parsedData = await parser.parseFile(file)
    
    // Get company data
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    // Generate InvoiceNow XML
    const generator = new InvoiceNowGenerator()
    const xml = generator.generateXML(parsedData, {
      name: profile.company_name,
      uen: profile.uen,
      gstNumber: profile.gst_number,
      address: profile.address
    })
    
    // Validate XML
    const validation = generator.validateXML(xml)
    
    // Save XML to storage
    const xmlFileName = `${user.id}/${Date.now()}.xml`
    const { data: xmlUpload } = await supabase.storage
      .from('converted')
      .upload(xmlFileName, new Blob([xml], { type: 'text/xml' }))
    
    // Create invoice record
    const { data: invoice, error: dbError } = await supabase
      .from('invoices')
      .insert({
        user_id: user.id,
        invoice_number: parsedData.invoiceNumber || `INV-${Date.now()}`,
        invoice_date: parsedData.invoiceDate || new Date().toISOString().split('T')[0],
        due_date: parsedData.dueDate,
        customer_name: parsedData.customerName || 'Unknown Customer',
        customer_uen: parsedData.customerUEN,
        subtotal: parsedData.subtotal || 0,
        gst_amount: parsedData.gstAmount || 0,
        total_amount: parsedData.totalAmount || 0,
        status: validation.valid ? 'processing' : 'draft',
        original_file_url: fileName,
        converted_xml_url: xmlFileName,
        error_message: validation.errors.join(', ')
      })
      .select()
      .single()
    
    if (dbError) {
      throw dbError
    }
    
    // Insert line items
    if (parsedData.items.length > 0) {
      await supabase
        .from('invoice_items')
        .insert(
          parsedData.items.map(item => ({
            invoice_id: invoice.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            amount: item.amount,
            gst_rate: 9.00
          }))
        )
    }
    
    return NextResponse.json({
      success: true,
      invoice,
      validation,
      parsedData
    })
    
  } catch (error) {
    console.error('Invoice processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process invoice' },
      { status: 500 }
    )
  }
}
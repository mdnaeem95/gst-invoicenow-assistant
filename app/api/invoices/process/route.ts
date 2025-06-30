import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InvoiceParser } from '@/lib/services/invoice-parser'
import { InvoiceNowGenerator } from '@/lib/services/invoicenow-generator'

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ]
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Please upload PDF or Excel files only.' },
        { status: 400 }
      )
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit' },
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

    // Get user profile for company data
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // Create invoice record with processing status
    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        user_id: user.id,
        status: 'processing',
        original_filename: file.name,
        invoice_number: `TEMP-${Date.now()}`, // Temporary number
        invoice_date: new Date().toISOString().split('T')[0], // Default to today
        customer_name: 'Processing...', // Temporary placeholder
        subtotal: 0,
        gst_amount: 0,
        total_amount: 0,
      })
      .select()
      .single()

    if (!invoice || insertError) {
      console.error('Failed to create invoice record:', insertError)
      console.error('Insert error details:', insertError?.message, insertError?.details)
      return NextResponse.json(
        { success: false, error: `Failed to create invoice record: ${insertError?.message || 'Unknown error'}` },
        { status: 500 }
      )
    }

    try {
      // Convert file to buffer
      const buffer = Buffer.from(await file.arrayBuffer())

      // Upload original file to Supabase Storage
      const originalFileName = `${user.id}/${invoice.id}/original-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(originalFileName, buffer, {
          contentType: file.type,
          upsert: true
        })

      if (uploadError) {
        console.error('Failed to upload original file:', uploadError)
      } else {
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('invoices')
          .getPublicUrl(originalFileName)

        if (urlData?.publicUrl) {
          await supabase
            .from('invoices')
            .update({ original_file_url: urlData.publicUrl })
            .eq('id', invoice.id)
        }
      }

      // Parse the invoice
      const parser = new InvoiceParser()
      const parsedData = await parser.parseFile(buffer, file.name, file.type)
      
      console.log('Parsed invoice data:', parsedData)

      // Ensure we have valid data before updating
      const updateData: any = {
        invoice_number: parsedData.invoiceNumber || invoice.invoice_number,
        invoice_date: parsedData.invoiceDate || new Date().toISOString().split('T')[0],
        status: 'draft',
      }

      // Only add optional fields if they have values
      if (parsedData.dueDate) updateData.due_date = parsedData.dueDate
      if (parsedData.customerName) updateData.customer_name = parsedData.customerName
      if (parsedData.customerUEN) updateData.customer_uen = parsedData.customerUEN
      if (typeof parsedData.subtotal === 'number') updateData.subtotal = parsedData.subtotal
      if (typeof parsedData.gstAmount === 'number') updateData.gst_amount = parsedData.gstAmount
      if (typeof parsedData.totalAmount === 'number') updateData.total_amount = parsedData.totalAmount

      console.log('Update data:', updateData)

      // Update invoice with parsed data
      const { data: updatedInvoice, error: updateError } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoice.id)
        .select()
        .single()

      if (updateError) {
        console.error('Failed to update invoice:', updateError)
        console.error('Update error details:', updateError.message, updateError.details, updateError.hint)
        throw new Error(`Failed to update invoice data: ${updateError.message}`)
      }

      console.log('Invoice updated successfully:', updatedInvoice)

      // Insert line items
      if (parsedData.items.length > 0) {
        const items = parsedData.items.map((item, index) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          amount: item.amount,
          gst_rate: 9, // Default Singapore GST rate
          line_number: index + 1,
        }))

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(items)

        if (itemsError) {
          console.error('Failed to insert items:', itemsError)
        }
      }

      // Generate InvoiceNow XML
      const generator = new InvoiceNowGenerator()
      const xmlContent = generator.generateXML(parsedData, {
        name: profile?.company_name || 'Company Name',
        uen: profile?.company_uen || '12345678A',
        address: profile?.company_address || 'Company Address',
        gstNumber: profile?.gst_number || 'GST12345678',
      })

      // Save XML file
      const xmlFileName = `${user.id}/${invoice.id}/invoicenow-${parsedData.invoiceNumber}.xml`
      const { error: xmlUploadError } = await supabase.storage
        .from('invoices')
        .upload(xmlFileName, Buffer.from(xmlContent), {
          contentType: 'application/xml',
          upsert: true
        })

      if (!xmlUploadError) {
        const { data: urlData } = supabase.storage
          .from('invoices')
          .getPublicUrl(xmlFileName)

        if (urlData?.publicUrl) {
          await supabase
            .from('invoices')
            .update({ converted_xml_url: urlData.publicUrl })
            .eq('id', invoice.id)
        }
      }

      return NextResponse.json({
        success: true,
        invoice: {
          id: invoice.id,
          invoice_number: parsedData.invoiceNumber,
          status: 'draft',
        },
        parsedData,
      })

    } catch (processingError) {
      console.error('Processing error:', processingError)
      
      // Update invoice status to failed
      await supabase
        .from('invoices')
        .update({
          status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Processing failed'
        })
        .eq('id', invoice.id)

      return NextResponse.json(
        { 
          success: false, 
          error: processingError instanceof Error ? processingError.message : 'Failed to process invoice'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'An unexpected error occurred' 
      },
      { status: 500 }
    )
  }
}
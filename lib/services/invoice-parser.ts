import * as XLSX from 'xlsx'
import pdfParse from 'pdf-parse'

export interface ParsedInvoiceData {
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  customerName?: string
  customerUEN?: string
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }>
  subtotal?: number
  gstAmount?: number
  totalAmount?: number
}

export class InvoiceParser {
  async parseFile(file: File): Promise<ParsedInvoiceData> {
    const fileType = file.type
    const buffer = await file.arrayBuffer()

    if (fileType === 'application/pdf') {
      return this.parsePDF(buffer)
    } else if (fileType.includes('spreadsheet') || fileType.includes('excel')) {
      return this.parseExcel(buffer)
    }

    throw new Error('Unsupported file type')
  }

  private async parsePDF(buffer: ArrayBuffer): Promise<ParsedInvoiceData> {
    const data = await pdfParse(Buffer.from(buffer))
    const text = data.text

    // Basic pattern matching for common invoice fields
    const patterns = {
      invoiceNumber: /invoice\s*(?:#|no|number)?\.?\s*:?\s*(\S+)/i,
      invoiceDate: /(?:invoice\s*)?date\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      customerName: /(?:bill\s*to|customer|client)\s*:?\s*([^\n]+)/i,
      uen: /uen\s*:?\s*(\S+)/i,
      total: /(?:total|grand\s*total)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
      gst: /gst\s*(?:amount)?\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    }

    const extracted: ParsedInvoiceData = { items: [] }

    // Extract fields using patterns
    for (const [field, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern)
      if (match) {
        const value = match[1].trim()
        switch (field) {
          case 'invoiceNumber':
            extracted.invoiceNumber = value
            break
          case 'invoiceDate':
            extracted.invoiceDate = this.parseDate(value)
            break
          case 'customerName':
            extracted.customerName = value
            break
          case 'uen':
            extracted.customerUEN = value
            break
          case 'total':
            extracted.totalAmount = parseFloat(value.replace(/,/g, ''))
            break
          case 'gst':
            extracted.gstAmount = parseFloat(value.replace(/,/g, ''))
            break
        }
      }
    }

    // Extract line items (simplified - in production, use more sophisticated parsing)
    const itemPattern = /(\d+)\s+(.+?)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)/g
    let itemMatch
    while ((itemMatch = itemPattern.exec(text)) !== null) {
      const [, quantity, description, unitPrice, amount] = itemMatch
      if (description && !description.match(/total|gst|tax/i)) {
        extracted.items.push({
          description: description.trim(),
          quantity: parseInt(quantity),
          unitPrice: parseFloat(unitPrice.replace(/,/g, '')),
          amount: parseFloat(amount.replace(/,/g, ''))
        })
      }
    }

    return extracted
  }

  private parseExcel(buffer: ArrayBuffer): ParsedInvoiceData {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]

    const extracted: ParsedInvoiceData = { items: [] }

    // Find key fields by searching for labels
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i]
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j]).toLowerCase()
        
        if (cell.includes('invoice') && cell.includes('number')) {
          extracted.invoiceNumber = String(row[j + 1] || data[i + 1]?.[j] || '')
        }
        if (cell.includes('date') && !cell.includes('due')) {
          const dateValue = row[j + 1] || data[i + 1]?.[j]
          extracted.invoiceDate = this.parseDate(String(dateValue))
        }
        if (cell.includes('customer') || cell.includes('bill to')) {
          extracted.customerName = String(row[j + 1] || data[i + 1]?.[j] || '')
        }
        if (cell.includes('uen')) {
          extracted.customerUEN = String(row[j + 1] || data[i + 1]?.[j] || '')
        }
      }
    }

    // Find and parse line items table
    let itemsStartRow = -1
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (row.some(cell => String(cell).toLowerCase().includes('description')) &&
          row.some(cell => String(cell).toLowerCase().includes('amount'))) {
        itemsStartRow = i + 1
        break
      }
    }

    if (itemsStartRow > 0) {
      for (let i = itemsStartRow; i < data.length; i++) {
        const row = data[i]
        if (!row[0] || String(row[0]).toLowerCase().includes('total')) break
        
        const description = String(row[0] || row[1] || '')
        const quantity = parseFloat(String(row[1] || row[2] || 1))
        const unitPrice = parseFloat(String(row[2] || row[3] || 0).replace(/[^0-9.-]/g, ''))
        const amount = parseFloat(String(row[3] || row[4] || 0).replace(/[^0-9.-]/g, ''))
        
        if (description && amount) {
          extracted.items.push({
            description,
            quantity: quantity || 1,
            unitPrice: unitPrice || amount,
            amount
          })
        }
      }
    }

    return extracted
  }

  private parseDate(dateStr: string): string {
    // Convert various date formats to YYYY-MM-DD
    const cleaned = dateStr.trim()
    const date = new Date(cleaned)
    
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
    
    // Try DD/MM/YYYY format
    const ddmmyyyy = cleaned.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`
    }
    
    return cleaned
  }
}
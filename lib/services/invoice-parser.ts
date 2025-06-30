import * as XLSX from 'xlsx'
import { getOCRService, ExtractedInvoiceData } from './ocr-factory'

export interface ParsedInvoiceData extends ExtractedInvoiceData {
  // Additional fields if needed
  vendorAddress?: string
  customerAddress?: string
  paymentTerms?: string
  notes?: string
}

export class InvoiceParser {
  private ocrService = getOCRService()

  /**
   * Parse invoice file (PDF or Excel)
   */
  async parseFile(file: Buffer, fileName: string, mimeType: string): Promise<ParsedInvoiceData> {
    // Handle PDFs with OCR
    if (mimeType === 'application/pdf') {
      return this.parsePDF(file, fileName)
    } 
    
    // Handle Excel files
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || 
        fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return this.parseExcel(file)
    }

    throw new Error(`Unsupported file type: ${mimeType}`)
  }

  /**
   * Parse PDF using OCR service
   */
  private async parsePDF(buffer: Buffer, fileName: string): Promise<ParsedInvoiceData> {
    try {
      console.log('Starting PDF parsing for:', fileName)
      console.log('Buffer size:', buffer.length)
      console.log('OCR Service:', process.env.OCR_SERVICE)
      
      // Use OCR service to extract data
      const extractedData = await this.ocrService.extractInvoiceData(buffer, fileName)
      
      console.log('OCR extraction complete:', extractedData)
      
      // Additional validation or enhancement if needed
      return this.validateAndEnhanceData(extractedData)
    } catch (error) {
      console.error('PDF parsing error:', error)
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Parse Excel file directly
   */
  private parseExcel(buffer: Buffer): ParsedInvoiceData {
    try {
      const workbook = XLSX.read(buffer, { 
        type: 'buffer',
        cellDates: true,
        cellNF: true,
        cellFormula: true
      })
      
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(firstSheet, { 
        header: 1,
        raw: false,
        dateNF: 'yyyy-mm-dd'
      }) as any[][]

      const extracted: ParsedInvoiceData = { items: [] }

      // Find key fields by searching for labels
      for (let i = 0; i < Math.min(30, data.length); i++) {
        const row = data[i]
        if (!row) continue

        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').toLowerCase().trim()
          const nextCell = row[j + 1]
          const cellBelow = data[i + 1]?.[j]
          
          // Invoice Number
          if ((cell.includes('invoice') && (cell.includes('number') || cell.includes('no'))) ||
              cell === 'invoice #' || cell === 'inv no') {
            extracted.invoiceNumber = String(nextCell || cellBelow || '').trim()
          }
          
          // Invoice Date
          if (cell.includes('date') && !cell.includes('due')) {
            const dateValue = nextCell || cellBelow
            if (dateValue) {
              extracted.invoiceDate = this.parseDate(dateValue)
            }
          }
          
          // Due Date
          if (cell.includes('due') && cell.includes('date')) {
            const dateValue = nextCell || cellBelow
            if (dateValue) {
              extracted.dueDate = this.parseDate(dateValue)
            }
          }
          
          // Customer Name
          if (cell.includes('customer') || cell.includes('bill to') || cell.includes('client')) {
            const customerName = String(nextCell || cellBelow || '').trim()
            if (customerName && !customerName.toLowerCase().includes('name')) {
              extracted.customerName = customerName
            }
          }
          
          // Customer UEN
          if (cell.includes('uen') || cell.includes('reg')) {
            const uen = String(nextCell || cellBelow || '').trim()
            if (uen && uen.match(/^[0-9]{8,9}[A-Z]$/)) {
              extracted.customerUEN = uen
            }
          }
          
          // Totals
          if (cell.includes('subtotal') || (cell.includes('sub') && cell.includes('total'))) {
            const amount = this.parseAmount(nextCell || cellBelow)
            if (amount) extracted.subtotal = amount
          }
          
          if (cell.includes('gst') || cell.includes('tax')) {
            const amount = this.parseAmount(nextCell || cellBelow)
            if (amount) extracted.gstAmount = amount
          }
          
          if ((cell.includes('total') && !cell.includes('sub')) || 
              cell.includes('grand total') || 
              cell.includes('amount due')) {
            const amount = this.parseAmount(nextCell || cellBelow)
            if (amount && (!extracted.totalAmount || amount > extracted.totalAmount)) {
              extracted.totalAmount = amount
            }
          }
        }
      }

      // Find and parse line items table
      const itemsData = this.findItemsTable(data)
      if (itemsData.items.length > 0) {
        extracted.items = itemsData.items
      }

      // Calculate missing totals if we have items
      if (extracted.items.length > 0) {
        if (!extracted.subtotal) {
          extracted.subtotal = extracted.items.reduce((sum, item) => sum + item.amount, 0)
        }
        if (!extracted.gstAmount && extracted.totalAmount && extracted.subtotal) {
          extracted.gstAmount = extracted.totalAmount - extracted.subtotal
        }
        if (!extracted.totalAmount && extracted.subtotal) {
          extracted.totalAmount = extracted.subtotal + (extracted.gstAmount || extracted.subtotal * 0.09)
        }
      }

      return this.validateAndEnhanceData(extracted)
    } catch (error) {
      console.error('Excel parsing error:', error)
      throw new Error(`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Find and extract items table from Excel data
   */
  private findItemsTable(data: any[][]): { items: ParsedInvoiceData['items'] } {
    const items: ParsedInvoiceData['items'] = []
    let headerRow = -1
    let descCol = -1, qtyCol = -1, priceCol = -1, amountCol = -1

    // Find header row
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (!row) continue

      let hasDesc = false, hasAmount = false
      
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').toLowerCase()
        if (cell.includes('description') || cell.includes('item') || cell.includes('product')) {
          hasDesc = true
          descCol = j
        }
        if (cell.includes('qty') || cell.includes('quantity')) {
          qtyCol = j
        }
        if (cell.includes('price') || cell.includes('rate') || cell.includes('unit')) {
          priceCol = j
        }
        if (cell.includes('amount') || cell.includes('total')) {
          hasAmount = true
          amountCol = j
        }
      }

      if (hasDesc || hasAmount) {
        headerRow = i
        break
      }
    }

    if (headerRow === -1) return { items }

    // Default column positions if not found
    if (descCol === -1) descCol = 0
    if (amountCol === -1) amountCol = Math.max(3, qtyCol + 2, priceCol + 1)
    if (qtyCol === -1) qtyCol = Math.max(1, descCol + 1)
    if (priceCol === -1) priceCol = Math.max(2, qtyCol + 1)

    // Extract items
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[descCol]) continue

      const description = String(row[descCol]).trim()
      
      // Stop if we hit totals section
      if (description.toLowerCase().includes('total') || 
          description.toLowerCase().includes('subtotal') ||
          description.toLowerCase().includes('gst') ||
          description.toLowerCase().includes('tax')) {
        break
      }

      const quantity = this.parseNumber(row[qtyCol]) || 1
      const unitPrice = this.parseAmount(row[priceCol]) || 0
      const amount = this.parseAmount(row[amountCol]) || (quantity * unitPrice)

      if (description && amount > 0) {
        items.push({
          description,
          quantity,
          unitPrice: unitPrice || (amount / quantity),
          amount
        })
      }
    }

    return { items }
  }

  /**
   * Parse date from various formats
   */
  private parseDate(value: any): string {
    if (!value) return new Date().toISOString().split('T')[0]

    // If already a Date object
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]
    }

    const dateStr = String(value).trim()
    console.log('Parsing date:', dateStr)

    // Handle DD/MM/YYYY or DD-MM-YYYY format (Singapore standard)
    const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy
      const formatted = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      console.log('Formatted DD/MM/YYYY to:', formatted)
      return formatted
    }

    // Handle DD-MM-YY format
    const ddmmyy = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/)
    if (ddmmyy) {
      const [, day, month, yearShort] = ddmmyy
      const year = '20' + yearShort // Assume 2000s
      const formatted = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      console.log('Formatted DD/MM/YY to:', formatted)
      return formatted
    }

    // Handle DD MMM YYYY format
    const ddMmmYyyy = dateStr.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i)
    if (ddMmmYyyy) {
      const monthMap: Record<string, string> = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      }
      const [, day, monthName, year] = ddMmmYyyy
      const month = monthMap[monthName.toLowerCase()]
      if (month) {
        const formatted = `${year}-${month}-${day.padStart(2, '0')}`
        console.log('Formatted DD MMM YYYY to:', formatted)
        return formatted
      }
    }

    // Try standard parsing as last resort
    try {
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch (e) {
      console.error('Date parsing failed:', e)
    }

    // Return today's date as fallback
    console.warn('Could not parse date, using today:', dateStr)
    return new Date().toISOString().split('T')[0]
  }

  /**
   * Parse amount from various formats
   */
  private parseAmount(value: any): number | undefined {
    if (typeof value === 'number') return value
    if (!value) return undefined

    const cleaned = String(value)
      .replace(/[^0-9.,\-]/g, '')
      .replace(/,/g, '')
    
    const amount = parseFloat(cleaned)
    return isNaN(amount) ? undefined : Math.abs(amount)
  }

  /**
   * Parse number
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value
    if (!value) return 0

    const cleaned = String(value).replace(/[^0-9.\-]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
  }

  /**
   * Validate and enhance extracted data
   */
  private validateAndEnhanceData(data: ParsedInvoiceData): ParsedInvoiceData {
    // Ensure required fields
    if (!data.invoiceNumber) {
      data.invoiceNumber = `INV-${Date.now()}`
    }

    if (!data.invoiceDate) {
      data.invoiceDate = new Date().toISOString().split('T')[0]
    }

    // Validate amounts
    if (data.items.length > 0) {
      const calculatedSubtotal = data.items.reduce((sum, item) => sum + item.amount, 0)
      
      if (!data.subtotal || Math.abs(data.subtotal - calculatedSubtotal) > 0.01) {
        data.subtotal = calculatedSubtotal
      }

      // Singapore GST is 9%
      if (!data.gstAmount && data.subtotal) {
        // Check if total is different from subtotal (indicating GST included)
        if (data.totalAmount && data.totalAmount > data.subtotal) {
          data.gstAmount = data.totalAmount - data.subtotal
        } else {
          // No GST indicated - might be non-GST registered or exempt
          data.gstAmount = 0
        }
      }

      if (!data.totalAmount) {
        data.totalAmount = (data.subtotal || 0) + (data.gstAmount || 0)
      }
    }

    // Validate UEN format
    if (data.customerUEN && !data.customerUEN.match(/^[0-9]{8,9}[A-Z]$/)) {
      // Try to clean and fix UEN
      const cleaned = data.customerUEN.toUpperCase().replace(/[^0-9A-Z]/g, '')
      if (cleaned.match(/^[0-9]{8,9}[A-Z]$/)) {
        data.customerUEN = cleaned
      }
    }

    return data
  }
}
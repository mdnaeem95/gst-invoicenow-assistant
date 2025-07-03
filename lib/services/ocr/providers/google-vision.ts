// lib/services/ocr/providers/google-vision.ts
import { ImageAnnotatorClient } from '@google-cloud/vision'
import { ExtractedInvoiceData, OCRProvider } from '../types'

export class GoogleVisionService implements OCRProvider {
  name = 'google-vision'
  private client: ImageAnnotatorClient | null = null
  private initialized = false

  constructor() {
    this.initialize()
  }

  private initialize() {
    try {
      this.client = new ImageAnnotatorClient({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        projectId: process.env.GOOGLE_CLOUD_PROJECT
      })
      this.initialized = true
      console.log('Google Vision client initialized')
    } catch (error) {
      console.error('Failed to initialize Google Vision:', error)
      this.initialized = false
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.client !== null
  }

  async extractInvoiceData(file: Buffer, fileName: string): Promise<ExtractedInvoiceData> {
    if (!this.client) {
      throw new Error('Google Vision client not initialized')
    }

    try {
      console.log(`Google Vision: Processing ${fileName}`)
      
      // Use document text detection for better invoice results
      const [result] = await this.client.documentTextDetection({
        image: { content: file },
        imageContext: {
          languageHints: ['en', 'zh'] // English and Chinese for Singapore
        }
      })

      if (!result.fullTextAnnotation) {
        throw new Error('No text detected in document')
      }

      const fullText = result.fullTextAnnotation.text || ''
      const pages = result.fullTextAnnotation.pages || []
      
      // Extract structured data
      const extractedData = this.parseStructuredText(fullText, pages)
      
      // Extract tables if present
      if (pages.length > 0) {
        const tables = this.extractTables(pages[0])
        extractedData.items = this.parseLineItems(tables, fullText)
      }

      console.log('Google Vision extraction complete')
      return extractedData
    } catch (error) {
      console.error('Google Vision extraction error:', error)
      throw new Error(`Google Vision extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private parseStructuredText(text: string, pages: any[]): ExtractedInvoiceData {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line)
    const extracted: ExtractedInvoiceData = { items: [] }

    // Create a map of text blocks with their positions
    const textBlocks = this.createTextBlockMap(pages)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nextLine = lines[i + 1] || ''
      const prevLine = lines[i - 1] || ''

      // Invoice Number
      if (this.isInvoiceNumberLabel(line)) {
        extracted.invoiceNumber = this.extractValueFromLabel(line, nextLine, /([A-Z0-9\-\/]+)/)
      }

      // Invoice Date
      if (this.isInvoiceDateLabel(line) && !extracted.invoiceDate) {
        const dateValue = this.extractDateFromContext(line, nextLine, lines.slice(i, i + 3))
        if (dateValue) extracted.invoiceDate = dateValue
      }

      // Due Date
      if (this.isDueDateLabel(line) && !extracted.dueDate) {
        const dateValue = this.extractDateFromContext(line, nextLine, lines.slice(i, i + 3))
        if (dateValue) extracted.dueDate = dateValue
      }

      // Customer Information
      if (this.isCustomerLabel(line) && !extracted.customerName) {
        // Look for customer name in next non-empty lines
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const customerLine = lines[j].trim()
          if (customerLine && !this.isLabel(customerLine)) {
            extracted.customerName = customerLine
            
            // Check next lines for UEN
            const uenLine = lines[j + 1] || ''
            const uenMatch = this.extractUEN(uenLine)
            if (uenMatch) {
              extracted.customerUEN = uenMatch
            }
            break
          }
        }
      }

      // Direct UEN extraction
      const uenMatch = this.extractUEN(line)
      if (uenMatch && !extracted.customerUEN && i > 5) { // Skip header area
        extracted.customerUEN = uenMatch
      }

      // Vendor/Company Information (usually in header)
      if (i < 10 && !extracted.vendorName) {
        // Check if line looks like a company name
        if (this.isCompanyName(line) && !this.isLabel(line)) {
          extracted.vendorName = line
          
          // Check surrounding lines for vendor UEN and GST
          const nearbyLines = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3))
          nearbyLines.forEach(nearbyLine => {
            const vendorUEN = this.extractUEN(nearbyLine)
            if (vendorUEN) extracted.vendorUEN = vendorUEN
            
            const gstNumber = this.extractGSTNumber(nearbyLine)
            if (gstNumber) extracted.vendorGSTNumber = gstNumber
          })
        }
      }

      // Financial Amounts
      if (this.isSubtotalLabel(line)) {
        extracted.subtotal = this.extractAmount(line) || this.extractAmount(nextLine)
      }

      if (this.isGSTLabel(line) && !this.isGSTRegistrationLabel(line)) {
        extracted.gstAmount = this.extractAmount(line) || this.extractAmount(nextLine)
      }

      if (this.isTotalLabel(line) && !this.isSubtotalLabel(line)) {
        const amount = this.extractAmount(line) || this.extractAmount(nextLine)
        if (amount && (!extracted.totalAmount || amount > extracted.totalAmount)) {
          extracted.totalAmount = amount
        }
      }
    }

    // Post-processing
    this.inferMissingFields(extracted)

    return extracted
  }

  private createTextBlockMap(pages: any[]): Map<string, any> {
    const blockMap = new Map()
    
    if (pages.length > 0 && pages[0].blocks) {
      pages[0].blocks.forEach((block: any) => {
        if (block.paragraphs) {
          block.paragraphs.forEach((paragraph: any) => {
            if (paragraph.words) {
              const text = paragraph.words
                .map((word: any) => 
                  word.symbols.map((s: any) => s.text).join('')
                ).join(' ')
              
              blockMap.set(text, {
                boundingBox: paragraph.boundingBox,
                confidence: paragraph.confidence
              })
            }
          })
        }
      })
    }
    
    return blockMap
  }

  private extractTables(page: any): any[] {
    const tables: any[] = []
    
    if (!page.tables) return tables
    
    page.tables.forEach((table: any) => {
      const extractedTable: any[][] = []
      
      table.bodyRows.forEach((row: any, rowIndex: number) => {
        extractedTable[rowIndex] = []
        row.cells.forEach((cell: any, colIndex: number) => {
          const cellText = this.extractTextFromLayout(cell.layout)
          extractedTable[rowIndex][colIndex] = cellText
        })
      })
      
      tables.push(extractedTable)
    })
    
    return tables
  }

  private extractTextFromLayout(layout: any): string {
    if (!layout || !layout.textAnchor || !layout.textAnchor.textSegments) {
      return ''
    }
    
    return layout.textAnchor.textSegments
      .map((segment: any) => segment.content || '')
      .join(' ')
      .trim()
  }

  private parseLineItems(tables: any[], fullText: string): ExtractedInvoiceData['items'] {
    const items: ExtractedInvoiceData['items'] = []
    
    // First, try to find items from tables
    for (const table of tables) {
      if (table.length < 2) continue
      
      // Identify header row
      const headerRow = table[0]
      const columnMap = this.identifyColumns(headerRow)
      
      if (columnMap.description === -1) continue // Not an item table
      
      // Parse data rows
      for (let i = 1; i < table.length; i++) {
        const row = table[i]
        if (!row || row.length === 0) continue
        
        const description = row[columnMap.description] || ''
        
        // Skip if it looks like a total row
        if (this.isTotalLabel(description)) break
        
        const item = {
          description: description.trim(),
          quantity: this.parseNumber(row[columnMap.quantity]) || 1,
          unitPrice: this.parseAmount(row[columnMap.unitPrice]) || 0,
          amount: this.parseAmount(row[columnMap.amount]) || 0
        }
        
        if (item.description && item.amount > 0) {
          items.push(item)
        }
      }
    }
    
    // If no items found in tables, try to extract from text
    if (items.length === 0) {
      items.push(...this.extractItemsFromText(fullText))
    }
    
    return items
  }

  private identifyColumns(headerRow: string[]): {
    description: number
    quantity: number
    unitPrice: number
    amount: number
  } {
    const map = {
      description: -1,
      quantity: -1,
      unitPrice: -1,
      amount: -1
    }
    
    headerRow.forEach((header, index) => {
      const lower = header.toLowerCase()
      
      if (lower.includes('description') || lower.includes('item') || 
          lower.includes('service') || lower.includes('product')) {
        map.description = index
      } else if (lower.includes('qty') || lower.includes('quantity')) {
        map.quantity = index
      } else if (lower.includes('price') || lower.includes('rate') || 
                 lower.includes('unit')) {
        map.unitPrice = index
      } else if (lower.includes('amount') || lower.includes('total') || 
                 lower.includes('value')) {
        map.amount = index
      }
    })
    
    // Set defaults if not found
    if (map.description === -1) map.description = 0
    if (map.amount === -1) map.amount = headerRow.length - 1
    if (map.quantity === -1 && headerRow.length > 2) map.quantity = 1
    if (map.unitPrice === -1 && headerRow.length > 3) map.unitPrice = 2
    
    return map
  }

  private extractItemsFromText(text: string): ExtractedInvoiceData['items'] {
    const items: ExtractedInvoiceData['items'] = []
    const lines = text.split('\n')
    
    // Look for lines that appear to be item descriptions followed by amounts
    const itemPattern = /^(.+?)\s+\$?\s*([0-9,]+\.?\d*)\s*$/
    
    for (const line of lines) {
      const match = line.match(itemPattern)
      if (match && !this.isLabel(match[1])) {
        items.push({
          description: match[1].trim(),
          quantity: 1,
          unitPrice: this.parseAmount(match[2]) || 0,
          amount: this.parseAmount(match[2]) || 0
        })
      }
    }
    
    return items
  }

  // Label detection methods
  private isInvoiceNumberLabel(text: string): boolean {
    const lower = text.toLowerCase()
    return /invoice\s*(number|no\.?|#)|inv\s*(no\.?|#)/i.test(lower)
  }

  private isInvoiceDateLabel(text: string): boolean {
    const lower = text.toLowerCase()
    return /invoice\s*date|date\s*of\s*invoice|billing\s*date/i.test(lower) && 
           !/due|payment/i.test(lower)
  }

  private isDueDateLabel(text: string): boolean {
    const lower = text.toLowerCase()
    return /due\s*date|payment\s*due|due\s*by/i.test(lower)
  }

  private isCustomerLabel(text: string): boolean {
    const lower = text.toLowerCase()
    return /bill\s*to|customer|client|sold\s*to|invoice\s*to/i.test(lower)
  }

  private isSubtotalLabel(text: string): boolean {
    const lower = text.toLowerCase()
    return /sub\s*total|subtotal|net\s*amount/i.test(lower)
  }

  private isGSTLabel(text: string): boolean {
    const lower = text.toLowerCase()
    return /\bgst\b|tax|vat/i.test(lower)
  }

  private isGSTRegistrationLabel(text: string): boolean {
    const lower = text.toLowerCase()
    return /gst\s*(reg|registration|number|no)/i.test(lower)
  }

  private isTotalLabel(text: string): boolean {
    const lower = text.toLowerCase()
    return /\btotal\b|grand\s*total|amount\s*due|balance\s*due/i.test(lower) && 
           !/sub/i.test(lower)
  }

  private isLabel(text: string): boolean {
    return this.isInvoiceNumberLabel(text) || 
           this.isInvoiceDateLabel(text) || 
           this.isDueDateLabel(text) ||
           this.isCustomerLabel(text) ||
           this.isSubtotalLabel(text) ||
           this.isGSTLabel(text) ||
           this.isTotalLabel(text) ||
           /^(from|to|date|invoice|bill)$/i.test(text)
  }

  private isCompanyName(text: string): boolean {
    // Check if it looks like a company name
    return /\b(pte|ltd|llp|corporation|corp|company|co\.?|services|trading|enterprise)\b/i.test(text) &&
           text.length > 5 &&
           text.length < 100
  }

  // Value extraction methods
  private extractValueFromLabel(label: string, nextLine: string, pattern: RegExp): string | undefined {
    // Try to extract from same line first
    const colonSplit = label.split(':')
    if (colonSplit.length > 1) {
      const value = colonSplit[1].trim()
      const match = value.match(pattern)
      if (match) return match[1]
    }
    
    // Try next line
    const match = nextLine.match(pattern)
    return match ? match[1] : undefined
  }

  private extractDateFromContext(line: string, nextLine: string, context: string[]): string | undefined {
    const datePatterns = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i,
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i
    ]
    
    // Check current line
    for (const pattern of datePatterns) {
      const match = line.match(pattern)
      if (match) return this.normalizeDate(match[0])
    }
    
    // Check context lines
    for (const contextLine of context) {
      for (const pattern of datePatterns) {
        const match = contextLine.match(pattern)
        if (match) return this.normalizeDate(match[0])
      }
    }
    
    return undefined
  }

  private normalizeDate(dateStr: string): string {
    try {
      // Handle DD/MM/YYYY or DD-MM-YYYY
      const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
      if (ddmmyyyy) {
        const [, day, month, year] = ddmmyyyy
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }
      
      // Handle Month DD, YYYY
      const monthDDYYYY = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i)
      if (monthDDYYYY) {
        const monthMap: Record<string, string> = {
          'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
          'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
          'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        }
        const [, monthName, day, year] = monthDDYYYY
        const month = monthMap[monthName.toLowerCase()]
        return `${year}-${month}-${day.padStart(2, '0')}`
      }
      
      // Try standard parsing
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch (error) {
      console.error('Date parsing error:', error)
    }
    
    return dateStr
  }

  private extractUEN(text: string): string | undefined {
    // Singapore UEN patterns
    const patterns = [
      /\b([0-9]{8,9}[A-Z])\b/,
      /\b([TRS][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z])\b/,
      /UEN[:\s]*([0-9]{8,9}[A-Z])/i,
      /Registration[:\s]*([0-9]{8,9}[A-Z])/i
    ]
    
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return match[1]
    }
    
    return undefined
  }

  private extractGSTNumber(text: string): string | undefined {
    const patterns = [
      /GST[:\s]*([0-9]{8})/i,
      /GST\s*Reg[:\s]*([0-9]{8})/i,
      /(GST[0-9]{8})/,
      /(M[0-9]-[0-9]{7}-[0-9])/
    ]
    
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const gstNumber = match[1]
        // Ensure it starts with GST
        if (/^[0-9]{8}$/.test(gstNumber)) {
          return 'GST' + gstNumber
        }
        return gstNumber
      }
    }
    
    return undefined
  }

  private extractAmount(text: string): number | undefined {
    if (!text) return undefined
    
    // Remove currency symbols and clean up
    const cleaned = text
      .replace(/[^0-9.,\-\s]/g, '')
      .replace(/,/g, '')
      .trim()
    
    // Find number patterns
    const patterns = [
      /^\s*(\d+\.?\d*)\s*$/,
      /\s+(\d+\.?\d*)\s*$/,
      /^\s*(\d+\.?\d*)\s+/
    ]
    
    for (const pattern of patterns) {
      const match = cleaned.match(pattern)
      if (match) {
        const amount = parseFloat(match[1])
        return isNaN(amount) ? undefined : amount
      }
    }
    
    // Last resort - try to parse the whole string
    const amount = parseFloat(cleaned)
    return isNaN(amount) ? undefined : amount
  }

  private parseAmount(value: any): number | undefined {
    if (typeof value === 'number') return value
    if (!value) return undefined
    
    return this.extractAmount(String(value))
  }

  private parseNumber(value: any): number {
    if (typeof value === 'number') return value
    if (!value) return 0
    
    const cleaned = String(value).replace(/[^0-9.\-]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
  }

  private inferMissingFields(data: ExtractedInvoiceData): void {
    // Infer GST amount if we have subtotal and total
    if (data.subtotal && data.totalAmount && !data.gstAmount) {
      data.gstAmount = data.totalAmount - data.subtotal
    }
    
    // Infer subtotal from items
    if (!data.subtotal && data.items.length > 0) {
      data.subtotal = data.items.reduce((sum, item) => sum + item.amount, 0)
    }
    
    // Calculate expected GST (9% for Singapore)
    if (data.subtotal && !data.gstAmount) {
      data.gstAmount = Math.round(data.subtotal * 0.09 * 100) / 100
    }
    
    // Calculate total if missing
    if (data.subtotal && data.gstAmount && !data.totalAmount) {
      data.totalAmount = data.subtotal + data.gstAmount
    }
  }

  getConfidenceScore(data: ExtractedInvoiceData): number {
    let score = 0
    let maxScore = 0
    
    // Required fields (higher weight)
    const requiredFields = [
      { field: 'invoiceNumber', weight: 2 },
      { field: 'invoiceDate', weight: 2 },
      { field: 'customerName', weight: 2 },
      { field: 'totalAmount', weight: 2 }
    ]
    
    requiredFields.forEach(({ field, weight }) => {
      maxScore += weight
      if (data[field as keyof ExtractedInvoiceData]) {
        score += weight
      }
    })
    
    // Optional fields (lower weight)
    const optionalFields = [
      { field: 'customerUEN', weight: 1 },
      { field: 'vendorName', weight: 1 },
      { field: 'vendorUEN', weight: 1 },
      { field: 'gstAmount', weight: 1 },
      { field: 'subtotal', weight: 1 }
    ]
    
    optionalFields.forEach(({ field, weight }) => {
      maxScore += weight
      if (data[field as keyof ExtractedInvoiceData]) {
        score += weight
      }
    })
    
    // Line items
    if (data.items && data.items.length > 0) {
      score += 2
      maxScore += 2
    }
    
    // Financial accuracy check
    if (data.subtotal && data.gstAmount && data.totalAmount) {
      const calculatedTotal = data.subtotal + data.gstAmount
      const difference = Math.abs(calculatedTotal - data.totalAmount)
      if (difference < 1) {
        score += 1
      }
      maxScore += 1
    }
    
    return maxScore > 0 ? score / maxScore : 0
  }
}
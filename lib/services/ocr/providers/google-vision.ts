// lib/services/ocr/providers/google-vision.ts
import { ImageAnnotatorClient } from '@google-cloud/vision'
import { ExtractedInvoiceData, OCRProvider } from '../types'

export class GoogleVisionService implements OCRProvider {
  name = 'google-vision'
  private client: ImageAnnotatorClient

  constructor() {
    this.client = new ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_CLOUD_KEYFILE
    })
  }

  async extractInvoiceData(file: Buffer, fileName: string): Promise<ExtractedInvoiceData> {
    try {
      // Use document text detection for better results on invoices
      const [result] = await this.client.documentTextDetection({
        image: { content: file }
      })

      const fullText = result.fullTextAnnotation?.text || ''
      const blocks = result.fullTextAnnotation?.pages?.[0]?.blocks || []

      // Parse the text to extract invoice data
      return this.parseInvoiceText(fullText, blocks)
    } catch (error) {
      console.error('Google Vision error:', error)
      throw new Error(`Google Vision extraction failed: ${error.message}`)
    }
  }

  private parseInvoiceText(text: string, blocks: any[]): ExtractedInvoiceData {
    const lines = text.split('\n')
    const extracted: ExtractedInvoiceData = { items: [] }

    // Extract using patterns and position-based logic
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const nextLine = lines[i + 1]?.trim() || ''

      // Invoice number patterns
      if (/invoice\s*(number|no|#)/i.test(line)) {
        const match = nextLine.match(/([A-Z0-9\-\/]+)/i) || line.match(/:\s*([A-Z0-9\-\/]+)/i)
        if (match) extracted.invoiceNumber = match[1]
      }

      // Date patterns
      if (/invoice\s*date/i.test(line) && !extracted.invoiceDate) {
        extracted.invoiceDate = this.extractDate(nextLine) || this.extractDate(line)
      }
      if (/due\s*date/i.test(line) && !extracted.dueDate) {
        extracted.dueDate = this.extractDate(nextLine) || this.extractDate(line)
      }

      // Customer info
      if (/bill\s*to|customer|client/i.test(line) && !extracted.customerName) {
        // Look for the next non-empty line
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const customerLine = lines[j].trim()
          if (customerLine && !customerLine.match(/^(address|tel|fax|email|uen)/i)) {
            extracted.customerName = customerLine
            break
          }
        }
      }

      // UEN pattern
      if (/uen|reg\.?\s*no/i.test(line)) {
        const uenMatch = (nextLine + ' ' + line).match(/([0-9]{8,9}[A-Z])/i)
        if (uenMatch) extracted.customerUEN = uenMatch[1].toUpperCase()
      }

      // Financial amounts
      if (/subtotal/i.test(line)) {
        extracted.subtotal = this.extractAmount(line) || this.extractAmount(nextLine)
      }
      if (/gst|tax/i.test(line) && !/gst\s*reg/i.test(line)) {
        extracted.gstAmount = this.extractAmount(line) || this.extractAmount(nextLine)
      }
      if (/total|amount\s*due/i.test(line) && !/sub/i.test(line)) {
        const amount = this.extractAmount(line) || this.extractAmount(nextLine)
        if (amount && (!extracted.totalAmount || amount > extracted.totalAmount)) {
          extracted.totalAmount = amount
        }
      }
    }

    // Extract line items using table detection
    extracted.items = this.extractLineItems(text, blocks)

    return extracted
  }

  private extractDate(text: string): string | undefined {
    // Common date patterns
    const patterns = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i,
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        // Convert to ISO format
        // Implementation depends on pattern matched
        return this.normalizeDate(match[0])
      }
    }

    return undefined
  }

  private extractAmount(text: string): number | undefined {
    // Remove currency symbols and extract number
    const cleanText = text.replace(/[^0-9.,\-\s]/g, '')
    const matches = cleanText.match(/\d+([,.]?\d{3})*([.]\d{1,2})?/)
    
    if (matches) {
      const amount = parseFloat(matches[0].replace(/,/g, ''))
      return isNaN(amount) ? undefined : amount
    }

    return undefined
  }

  private extractLineItems(text: string, blocks: any[]): ExtractedInvoiceData['items'] {
    // Implement table detection logic
    // This is a simplified version - you'd want more sophisticated table detection
    const items: ExtractedInvoiceData['items'] = []
    
    // Find table-like structures in blocks
    // ... implementation details ...

    return items
  }

  private normalizeDate(dateStr: string): string {
    // Convert various date formats to ISO format
    // Implementation details...
    const date = new Date(dateStr)
    return date.toISOString().split('T')[0]
  }
}

// lib/services/ocr/providers/template-matching.ts
export class TemplateMatchingService {
  private templates: Map<string, InvoiceTemplate>

  constructor() {
    this.templates = this.loadTemplates()
  }

  async matchTemplate(file: Buffer, fileName: string): Promise<ExtractedInvoiceData & { confidence: number } | null> {
    // Implement template matching logic
    // This would match against known invoice formats from frequent customers
    return null
  }

  private loadTemplates(): Map<string, InvoiceTemplate> {
    // Load saved templates from database
    return new Map()
  }
}

interface InvoiceTemplate {
  id: string
  customerName: string
  patterns: {
    invoiceNumber: RegExp
    date: RegExp
    amount: RegExp
  }
  fieldPositions: {
    [key: string]: { x: number; y: number; width: number; height: number }
  }
}
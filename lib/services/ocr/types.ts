// lib/services/ocr/types.ts
export interface OCRProvider {
  name: string
  extractInvoiceData(file: Buffer, fileName?: string): Promise<ExtractedInvoiceData>
  getConfidenceScore(data: ExtractedInvoiceData): number
  isAvailable(): boolean
}

export interface ExtractedInvoiceData {
  // Basic invoice info
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  
  // Customer details
  customerName?: string
  customerUEN?: string
  customerAddress?: string
  customerEmail?: string
  customerPhone?: string
  
  // Vendor details
  vendorName?: string
  vendorUEN?: string
  vendorAddress?: string
  vendorGSTNumber?: string
  
  // Financial details
  subtotal?: number
  gstAmount?: number
  totalAmount?: number
  currency?: string
  
  // Line items
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
    gstRate?: number
    taxCategory?: 'S' | 'Z' | 'E'
  }>
  
  // Metadata
  paymentTerms?: string
  notes?: string
}

export interface OCRResult extends ExtractedInvoiceData {
  confidence: number
  provider: string
  processingTime: number
  warnings?: string[]
  rawText?: string
  structuredData?: any
}

export interface TemplatePattern {
  id: string
  name: string
  customerUEN?: string
  patterns: {
    invoiceNumber?: RegExp
    invoiceDate?: RegExp
    totalAmount?: RegExp
    customerInfo?: RegExp
  }
  fieldMappings: {
    [key: string]: {
      pattern?: RegExp
      position?: { x: number; y: number; width: number; height: number }
      transform?: (value: string) => any
    }
  }
  confidence: number
  lastUsed: Date
  useCount: number
}

export interface OCROptions {
  preferredProvider?: string
  minConfidence?: number
  enableTemplateMatching?: boolean
  maxRetries?: number
  language?: string
  enhanceImage?: boolean
}
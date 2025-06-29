import { TextractService } from './aws-textract'

export interface OCRService {
  extractInvoiceData(file: Buffer, fileName?: string): Promise<ExtractedInvoiceData>
}

export interface ExtractedInvoiceData {
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  customerName?: string
  customerUEN?: string
  vendorName?: string
  vendorUEN?: string
  subtotal?: number
  gstAmount?: number
  totalAmount?: number
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }>
}

/**
 * Factory to create the appropriate OCR service based on environment configuration
 */
export function createOCRService(): OCRService {
  const service = process.env.OCR_SERVICE || 'aws'

  switch (service) {
    case 'aws':
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS credentials not configured')
      }
      return new TextractService()

    default:
      throw new Error(`Unknown OCR service: ${service}`)
  }
}

/**
 * Singleton instance
 */
let ocrService: OCRService | null = null

export function getOCRService(): OCRService {
  if (!ocrService) {
    ocrService = createOCRService()
  }
  return ocrService
}
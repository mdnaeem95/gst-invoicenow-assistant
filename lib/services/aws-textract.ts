import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

// Initialize AWS clients
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

interface ExtractedInvoiceData {
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

export class TextractService {
  private bucketName: string

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || 'gst-invoicenow-temp'
  }

  /**
   * Upload file to S3 temporarily for Textract processing
   */
  private async uploadToS3(file: Buffer, fileName: string): Promise<string> {
    const key = `temp-invoices/${Date.now()}-${fileName}`
    
    await s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file,
      ContentType: 'application/pdf',
    }))

    return key
  }

  /**
   * Extract text and forms from invoice using AWS Textract
   */
  async extractInvoiceData(file: Buffer, fileName: string): Promise<ExtractedInvoiceData> {
    try {
      // Upload to S3 first (Textract works better with S3)
      const s3Key = await this.uploadToS3(file, fileName)

      // Analyze document with Textract
      const command = new AnalyzeDocumentCommand({
        Document: {
          S3Object: {
            Bucket: this.bucketName,
            Name: s3Key,
          },
        },
        FeatureTypes: ['FORMS', 'TABLES'],
      })

      const response = await textractClient.send(command)
      
      // Parse the Textract response
      const extractedData = this.parseTextractResponse(response)

      // Clean up S3 file after processing
      // Note: In production, you might want to keep this for audit purposes
      
      return extractedData
    } catch (error) {
      console.error('Textract error:', error)
      throw new Error('Failed to extract invoice data')
    }
  }

  /**
   * Parse Textract response to extract invoice fields
   */
  private parseTextractResponse(response: any): ExtractedInvoiceData {
    const blocks = response.Blocks || []
    const keyValuePairs = this.extractKeyValuePairs(blocks)
    const tables = this.extractTables(blocks)
    
    // Extract invoice fields using common patterns
    const invoiceData: ExtractedInvoiceData = {
      invoiceNumber: this.findValue(keyValuePairs, ['invoice number', 'invoice no', 'inv no', 'invoice #']),
      invoiceDate: this.findDateValue(keyValuePairs, ['invoice date', 'date', 'bill date']),
      dueDate: this.findDateValue(keyValuePairs, ['due date', 'payment due', 'due by']),
      customerName: this.findValue(keyValuePairs, ['bill to', 'customer', 'client', 'sold to']),
      customerUEN: this.findUENValue(keyValuePairs, ['customer uen', 'bill to uen', 'client uen']),
      vendorName: this.findValue(keyValuePairs, ['from', 'vendor', 'company', 'seller']),
      vendorUEN: this.findUENValue(keyValuePairs, ['company uen', 'vendor uen', 'our uen']),
      subtotal: this.findCurrencyValue(keyValuePairs, ['subtotal', 'sub total', 'net amount']),
      gstAmount: this.findCurrencyValue(keyValuePairs, ['gst', 'tax', 'gst amount', 'tax amount']),
      totalAmount: this.findCurrencyValue(keyValuePairs, ['total', 'grand total', 'total amount', 'amount due']),
      items: this.extractLineItems(tables),
    }

    // If no customer name found in key-value pairs, try to extract from address blocks
    if (!invoiceData.customerName) {
      invoiceData.customerName = this.extractCustomerFromAddress(blocks)
    }

    return invoiceData
  }

  /**
   * Extract key-value pairs from Textract blocks
   */
  private extractKeyValuePairs(blocks: any[]): Map<string, string> {
    const keyValuePairs = new Map<string, string>()
    const keyMap = new Map<string, any>()
    const valueMap = new Map<string, any>()
    const blockMap = new Map<string, any>()

    // First pass: create maps
    blocks.forEach(block => {
      blockMap.set(block.Id, block)
      if (block.BlockType === 'KEY_VALUE_SET') {
        if (block.EntityTypes?.includes('KEY')) {
          keyMap.set(block.Id, block)
        } else {
          valueMap.set(block.Id, block)
        }
      }
    })

    // Second pass: extract key-value pairs
    keyMap.forEach((keyBlock, keyId) => {
      const valueId = keyBlock.Relationships?.find((r: any) => r.Type === 'VALUE')?.Ids?.[0]
      if (valueId) {
        const key = this.getTextFromRelationships(keyBlock, blockMap)
        const valueBlock = valueMap.get(valueId)
        const value = valueBlock ? this.getTextFromRelationships(valueBlock, blockMap) : ''
        
        if (key && value) {
          keyValuePairs.set(key.toLowerCase().trim(), value.trim())
        }
      }
    })

    return keyValuePairs
  }

  /**
   * Extract tables from Textract blocks
   */
  private extractTables(blocks: any[]): any[] {
    const tables: any[] = []
    const blockMap = new Map<string, any>()

    blocks.forEach(block => {
      blockMap.set(block.Id, block)
    })

    blocks.filter(block => block.BlockType === 'TABLE').forEach(tableBlock => {
      const table: any[] = []
      
      if (tableBlock.Relationships) {
        tableBlock.Relationships.forEach((relationship: any) => {
          if (relationship.Type === 'CHILD') {
            relationship.Ids.forEach((cellId: string) => {
              const cell = blockMap.get(cellId)
              if (cell?.BlockType === 'CELL') {
                const rowIndex = cell.RowIndex - 1
                const colIndex = cell.ColumnIndex - 1
                
                if (!table[rowIndex]) {
                  table[rowIndex] = []
                }
                
                table[rowIndex][colIndex] = this.getTextFromRelationships(cell, blockMap)
              }
            })
          }
        })
      }
      
      tables.push(table)
    })

    return tables
  }

  /**
   * Get text from block relationships
   */
  private getTextFromRelationships(block: any, blockMap: Map<string, any>): string {
    let text = ''
    
    if (block.Relationships) {
      block.Relationships.forEach((relationship: any) => {
        if (relationship.Type === 'CHILD') {
          relationship.Ids.forEach((childId: string) => {
            const child = blockMap.get(childId)
            if (child?.BlockType === 'WORD') {
              text += child.Text + ' '
            } else if (child?.BlockType === 'SELECTION_ELEMENT') {
              if (child.SelectionStatus === 'SELECTED') {
                text += 'X '
              }
            }
          })
        }
      })
    }
    
    return text.trim()
  }

  /**
   * Find value by possible key names
   */
  private findValue(keyValuePairs: Map<string, string>, possibleKeys: string[]): string | undefined {
    for (const key of possibleKeys) {
      const value = keyValuePairs.get(key.toLowerCase())
      if (value) return value
      
      // Also check for partial matches
      for (const [k, v] of keyValuePairs.entries()) {
        if (k.includes(key.toLowerCase())) {
          return v
        }
      }
    }
    return undefined
  }

  /**
   * Find and parse date value
   */
  private findDateValue(keyValuePairs: Map<string, string>, possibleKeys: string[]): string | undefined {
    const dateStr = this.findValue(keyValuePairs, possibleKeys)
    if (!dateStr) return undefined

    // Try to parse common Singapore date formats
    const formats = [
      /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/, // YYYY-MM-DD
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i, // DD MMM YYYY
    ]

    for (const format of formats) {
      const match = dateStr.match(format)
      if (match) {
        // Convert to ISO format
        try {
          const date = new Date(dateStr)
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0]
          }
        } catch (e) {
          // Continue to next format
        }
      }
    }

    return dateStr // Return original if can't parse
  }

  /**
   * Find and parse currency value
   */
  private findCurrencyValue(keyValuePairs: Map<string, string>, possibleKeys: string[]): number | undefined {
    const value = this.findValue(keyValuePairs, possibleKeys)
    if (!value) return undefined

    // Remove currency symbols and parse
    const cleanValue = value.replace(/[^0-9.-]/g, '')
    const parsed = parseFloat(cleanValue)
    
    return isNaN(parsed) ? undefined : parsed
  }

  /**
   * Find UEN (Singapore Unique Entity Number)
   */
  private findUENValue(keyValuePairs: Map<string, string>, possibleKeys: string[]): string | undefined {
    const value = this.findValue(keyValuePairs, possibleKeys)
    if (!value) return undefined

    // UEN format: NNNNNNNNX where N is digit and X is letter
    const uenMatch = value.match(/\b(\d{8,9}[A-Z])\b/)
    return uenMatch ? uenMatch[1] : value
  }

  /**
   * Extract line items from tables
   */
  private extractLineItems(tables: any[]): ExtractedInvoiceData['items'] {
    const items: ExtractedInvoiceData['items'] = []

    // Find the table that looks like line items
    for (const table of tables) {
      if (table.length < 2) continue // Need at least header and one row

      // Check if this looks like a line items table
      const headers = table[0]?.map((h: string) => h?.toLowerCase() || '') || []
      const hasDescription = headers.some((h: string) => 
        h.includes('description') || h.includes('item') || h.includes('product')
      )
      const hasAmount = headers.some((h: string) => 
        h.includes('amount') || h.includes('total') || h.includes('price')
      )

      if (hasDescription || hasAmount) {
        // Extract items from rows
        for (let i = 1; i < table.length; i++) {
          const row = table[i]
          if (!row || row.length === 0) continue

          // Find column indices
          const descIndex = headers.findIndex((h: string) => 
            h.includes('description') || h.includes('item') || h.includes('product')
          )
          const qtyIndex = headers.findIndex((h: string) => 
            h.includes('qty') || h.includes('quantity')
          )
          const priceIndex = headers.findIndex((h: string) => 
            h.includes('price') || h.includes('rate') || h.includes('unit')
          )
          const amountIndex = headers.findIndex((h: string) => 
            h.includes('amount') || h.includes('total')
          )

          const item = {
            description: row[descIndex >= 0 ? descIndex : 0] || '',
            quantity: this.parseNumber(row[qtyIndex >= 0 ? qtyIndex : 1]) || 1,
            unitPrice: this.parseNumber(row[priceIndex >= 0 ? priceIndex : 2]) || 0,
            amount: this.parseNumber(row[amountIndex >= 0 ? amountIndex : row.length - 1]) || 0,
          }

          // Only add if we have at least a description and amount
          if (item.description && item.amount > 0) {
            items.push(item)
          }
        }
        
        break // Use first matching table
      }
    }

    return items
  }

  /**
   * Parse number from string
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value
    if (!value) return 0
    
    const cleaned = String(value).replace(/[^0-9.-]/g, '')
    const parsed = parseFloat(cleaned)
    
    return isNaN(parsed) ? 0 : parsed
  }

  /**
   * Try to extract customer name from address blocks
   */
  private extractCustomerFromAddress(blocks: any[]): string | undefined {
    // Look for "Bill To" or "Customer" section and get the next line
    let foundBillTo = false
    
    for (const block of blocks) {
      if (block.BlockType === 'LINE' && block.Text) {
        const text = block.Text.toLowerCase()
        
        if (foundBillTo && !text.includes('bill to') && !text.includes('customer')) {
          // This might be the customer name
          return block.Text.trim()
        }
        
        if (text.includes('bill to') || text.includes('customer')) {
          foundBillTo = true
        }
      }
    }
    
    return undefined
  }
}
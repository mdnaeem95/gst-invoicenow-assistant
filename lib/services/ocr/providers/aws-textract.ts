// lib/services/ocr/providers/aws-textract.ts
import { 
  TextractClient, 
  AnalyzeDocumentCommand,
  AnalyzeExpenseCommand,
  FeatureType,
  Block,
  RelationshipType,
  BlockType,
  ExpenseDocument
} from '@aws-sdk/client-textract'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { ExtractedInvoiceData, OCRProvider } from '../types'
import { v4 as uuidv4 } from 'uuid'

export class TextractService implements OCRProvider {
  name = 'aws-textract'
  private textractClient: TextractClient | null = null
  private s3Client: S3Client | null = null
  private bucketName: string
  private initialized = false

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || 'gst-invoicenow-temp'
    this.initialize()
  }

  private initialize() {
    try {
      const config = {
        region: process.env.AWS_REGION || 'ap-southeast-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      }

      this.textractClient = new TextractClient(config)
      this.s3Client = new S3Client(config)
      this.initialized = true
      console.log('AWS Textract initialized successfully')
    } catch (error) {
      console.error('Failed to initialize AWS Textract:', error)
      this.initialized = false
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.textractClient !== null
  }

  async extractInvoiceData(file: Buffer, fileName: string): Promise<ExtractedInvoiceData> {
    if (!this.textractClient) {
      throw new Error('Textract client not initialized')
    }

    try {
      console.log(`Textract: Processing ${fileName}`)
      
      // Try AnalyzeExpense first (optimized for invoices/receipts)
      try {
        const expenseResult = await this.analyzeExpense(file)
        if (expenseResult) {
          console.log('Textract: Used AnalyzeExpense API')
          return expenseResult
        }
      } catch (expenseError) {
        console.log('Textract: AnalyzeExpense failed, falling back to AnalyzeDocument')
      }

      // Fallback to AnalyzeDocument with FORMS and TABLES
      const documentResult = await this.analyzeDocument(file, fileName)
      console.log('Textract: Used AnalyzeDocument API')
      return documentResult

    } catch (error) {
      console.error('Textract extraction error:', error)
      throw new Error(`Textract extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async analyzeExpense(file: Buffer): Promise<ExtractedInvoiceData | null> {
    try {
      const command = new AnalyzeExpenseCommand({
        Document: {
          Bytes: file
        }
      })

      const response = await this.textractClient!.send(command)
      
      if (!response.ExpenseDocuments || response.ExpenseDocuments.length === 0) {
        return null
      }

      return this.parseExpenseDocument(response.ExpenseDocuments[0])
    } catch (error) {
      console.error('AnalyzeExpense error:', error)
      return null
    }
  }

  private parseExpenseDocument(doc: ExpenseDocument): ExtractedInvoiceData {
    const extracted: ExtractedInvoiceData = { items: [] }
    
    // Parse summary fields
    if (doc.SummaryFields) {
      for (const field of doc.SummaryFields) {
        const type = field.Type?.Text?.toLowerCase() || ''
        const value = field.ValueDetection?.Text || ''
        
        switch (type) {
          case 'invoice_receipt_id':
          case 'invoice_number':
            extracted.invoiceNumber = value
            break
          case 'invoice_receipt_date':
          case 'invoice_date':
            extracted.invoiceDate = this.parseDate(value)
            break
          case 'due_date':
          case 'payment_due_date':
            extracted.dueDate = this.parseDate(value)
            break
          case 'vendor_name':
          case 'supplier_name':
            extracted.vendorName = value
            break
          case 'receiver_name':
          case 'customer_name':
            extracted.customerName = value
            break
          case 'subtotal':
            extracted.subtotal = this.parseAmount(value)
            break
          case 'tax':
          case 'gst':
            extracted.gstAmount = this.parseAmount(value)
            break
          case 'total':
          case 'amount_due':
            extracted.totalAmount = this.parseAmount(value)
            break
          case 'vendor_address':
            extracted.vendorAddress = value
            break
          case 'receiver_address':
          case 'customer_address':
            extracted.customerAddress = value
            break
        }

        // Check for UEN/GST in vendor fields
        if (type.includes('vendor') && value) {
          const uen = this.extractUEN(value)
          if (uen) extracted.vendorUEN = uen
          
          const gst = this.extractGSTNumber(value)
          if (gst) extracted.vendorGSTNumber = gst
        }
      }
    }

    // Parse line items
    if (doc.LineItemGroups) {
      for (const group of doc.LineItemGroups) {
        if (group.LineItems) {
          for (const lineItem of group.LineItems) {
            const item = this.parseLineItem(lineItem)
            if (item) {
              extracted.items.push(item)
            }
          }
        }
      }
    }

    return extracted
  }

  private parseLineItem(lineItem: any): ExtractedInvoiceData['items'][0] | null {
    let description = ''
    let quantity = 1
    let unitPrice = 0
    let amount = 0

    if (lineItem.LineItemExpenseFields) {
      for (const field of lineItem.LineItemExpenseFields) {
        const type = field.Type?.Text?.toLowerCase() || ''
        const value = field.ValueDetection?.Text || ''

        switch (type) {
          case 'item':
          case 'description':
          case 'product_name':
            description = value
            break
          case 'quantity':
          case 'qty':
            quantity = this.parseNumber(value) || 1
            break
          case 'unit_price':
          case 'price':
          case 'rate':
            unitPrice = this.parseAmount(value) || 0
            break
          case 'price':
          case 'amount':
          case 'line_total':
            amount = this.parseAmount(value) || 0
            break
        }
      }
    }

    // Only return if we have meaningful data
    if (description && (amount > 0 || unitPrice > 0)) {
      // Calculate amount if not provided
      if (amount === 0 && unitPrice > 0) {
        amount = unitPrice * quantity
      }
      
      return {
        description,
        quantity,
        unitPrice: unitPrice || (amount / quantity),
        amount
      }
    }

    return null
  }

  private async analyzeDocument(file: Buffer, fileName: string): Promise<ExtractedInvoiceData> {
    let s3Key: string | null = null

    try {
      // For larger files, upload to S3 first
      if (file.length > 5 * 1024 * 1024) { // 5MB
        s3Key = await this.uploadToS3(file, fileName)
        
        const command = new AnalyzeDocumentCommand({
          Document: {
            S3Object: {
              Bucket: this.bucketName,
              Name: s3Key
            }
          },
          FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES]
        })

        const response = await this.textractClient!.send(command)
        return this.parseDocumentResponse(response)
      } else {
        // For smaller files, use direct bytes
        const command = new AnalyzeDocumentCommand({
          Document: {
            Bytes: file
          },
          FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES]
        })

        const response = await this.textractClient!.send(command)
        return this.parseDocumentResponse(response)
      }
    } finally {
      // Clean up S3 object if uploaded
      if (s3Key && this.s3Client) {
        try {
          await this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: s3Key
          }))
        } catch (error) {
          console.error('Failed to clean up S3 object:', error)
        }
      }
    }
  }

  private async uploadToS3(file: Buffer, fileName: string): Promise<string> {
    const key = `temp/${uuidv4()}-${fileName}`
    
    await this.s3Client!.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file,
      ContentType: 'application/pdf'
    }))

    return key
  }

  private parseDocumentResponse(response: any): ExtractedInvoiceData {
    const blocks: Block[] = response.Blocks || []
    const extracted: ExtractedInvoiceData = { items: [] }

    // Create block maps for efficient lookup
    const blockMap = new Map<string, Block>()
    const keyValueMap = new Map<string, { key: Block; value: Block }>()
    
    blocks.forEach(block => {
      if (block.Id) {
        blockMap.set(block.Id, block)
      }
    })

    // Extract key-value pairs
    blocks.forEach(block => {
      if (block.BlockType === BlockType.KEY_VALUE_SET && block.EntityTypes?.includes('KEY')) {
        const keyBlock = block
        const valueId = this.findRelationship(block, RelationshipType.VALUE)?.[0]
        
        if (valueId) {
          const valueBlock = blocks.find(b => b.Id === valueId)
          if (valueBlock) {
            const keyText = this.getTextFromBlock(keyBlock, blockMap).toLowerCase().trim()
            keyValueMap.set(keyText, { key: keyBlock, value: valueBlock })
          }
        }
      }
    })

    // Extract invoice fields from key-value pairs
    this.extractFieldsFromKeyValues(keyValueMap, blockMap, extracted)

    // Extract tables
    const tables = this.extractTables(blocks, blockMap)
    
    // Parse line items from tables
    extracted.items = this.parseTablesForLineItems(tables)

    // Extract additional fields from raw text if needed
    this.extractFieldsFromText(blocks, extracted)

    // Post-process Singapore-specific fields
    this.postProcessSingaporeFields(extracted)

    return extracted
  }

  private extractFieldsFromKeyValues(
    keyValueMap: Map<string, { key: Block; value: Block }>,
    blockMap: Map<string, Block>,
    extracted: ExtractedInvoiceData
  ): void {
    // Invoice number
    const invoiceNumberKeys = ['invoice number', 'invoice no', 'inv no', 'invoice #', 'tax invoice']
    for (const key of invoiceNumberKeys) {
      const pair = keyValueMap.get(key)
      if (pair) {
        extracted.invoiceNumber = this.getTextFromBlock(pair.value, blockMap).trim()
        break
      }
    }

    // Invoice date
    const invoiceDateKeys = ['invoice date', 'date', 'billing date', 'issue date']
    for (const key of invoiceDateKeys) {
      const pair = keyValueMap.get(key)
      if (pair && !key.includes('due')) {
        const dateText = this.getTextFromBlock(pair.value, blockMap).trim()
        extracted.invoiceDate = this.parseDate(dateText)
        break
      }
    }

    // Due date
    const dueDateKeys = ['due date', 'payment due', 'due by', 'payment date']
    for (const key of dueDateKeys) {
      const pair = keyValueMap.get(key)
      if (pair) {
        const dateText = this.getTextFromBlock(pair.value, blockMap).trim()
        extracted.dueDate = this.parseDate(dateText)
        break
      }
    }

    // Customer name
    const customerKeys = ['bill to', 'customer', 'client', 'sold to', 'invoice to', 'billed to']
    for (const key of customerKeys) {
      const pair = keyValueMap.get(key)
      if (pair) {
        extracted.customerName = this.getTextFromBlock(pair.value, blockMap).trim()
        break
      }
    }

    // Financial amounts
    const subtotalKeys = ['subtotal', 'sub total', 'net amount', 'net total']
    for (const key of subtotalKeys) {
      const pair = keyValueMap.get(key)
      if (pair) {
        extracted.subtotal = this.parseAmount(this.getTextFromBlock(pair.value, blockMap))
        break
      }
    }

    const gstKeys = ['gst', 'gst amount', 'tax', 'tax amount', 'gst 9%', 'gst @ 9%']
    for (const key of gstKeys) {
      const pair = keyValueMap.get(key)
      if (pair && !key.includes('registration')) {
        extracted.gstAmount = this.parseAmount(this.getTextFromBlock(pair.value, blockMap))
        break
      }
    }

    const totalKeys = ['total', 'total amount', 'grand total', 'amount due', 'total due']
    for (const key of totalKeys) {
      const pair = keyValueMap.get(key)
      if (pair && !key.includes('sub')) {
        extracted.totalAmount = this.parseAmount(this.getTextFromBlock(pair.value, blockMap))
        break
      }
    }

    // UEN and GST Registration
    const uenKeys = ['uen', 'company uen', 'reg no', 'registration no']
    for (const key of uenKeys) {
      const pair = keyValueMap.get(key)
      if (pair) {
        const value = this.getTextFromBlock(pair.value, blockMap).trim()
        const uen = this.extractUEN(value)
        if (uen) {
          // Determine if it's customer or vendor based on position
          if (this.isInCustomerSection(pair.key, blocks)) {
            extracted.customerUEN = uen
          } else {
            extracted.vendorUEN = uen
          }
        }
      }
    }
  }

  private extractTables(blocks: Block[], blockMap: Map<string, Block>): any[][] {
    const tables: any[][] = []
    
    const tableBlocks = blocks.filter(block => block.BlockType === BlockType.TABLE)
    
    for (const tableBlock of tableBlocks) {
      const table: any[][] = []
      const cells = new Map<string, Block>()
      
      // Get all cells
      const cellIds = this.findRelationship(tableBlock, RelationshipType.CHILD) || []
      cellIds.forEach(cellId => {
        const cell = blockMap.get(cellId)
        if (cell && cell.BlockType === BlockType.CELL) {
          const key = `${cell.RowIndex}-${cell.ColumnIndex}`
          cells.set(key, cell)
        }
      })
      
      // Build table structure
      let maxRow = 0
      let maxCol = 0
      
      cells.forEach((cell, key) => {
        if (cell.RowIndex) maxRow = Math.max(maxRow, cell.RowIndex)
        if (cell.ColumnIndex) maxCol = Math.max(maxCol, cell.ColumnIndex)
      })
      
      // Fill table
      for (let row = 1; row <= maxRow; row++) {
        table[row - 1] = []
        for (let col = 1; col <= maxCol; col++) {
          const cell = cells.get(`${row}-${col}`)
          if (cell) {
            table[row - 1][col - 1] = this.getTextFromBlock(cell, blockMap).trim()
          } else {
            table[row - 1][col - 1] = ''
          }
        }
      }
      
      if (table.length > 0) {
        tables.push(table)
      }
    }
    
    return tables
  }

  private parseTablesForLineItems(tables: any[][]): ExtractedInvoiceData['items'] {
    const items: ExtractedInvoiceData['items'] = []
    
    for (const table of tables) {
      if (table.length < 2) continue // Need header and at least one data row
      
      const columnMap = this.identifyItemColumns(table[0])
      
      // Skip if doesn't look like an items table
      if (columnMap.description === -1) continue
      
      // Parse data rows
      for (let i = 1; i < table.length; i++) {
        const row = table[i]
        if (!row || row.length === 0) continue
        
        const description = row[columnMap.description] || ''
        
        // Stop if we hit totals section
        if (this.isTotalRow(description)) break
        
        // Skip empty rows
        if (!description.trim()) continue
        
        const item = {
          description: description.trim(),
          quantity: this.parseNumber(row[columnMap.quantity]) || 1,
          unitPrice: this.parseAmount(row[columnMap.unitPrice]) || 0,
          amount: this.parseAmount(row[columnMap.amount]) || 0
        }
        
        // Calculate missing values
        if (item.amount === 0 && item.unitPrice > 0) {
          item.amount = item.unitPrice * item.quantity
        } else if (item.unitPrice === 0 && item.amount > 0 && item.quantity > 0) {
          item.unitPrice = item.amount / item.quantity
        }
        
        if (item.description && item.amount > 0) {
          items.push(item)
        }
      }
      
      // If we found items, don't process other tables
      if (items.length > 0) break
    }
    
    return items
  }

  private identifyItemColumns(headerRow: string[]): {
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
      
      // Description column
      if (lower.includes('description') || lower.includes('item') || 
          lower.includes('service') || lower.includes('product') ||
          lower.includes('particulars')) {
        map.description = index
      }
      // Quantity column
      else if (lower.includes('qty') || lower.includes('quantity') || 
               lower === 'q' || lower.includes('units')) {
        map.quantity = index
      }
      // Unit price column
      else if (lower.includes('price') || lower.includes('rate') || 
               lower.includes('unit') || lower.includes('cost')) {
        map.unitPrice = index
      }
      // Amount column
      else if (lower.includes('amount') || lower.includes('total') || 
               lower.includes('value') || lower.includes('sum')) {
        // Prefer columns that are explicitly "amount" or at the end
        if (map.amount === -1 || lower === 'amount' || index === headerRow.length - 1) {
          map.amount = index
        }
      }
    })
    
    // Set defaults if not found
    if (map.description === -1 && headerRow.length > 0) map.description = 0
    if (map.amount === -1 && headerRow.length > 0) map.amount = headerRow.length - 1
    
    return map
  }

  private extractFieldsFromText(blocks: Block[], extracted: ExtractedInvoiceData): void {
    // Get all text blocks
    const textBlocks = blocks
      .filter(block => block.BlockType === BlockType.LINE)
      .map(block => this.getTextFromBlock(block, new Map()))
    
    // Extract vendor info from header area (typically first 10 lines)
    const headerText = textBlocks.slice(0, 10).join('\n')
    
    if (!extracted.vendorName) {
      // Look for company name pattern
      const companyMatch = headerText.match(/^(.+(?:PTE|LTD|LLP|PRIVATE LIMITED|LIMITED))/im)
      if (companyMatch) {
        extracted.vendorName = companyMatch[1].trim()
      }
    }
    
    if (!extracted.vendorGSTNumber) {
      const gstMatch = this.extractGSTNumber(headerText)
      if (gstMatch) {
        extracted.vendorGSTNumber = gstMatch
      }
    }
    
    // Extract missing UENs
    if (!extracted.customerUEN || !extracted.vendorUEN) {
      textBlocks.forEach((text, index) => {
        const uen = this.extractUEN(text)
        if (uen) {
          // Use position heuristics
          if (index < 10 && !extracted.vendorUEN) {
            extracted.vendorUEN = uen
          } else if (!extracted.customerUEN) {
            extracted.customerUEN = uen
          }
        }
      })
    }
  }

  private postProcessSingaporeFields(extracted: ExtractedInvoiceData): void {
    // Normalize UENs
    if (extracted.customerUEN) {
      extracted.customerUEN = this.normalizeUEN(extracted.customerUEN)
    }
    if (extracted.vendorUEN) {
      extracted.vendorUEN = this.normalizeUEN(extracted.vendorUEN)
    }
    
    // Normalize GST number
    if (extracted.vendorGSTNumber) {
      extracted.vendorGSTNumber = this.normalizeGSTNumber(extracted.vendorGSTNumber)
    }
    
    // Calculate missing financial values
    if (extracted.items.length > 0) {
      const calculatedSubtotal = extracted.items.reduce((sum, item) => sum + item.amount, 0)
      
      if (!extracted.subtotal) {
        extracted.subtotal = Math.round(calculatedSubtotal * 100) / 100
      }
      
      if (!extracted.gstAmount && extracted.subtotal) {
        // Singapore GST is 9%
        extracted.gstAmount = Math.round(extracted.subtotal * 0.09 * 100) / 100
      }
      
      if (!extracted.totalAmount && extracted.subtotal && extracted.gstAmount) {
        extracted.totalAmount = Math.round((extracted.subtotal + extracted.gstAmount) * 100) / 100
      }
    }
    
    // Validate calculations
    if (extracted.subtotal && extracted.gstAmount && extracted.totalAmount) {
      const expectedTotal = extracted.subtotal + extracted.gstAmount
      const difference = Math.abs(expectedTotal - extracted.totalAmount)
      
      // If difference is more than $1, recalculate
      if (difference > 1) {
        extracted.totalAmount = Math.round(expectedTotal * 100) / 100
      }
    }
  }

  // Helper methods
  private getTextFromBlock(block: Block, blockMap: Map<string, Block>): string {
    let text = ''
    
    if (block.Text) {
      return block.Text
    }
    
    if (block.Relationships) {
      for (const relationship of block.Relationships) {
        if (relationship.Type === RelationshipType.CHILD && relationship.Ids) {
          for (const childId of relationship.Ids) {
            const childBlock = blockMap.get(childId)
            if (childBlock) {
              if (childBlock.BlockType === BlockType.WORD) {
                text += childBlock.Text + ' '
              } else if (childBlock.BlockType === BlockType.SELECTION_ELEMENT) {
                if (childBlock.SelectionStatus === 'SELECTED') {
                  text += 'X '
                }
              }
            }
          }
        }
      }
    }
    
    return text.trim()
  }

  private findRelationship(block: Block, relationshipType: RelationshipType): string[] | undefined {
    if (!block.Relationships) return undefined
    
    const relationship = block.Relationships.find(r => r.Type === relationshipType)
    return relationship?.Ids
  }

  private isInCustomerSection(block: Block, allBlocks: Block[]): boolean {
    // Simple heuristic: if block is in bottom half of page, likely customer section
    if (!block.Geometry?.BoundingBox) return false
    
    const yPosition = block.Geometry.BoundingBox.Top || 0
    return yPosition > 0.4 // Bottom 60% of page
  }

  private isTotalRow(text: string): boolean {
    const lower = text.toLowerCase()
    return /^(sub\s*)?total|grand\s*total|amount\s*due|balance|summary/i.test(lower)
  }

  private parseDate(dateStr: string): string {
    if (!dateStr) return ''
    
    // Clean the date string
    dateStr = dateStr.trim()
    
    // Handle DD/MM/YYYY or DD-MM-YYYY (Singapore format)
    const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    
    // Handle DD MMM YYYY
    const ddMmmYyyy = dateStr.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i)
    if (ddMmmYyyy) {
      const monthMap: Record<string, string> = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      }
      const [, day, monthName, year] = ddMmmYyyy
      const month = monthMap[monthName.toLowerCase()]
      return `${year}-${month}-${day.padStart(2, '0')}`
    }
    
    // Try standard parsing
    try {
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch (e) {
      // Ignore
    }
    
    return dateStr
  }

  private parseAmount(text: string): number | undefined {
    if (!text) return undefined
    
    // Remove currency symbols and clean
    const cleaned = text
      .replace(/[^0-9.,\-]/g, '')
      .replace(/,/g, '')
      .trim()
    
    const amount = parseFloat(cleaned)
    return isNaN(amount) || amount < 0 ? undefined : amount
  }

  private parseNumber(text: string): number {
    if (!text) return 0
    
    const cleaned = text.replace(/[^0-9.\-]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
  }

  private extractUEN(text: string): string | undefined {
    // Singapore UEN patterns
    const patterns = [
      /\b([0-9]{8,9}[A-Z])\b/,
      /\b([TRS][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z])\b/,
      /UEN[:\s]*([0-9]{8,9}[A-Z])/i
    ]
    
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        return match[1].toUpperCase()
      }
    }
    
    return undefined
  }

  private extractGSTNumber(text: string): string | undefined {
    const patterns = [
      /GST\s*(?:Reg\.?\s*)?(?:No\.?\s*)?[:\s]*([0-9]{8})/i,
      /(GST[0-9]{8})/,
      /(M[0-9]-[0-9]{7}-[0-9])/
    ]
    
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const gst = match[1].toUpperCase()
        // Ensure GST prefix
        if (/^[0-9]{8}$/.test(gst)) {
          return 'GST' + gst
        }
        return gst
      }
    }
    
    return undefined
  }

  private normalizeUEN(uen: string): string {
    // Clean and uppercase
    let normalized = uen.toUpperCase().replace(/[^0-9A-Z]/g, '')
    
    // Fix common OCR errors
    normalized = normalized
      .replace(/O(?=[0-9]{7})/g, '0') // O -> 0 at start
      .replace(/[Il](?=[0-9])/g, '1')  // I or l -> 1 before numbers
    
    return normalized
  }

  private normalizeGSTNumber(gst: string): string {
    let normalized = gst.toUpperCase().replace(/[^0-9A-Z-]/g, '')
    
    // Add GST prefix if missing
    if (/^[0-9]{8}$/.test(normalized)) {
      normalized = 'GST' + normalized
    }
    
    return normalized
  }

  getConfidenceScore(data: ExtractedInvoiceData): number {
    let score = 0
    let maxScore = 0
    
    // Required fields with weights
    const fields = [
      { name: 'invoiceNumber', weight: 2, value: data.invoiceNumber },
      { name: 'invoiceDate', weight: 2, value: data.invoiceDate },
      { name: 'customerName', weight: 2, value: data.customerName },
      { name: 'totalAmount', weight: 2, value: data.totalAmount },
      { name: 'vendorName', weight: 1, value: data.vendorName },
      { name: 'vendorGSTNumber', weight: 1, value: data.vendorGSTNumber },
      { name: 'subtotal', weight: 1, value: data.subtotal },
      { name: 'gstAmount', weight: 1, value: data.gstAmount }
    ]
    
    fields.forEach(field => {
      maxScore += field.weight
      if (field.value) {
        score += field.weight
      }
    })
    
    // Line items bonus
    if (data.items && data.items.length > 0) {
      score += 2
      maxScore += 2
    }
    
    // Calculation accuracy bonus
    if (data.subtotal && data.gstAmount && data.totalAmount) {
      const expectedTotal = data.subtotal + data.gstAmount
      const difference = Math.abs(expectedTotal - data.totalAmount)
      
      if (difference < 0.01) {
        score += 2
      } else if (difference < 1) {
        score += 1
      }
      maxScore += 2
    }
    
    // Singapore-specific field bonus
    if (data.vendorUEN || data.customerUEN) {
      score += 1
      maxScore += 1
    }
    
    return maxScore > 0 ? score / maxScore : 0
  }
}
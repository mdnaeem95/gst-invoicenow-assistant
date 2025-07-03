// lib/services/ocr/template-matching.ts
import { ExtractedInvoiceData, TemplatePattern, OCRResult } from './types'
import { createClient } from '@/lib/supabase/server'
import * as crypto from 'crypto'

export class TemplateMatchingService {
  private templates: Map<string, TemplatePattern> = new Map()
  private initialized = false

  constructor() {
    this.initialize()
  }

  private async initialize() {
    try {
      await this.loadTemplates()
      this.initialized = true
      console.log(`Template matching service initialized with ${this.templates.size} templates`)
    } catch (error) {
      console.error('Failed to initialize template matching:', error)
    }
  }

  async matchTemplate(file: Buffer, fileName: string): Promise<OCRResult | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Convert PDF to text for matching (simplified - in production use pdf-parse)
    const fileHash = this.generateFileHash(file)
    const fileText = await this.extractTextFromFile(file, fileName)
    
    if (!fileText) return null

    // Try to match against known templates
    let bestMatch: { template: TemplatePattern; score: number } | null = null
    let bestScore = 0

    for (const [id, template] of this.templates) {
      const score = this.calculateMatchScore(fileText, template)
      
      if (score > bestScore && score >= 0.7) {
        bestScore = score
        bestMatch = { template, score }
      }
    }

    if (!bestMatch) return null

    console.log(`Template match found: ${bestMatch.template.name} (score: ${bestScore.toFixed(2)})`)

    // Extract data using the matched template
    const extractedData = await this.extractUsingTemplate(fileText, bestMatch.template)
    
    // Update template usage statistics
    await this.updateTemplateUsage(bestMatch.template.id)

    return {
      ...extractedData,
      confidence: bestScore,
      provider: 'template-matching',
      processingTime: 0 // Will be set by orchestrator
    }
  }

  private async extractTextFromFile(file: Buffer, fileName: string): Promise<string | null> {
    // This is a simplified version - in production, use proper PDF parsing
    try {
      // For demo purposes, we'll just convert buffer to string
      // In reality, you'd use pdf-parse or similar
      if (fileName.toLowerCase().endsWith('.pdf')) {
        // Would use pdf-parse here
        return null // Skip for now
      }
      
      // For text-based files
      return file.toString('utf-8')
    } catch (error) {
      console.error('Failed to extract text from file:', error)
      return null
    }
  }

  private calculateMatchScore(text: string, template: TemplatePattern): number {
    let totalScore = 0
    let totalWeight = 0

    // Check pattern matches
    for (const [field, pattern] of Object.entries(template.patterns)) {
      const weight = this.getFieldWeight(field)
      totalWeight += weight

      if (pattern && pattern.test(text)) {
        totalScore += weight
      }
    }

    // Check for customer identifiers
    if (template.customerUEN) {
      const uenWeight = 2
      totalWeight += uenWeight
      
      if (text.includes(template.customerUEN)) {
        totalScore += uenWeight
      }
    }

    // Check structural patterns (e.g., table headers, field positions)
    const structuralScore = this.calculateStructuralScore(text, template)
    totalScore += structuralScore * 0.3
    totalWeight += 0.3

    return totalWeight > 0 ? totalScore / totalWeight : 0
  }

  private calculateStructuralScore(text: string, template: TemplatePattern): number {
    // Check for expected keywords and their relative positions
    const expectedKeywords = [
      'invoice', 'date', 'customer', 'total', 'gst', 'amount'
    ]
    
    let foundKeywords = 0
    for (const keyword of expectedKeywords) {
      if (text.toLowerCase().includes(keyword)) {
        foundKeywords++
      }
    }
    
    return foundKeywords / expectedKeywords.length
  }

  private async extractUsingTemplate(
    text: string, 
    template: TemplatePattern
  ): Promise<ExtractedInvoiceData> {
    const extracted: ExtractedInvoiceData = { items: [] }

    // Extract fields using template mappings
    for (const [field, mapping] of Object.entries(template.fieldMappings)) {
      if (mapping.pattern) {
        const match = text.match(mapping.pattern)
        if (match) {
          const value = match[1] || match[0]
          const transformedValue: any = mapping.transform ? mapping.transform(value) : value as any
          (extracted as any)[field] = transformedValue
        }
      }
    }

    // Extract line items using template-specific patterns
    extracted.items = this.extractLineItemsUsingTemplate(text, template)

    // Apply post-processing rules specific to this template
    this.applyTemplatePostProcessing(extracted, template)

    return extracted
  }

  private extractLineItemsUsingTemplate(
    text: string, 
    template: TemplatePattern
  ): ExtractedInvoiceData['items'] {
    const items: ExtractedInvoiceData['items'] = []
    
    // This would be customized per template
    // For now, return empty array
    return items
  }

  private applyTemplatePostProcessing(
    data: ExtractedInvoiceData, 
    template: TemplatePattern
  ): void {
    // Apply any template-specific rules
    // For example, some companies always use specific GST rates or formats
    
    if (template.name.includes('Construction')) {
      // Construction companies might have retention amounts
      // Special processing here
    }
    
    // Ensure Singapore GST rate
    if (data.subtotal && !data.gstAmount) {
      data.gstAmount = Math.round(data.subtotal * 0.09 * 100) / 100
    }
    
    // Calculate total if missing
    if (data.subtotal && data.gstAmount && !data.totalAmount) {
      data.totalAmount = data.subtotal + data.gstAmount
    }
  }

  private getFieldWeight(field: string): number {
    const weights: Record<string, number> = {
      invoiceNumber: 2,
      invoiceDate: 2,
      customerName: 1.5,
      totalAmount: 1.5,
      vendorName: 1
    }
    
    return weights[field] || 1
  }

  private generateFileHash(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex')
  }

  private async loadTemplates(): Promise<void> {
    try {
      const supabase = await createClient()
      
      // Load templates from database
      const { data: templates, error } = await supabase
        .from('invoice_templates')
        .select('*')
        .order('use_count', { ascending: false })
        .limit(100)

      if (error) {
        console.error('Failed to load templates:', error)
        // Load default templates
        this.loadDefaultTemplates()
        return
      }

      if (templates) {
        templates.forEach(template => {
          this.templates.set(template.id, this.parseTemplate(template))
        })
      }

      // Also load default templates
      this.loadDefaultTemplates()
    } catch (error) {
      console.error('Error loading templates:', error)
      this.loadDefaultTemplates()
    }
  }

  private loadDefaultTemplates(): void {
    // Common Singapore invoice templates
    const defaultTemplates: TemplatePattern[] = [
      {
        id: 'singapore-standard-1',
        name: 'Singapore Standard Invoice',
        patterns: {
          invoiceNumber: /Invoice\s*(?:No|Number)[:\s]*([A-Z0-9\-\/]+)/i,
          invoiceDate: /Invoice\s*Date[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
          totalAmount: /Total\s*(?:Amount)?[:\s]*\$?\s*([\d,]+\.?\d*)/i
        },
        fieldMappings: {
          invoiceNumber: {
            pattern: /Invoice\s*(?:No|Number)[:\s]*([A-Z0-9\-\/]+)/i
          },
          invoiceDate: {
            pattern: /Invoice\s*Date[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
            transform: (value: string) => this.normalizeSingaporeDate(value)
          },
          customerName: {
            pattern: /Bill\s*To[:\s]*\n([^\n]+)/i
          },
          totalAmount: {
            pattern: /Total\s*(?:Amount)?[:\s]*\$?\s*([\d,]+\.?\d*)/i,
            transform: (value: string) => parseFloat(value.replace(/,/g, ''))
          }
        },
        confidence: 0.8,
        lastUsed: new Date(),
        useCount: 0
      },
      {
        id: 'singapore-service-1',
        name: 'Singapore Service Invoice',
        patterns: {
          invoiceNumber: /Tax\s*Invoice\s*(?:No)?[:\s]*([A-Z0-9\-\/]+)/i,
          invoiceDate: /Date[:\s]*(\d{1,2}\s+\w+\s+\d{4})/i,
        //   customerUEN: /UEN[:\s]*([0-9]{8,9}[A-Z])/i
        },
        fieldMappings: {
          invoiceNumber: {
            pattern: /Tax\s*Invoice\s*(?:No)?[:\s]*([A-Z0-9\-\/]+)/i
          },
          invoiceDate: {
            pattern: /Date[:\s]*(\d{1,2}\s+\w+\s+\d{4})/i,
            transform: (value: string) => this.normalizeSingaporeDate(value)
          },
          customerUEN: {
            pattern: /UEN[:\s]*([0-9]{8,9}[A-Z])/i
          },
          gstAmount: {
            pattern: /GST\s*@?\s*9%[:\s]*\$?\s*([\d,]+\.?\d*)/i,
            transform: (value: string) => parseFloat(value.replace(/,/g, ''))
          }
        },
        confidence: 0.85,
        lastUsed: new Date(),
        useCount: 0
      }
    ]

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template)
    })
  }

  private parseTemplate(dbTemplate: any): TemplatePattern {
    return {
      id: dbTemplate.id,
      name: dbTemplate.name,
      customerUEN: dbTemplate.customer_uen,
      patterns: dbTemplate.patterns || {},
      fieldMappings: dbTemplate.field_mappings || {},
      confidence: dbTemplate.confidence || 0.7,
      lastUsed: new Date(dbTemplate.last_used || Date.now()),
      useCount: dbTemplate.use_count || 0
    }
  }

  private normalizeSingaporeDate(dateStr: string): string {
    try {
      // Handle DD/MM/YYYY format
      const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
      if (ddmmyyyy) {
        const [, day, month, year] = ddmmyyyy
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }

      // Handle DD Month YYYY format
      const ddMonthYYYY = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
      if (ddMonthYYYY) {
        const [, day, monthName, year] = ddMonthYYYY
        const monthMap: Record<string, string> = {
          'january': '01', 'jan': '01',
          'february': '02', 'feb': '02',
          'march': '03', 'mar': '03',
          'april': '04', 'apr': '04',
          'may': '05',
          'june': '06', 'jun': '06',
          'july': '07', 'jul': '07',
          'august': '08', 'aug': '08',
          'september': '09', 'sep': '09', 'sept': '09',
          'october': '10', 'oct': '10',
          'november': '11', 'nov': '11',
          'december': '12', 'dec': '12'
        }
        
        const month = monthMap[monthName.toLowerCase()]
        if (month) {
          return `${year}-${month}-${day.padStart(2, '0')}`
        }
      }

      // Try standard parsing
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch (error) {
      console.error('Date normalization error:', error)
    }

    return dateStr
  }

  private async updateTemplateUsage(templateId: string): Promise<void> {
    try {
      const template = this.templates.get(templateId)
      if (!template) return

      // Update in memory
      template.useCount++
      template.lastUsed = new Date()

      // Update in database
      const supabase = await createClient()
      await supabase
        .from('invoice_templates')
        .update({
          use_count: template.useCount,
          last_used: template.lastUsed.toISOString()
        })
        .eq('id', templateId)
    } catch (error) {
      console.error('Failed to update template usage:', error)
    }
  }

  async learnFromInvoice(
    invoiceData: ExtractedInvoiceData,
    fileText: string,
    customerUEN?: string
  ): Promise<void> {
    // This method would be called after successful manual corrections
    // to learn new patterns and create/update templates
    
    if (!customerUEN || !invoiceData.invoiceNumber) return

    try {
      // Create patterns from the successful extraction
      const patterns: TemplatePattern['patterns'] = {}
      const fieldMappings: TemplatePattern['fieldMappings'] = {}

      // Learn invoice number pattern
      if (invoiceData.invoiceNumber) {
        const invoiceNumberRegex = this.createPatternFromValue(
          fileText,
          invoiceData.invoiceNumber,
          'invoiceNumber'
        )
        if (invoiceNumberRegex) {
          patterns.invoiceNumber = invoiceNumberRegex
          fieldMappings.invoiceNumber = { pattern: invoiceNumberRegex }
        }
      }

      // Learn date pattern
      if (invoiceData.invoiceDate) {
        const dateRegex = this.createPatternFromValue(
          fileText,
          invoiceData.invoiceDate,
          'date'
        )
        if (dateRegex) {
          patterns.invoiceDate = dateRegex
          fieldMappings.invoiceDate = { 
            pattern: dateRegex,
            transform: (value: string) => this.normalizeSingaporeDate(value)
          }
        }
      }

      // Create or update template
      const templateId = `learned-${customerUEN}-${Date.now()}`
      const newTemplate: TemplatePattern = {
        id: templateId,
        name: `Learned Template - ${invoiceData.customerName || customerUEN}`,
        customerUEN,
        patterns,
        fieldMappings,
        confidence: 0.7, // Start with lower confidence for learned templates
        lastUsed: new Date(),
        useCount: 1
      }

      // Save to database
      const supabase = await createClient()
      await supabase
        .from('invoice_templates')
        .upsert({
          id: templateId,
          name: newTemplate.name,
          customer_uen: customerUEN,
          patterns,
          field_mappings: fieldMappings,
          confidence: newTemplate.confidence,
          last_used: newTemplate.lastUsed,
          use_count: newTemplate.useCount
        })

      // Add to memory
      this.templates.set(templateId, newTemplate)
      
      console.log(`Learned new template: ${newTemplate.name}`)
    } catch (error) {
      console.error('Failed to learn from invoice:', error)
    }
  }

  private createPatternFromValue(
    text: string,
    value: string,
    fieldType: string
  ): RegExp | null {
    try {
      // Find the value in the text
      const index = text.indexOf(value)
      if (index === -1) return null

      // Get context around the value
      const contextBefore = text.substring(Math.max(0, index - 50), index)
      const contextAfter = text.substring(index + value.length, index + value.length + 20)

      // Create pattern based on field type
      switch (fieldType) {
        case 'invoiceNumber':
          // Look for labels before the value
          const invoiceLabels = contextBefore.match(/(Invoice\s*(?:No|Number|#)?)[:\s]*$/i)
          if (invoiceLabels) {
            return new RegExp(`${invoiceLabels[1]}[:\\s]*([A-Z0-9\\-\\/]+)`, 'i')
          }
          break

        case 'date':
          // Look for date labels
          const dateLabels = contextBefore.match(/(Date|Invoice\s*Date)[:\s]*$/i)
          if (dateLabels) {
            return new RegExp(`${dateLabels[1]}[:\\s]*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{4})`, 'i')
          }
          break

        case 'amount':
          const amountLabels = contextBefore.match(/(Total|Amount|Grand\s*Total)[:\s]*\$?\s*$/i)
          if (amountLabels) {
            return new RegExp(`${amountLabels[1]}[:\\s]*\\$?\\s*([\\d,]+\\.?\\d*)`, 'i')
          }
          break
      }

      return null
    } catch (error) {
      console.error('Failed to create pattern:', error)
      return null
    }
  }
}
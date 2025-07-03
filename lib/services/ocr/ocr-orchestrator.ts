// lib/services/ocr/ocr-orchestrator.ts
import { TextractService } from './providers/aws-textract'
import { GoogleVisionService } from './providers/google-vision'
import { TemplateMatchingService } from './providers/template-matching'
import { ExtractedInvoiceData, OCRProvider } from './types'

export interface OCRResult extends ExtractedInvoiceData {
  confidence: number
  provider: string
  processingTime: number
  warnings?: string[]
}

export class OCROrchestrator {
  private providers: OCRProvider[]
  private templateMatcher: TemplateMatchingService

  constructor() {
    this.providers = this.initializeProviders()
    this.templateMatcher = new TemplateMatchingService()
  }

  private initializeProviders(): OCRProvider[] {
    const providers: OCRProvider[] = []

    // Initialize providers based on available credentials
    if (process.env.AWS_ACCESS_KEY_ID) {
      providers.push(new TextractService())
    }

    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      providers.push(new GoogleVisionService())
    }

    if (providers.length === 0) {
      throw new Error('No OCR providers configured. Please set up AWS or Google Cloud credentials.')
    }

    return providers
  }

  async extractInvoiceData(
    file: Buffer, 
    fileName: string,
    options?: {
      preferredProvider?: string
      minConfidence?: number
      enableTemplateMatching?: boolean
    }
  ): Promise<OCRResult> {
    const startTime = Date.now()
    const results: OCRResult[] = []
    const errors: Error[] = []

    // Try template matching first if enabled
    if (options?.enableTemplateMatching !== false) {
      try {
        const templateResult = await this.templateMatcher.matchTemplate(file, fileName)
        if (templateResult && templateResult.confidence > 0.8) {
          return {
            ...templateResult,
            provider: 'template-matching',
            processingTime: Date.now() - startTime
          }
        }
      } catch (err) {
        console.log('Template matching failed, falling back to OCR:', err)
      }
    }

    // Try preferred provider first
    if (options?.preferredProvider) {
      const preferredProvider = this.providers.find(p => p.name === options.preferredProvider)
      if (preferredProvider) {
        try {
          const result = await this.extractWithProvider(preferredProvider, file, fileName)
          if (result.confidence >= (options.minConfidence || 0.7)) {
            return {
              ...result,
              processingTime: Date.now() - startTime
            }
          }
          results.push(result)
        } catch (err) {
          errors.push(err as Error)
        }
      }
    }

    // Try other providers
    for (const provider of this.providers) {
      if (provider.name === options?.preferredProvider) continue

      try {
        const result = await this.extractWithProvider(provider, file, fileName)
        results.push(result)

        // Return early if high confidence
        if (result.confidence >= 0.9) {
          return {
            ...result,
            processingTime: Date.now() - startTime
          }
        }
      } catch (err) {
        errors.push(err as Error)
        console.error(`Provider ${provider.name} failed:`, err)
      }
    }

    // Return best result or throw if all failed
    if (results.length === 0) {
      throw new Error(`All OCR providers failed: ${errors.map(e => e.message).join(', ')}`)
    }

    // Merge results from multiple providers for better accuracy
    const mergedResult = this.mergeResults(results)
    return {
      ...mergedResult,
      processingTime: Date.now() - startTime
    }
  }

  private async extractWithProvider(
    provider: OCRProvider, 
    file: Buffer, 
    fileName: string
  ): Promise<OCRResult> {
    const startTime = Date.now()
    const extracted = await provider.extractInvoiceData(file, fileName)
    const confidence = this.calculateConfidence(extracted)

    return {
      ...extracted,
      confidence,
      provider: provider.name,
      processingTime: Date.now() - startTime
    }
  }

  private calculateConfidence(data: ExtractedInvoiceData): number {
    let score = 0
    let fields = 0

    // Required fields
    if (data.invoiceNumber) { score += 2; fields += 2 }
    if (data.invoiceDate) { score += 2; fields += 2 }
    if (data.customerName) { score += 2; fields += 2 }
    if (data.totalAmount && data.totalAmount > 0) { score += 2; fields += 2 }

    // Optional but important fields
    if (data.customerUEN) { score += 1; fields += 1 }
    if (data.vendorName) { score += 1; fields += 1 }
    if (data.gstAmount !== undefined) { score += 1; fields += 1 }
    if (data.subtotal !== undefined) { score += 1; fields += 1 }
    if (data.items && data.items.length > 0) { score += 2; fields += 2 }

    // Calculate line items accuracy
    if (data.items && data.items.length > 0) {
      const itemsTotal = data.items.reduce((sum, item) => sum + item.amount, 0)
      const totalDiff = Math.abs(itemsTotal - (data.subtotal || 0))
      if (totalDiff < 1) { score += 1; fields += 1 }
    }

    return fields > 0 ? score / fields : 0
  }

  private mergeResults(results: OCRResult[]): OCRResult {
    // Sort by confidence
    const sorted = results.sort((a, b) => b.confidence - a.confidence)
    const best = sorted[0]

    // Use the best result as base
    const merged: OCRResult = { ...best }

    // Fill missing fields from other results
    for (const result of sorted.slice(1)) {
      // Invoice details
      if (!merged.invoiceNumber && result.invoiceNumber) {
        merged.invoiceNumber = result.invoiceNumber
      }
      if (!merged.invoiceDate && result.invoiceDate) {
        merged.invoiceDate = result.invoiceDate
      }
      if (!merged.customerName && result.customerName) {
        merged.customerName = result.customerName
      }
      if (!merged.customerUEN && result.customerUEN) {
        merged.customerUEN = result.customerUEN
      }

      // Financial details - use from same provider to maintain consistency
      if (result.provider === best.provider) {
        if (!merged.subtotal && result.subtotal) {
          merged.subtotal = result.subtotal
        }
        if (!merged.gstAmount && result.gstAmount) {
          merged.gstAmount = result.gstAmount
        }
        if (!merged.totalAmount && result.totalAmount) {
          merged.totalAmount = result.totalAmount
        }
      }

      // Merge line items if missing
      if ((!merged.items || merged.items.length === 0) && result.items && result.items.length > 0) {
        merged.items = result.items
      }
    }

    // Add warnings for inconsistencies
    merged.warnings = this.detectInconsistencies(results)

    return merged
  }

  private detectInconsistencies(results: OCRResult[]): string[] {
    const warnings: string[] = []

    // Check for significantly different totals
    const totals = results.map(r => r.totalAmount).filter(t => t !== undefined)
    if (totals.length > 1) {
      const avgTotal = totals.reduce((sum, t) => sum + (t || 0), 0) / totals.length
      const maxDiff = Math.max(...totals.map(t => Math.abs((t || 0) - avgTotal)))
      
      if (maxDiff > avgTotal * 0.1) { // More than 10% difference
        warnings.push('Significant differences detected in total amounts across OCR providers')
      }
    }

    // Check for different invoice numbers
    const invoiceNumbers = [...new Set(results.map(r => r.invoiceNumber).filter(n => n))]
    if (invoiceNumbers.length > 1) {
      warnings.push(`Multiple invoice numbers detected: ${invoiceNumbers.join(', ')}`)
    }

    return warnings
  }
}
// lib/services/ocr/ocr-orchestrator.ts
import { TextractService } from './providers/aws-textract'
import { GoogleVisionService } from './providers/google-vision'
import { TemplateMatchingService } from './template-matching'
import { OCRProvider, OCRResult, OCROptions } from './types'
import { createClient } from '@/lib/supabase/server'

export class OCROrchestrator {
  private providers: Map<string, OCRProvider>
  private templateMatcher: TemplateMatchingService
  private confidenceThreshold = 0.7
  private cache: Map<string, OCRResult> = new Map()

  constructor() {
    this.providers = new Map()
    this.initializeProviders()
    this.templateMatcher = new TemplateMatchingService()
  }

  private initializeProviders() {
    // Initialize AWS Textract if configured
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      try {
        const textract = new TextractService()
        if (textract.isAvailable()) {
          this.providers.set('aws-textract', textract)
          console.log('AWS Textract initialized')
        }
      } catch (error) {
        console.error('Failed to initialize AWS Textract:', error)
      }
    }

    // Initialize Google Vision if configured
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT) {
      try {
        const googleVision = new GoogleVisionService()
        if (googleVision.isAvailable()) {
          this.providers.set('google-vision', googleVision)
          console.log('Google Vision initialized')
        }
      } catch (error) {
        console.error('Failed to initialize Google Vision:', error)
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No OCR providers configured. Please set up AWS or Google Cloud credentials.')
    }
  }

  async extractInvoiceData(
    file: Buffer, 
    fileName: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now()
    
    // Check cache first
    const cacheKey = this.generateCacheKey(file)
    if (this.cache.has(cacheKey)) {
      console.log('Returning cached OCR result')
      return this.cache.get(cacheKey)!
    }

    const results: OCRResult[] = []
    const errors: Error[] = []

    // Step 1: Try template matching first (fastest)
    if (options.enableTemplateMatching !== false) {
      try {
        console.log('Attempting template matching...')
        const templateResult = await this.templateMatcher.matchTemplate(file, fileName)
        
        if (templateResult && templateResult.confidence >= 0.85) {
          const result: OCRResult = {
            ...templateResult,
            provider: 'template-matching',
            processingTime: Date.now() - startTime
          }
          
          // Cache and return if high confidence
          this.cache.set(cacheKey, result)
          return result
        }
        
        // Add to results for potential merging
        if (templateResult) {
          results.push({
            ...templateResult,
            provider: 'template-matching',
            processingTime: Date.now() - startTime
          })
        }
      } catch (error) {
        console.log('Template matching failed:', error)
      }
    }

    // Step 2: Try preferred provider
    if (options.preferredProvider && this.providers.has(options.preferredProvider)) {
      const provider = this.providers.get(options.preferredProvider)!
      try {
        console.log(`Trying preferred provider: ${options.preferredProvider}`)
        const result = await this.extractWithProvider(provider, file, fileName, options)
        
        if (result.confidence >= (options.minConfidence || this.confidenceThreshold)) {
          this.cache.set(cacheKey, result)
          return result
        }
        
        results.push(result)
      } catch (error) {
        errors.push(error as Error)
        console.error(`Provider ${provider.name} failed:`, error)
      }
    }

    // Step 3: Try remaining providers in order of past performance
    const sortedProviders = this.getSortedProviders(options.preferredProvider)
    
    for (const [name, provider] of sortedProviders) {
      if (results.some(r => r.provider === name)) continue
      
      try {
        console.log(`Trying provider: ${name}`)
        const result = await this.extractWithProvider(provider, file, fileName, options)
        results.push(result)
        
        // Return early if high confidence
        if (result.confidence >= 0.9) {
          this.cache.set(cacheKey, result)
          return result
        }
      } catch (error) {
        errors.push(error as Error)
        console.error(`Provider ${name} failed:`, error)
      }
    }

    // Step 4: Check if we have any results
    if (results.length === 0) {
      throw new Error(`All OCR providers failed: ${errors.map(e => e.message).join(', ')}`)
    }

    // Step 5: Merge results for better accuracy
    const mergedResult = await this.mergeResults(results)
    mergedResult.processingTime = Date.now() - startTime
    
    // Step 6: Apply post-processing enhancements
    const enhancedResult = await this.enhanceResult(mergedResult)
    
    // Cache the result
    this.cache.set(cacheKey, enhancedResult)
    
    // Clean old cache entries
    this.cleanCache()
    
    return enhancedResult
  }

  private async extractWithProvider(
    provider: OCRProvider,
    file: Buffer,
    fileName: string,
    options: OCROptions
  ): Promise<OCRResult> {
    const startTime = Date.now()
    
    try {
      const extracted = await provider.extractInvoiceData(file, fileName)
      const confidence = provider.getConfidenceScore(extracted)
      
      return {
        ...extracted,
        confidence,
        provider: provider.name,
        processingTime: Date.now() - startTime
      }
    } catch (error) {
      console.error(`Provider ${provider.name} extraction error:`, error)
      throw error
    }
  }

  private async mergeResults(results: OCRResult[]): Promise<OCRResult> {
    // Sort by confidence
    const sorted = results.sort((a, b) => b.confidence - a.confidence)
    const best = sorted[0]
    
    console.log('Merging results from providers:', results.map(r => ({
      provider: r.provider,
      confidence: r.confidence.toFixed(2)
    })))

    // Start with the best result
    const merged: OCRResult = { ...best }
    const warnings: string[] = []

    // Merge fields from other results
    for (const result of sorted.slice(1)) {
      // Basic fields - use if missing in best result
      const basicFields = [
        'invoiceNumber', 'invoiceDate', 'dueDate', 
        'customerName', 'customerUEN', 'customerAddress',
        'vendorName', 'vendorUEN', 'vendorGSTNumber'
      ] as const

      for (const field of basicFields) {
        if (!merged[field] && result[field]) {
          merged[field] = result[field]
        }
      }

      // Financial fields - validate consistency
      if (result.totalAmount && merged.totalAmount) {
        const diff = Math.abs(result.totalAmount - merged.totalAmount)
        const avgAmount = (result.totalAmount + merged.totalAmount) / 2
        
        if (diff > avgAmount * 0.1) { // More than 10% difference
          warnings.push(`Significant difference in total amounts detected between OCR providers`)
        }
      }

      // Merge line items if better
      if (result.items.length > merged.items.length && result.confidence > 0.6) {
        merged.items = result.items
      }
    }

    // Detect inconsistencies
    merged.warnings = this.detectInconsistencies(results).concat(warnings)
    
    // Recalculate confidence based on consensus
    merged.confidence = this.calculateConsensusConfidence(results, merged)
    
    return merged
  }

  private detectInconsistencies(results: OCRResult[]): string[] {
    const warnings: string[] = []
    
    // Check invoice numbers
    const invoiceNumbers = [...new Set(results
      .map(r => r.invoiceNumber)
      .filter(n => n)
    )]
    
    if (invoiceNumbers.length > 1) {
      warnings.push(`Multiple invoice numbers detected: ${invoiceNumbers.join(', ')}`)
    }
    
    // Check dates
    const dates = [...new Set(results
      .map(r => r.invoiceDate)
      .filter(d => d)
    )]
    
    if (dates.length > 1) {
      warnings.push(`Multiple invoice dates detected: ${dates.join(', ')}`)
    }
    
    // Check customer names
    const customers = [...new Set(results
      .map(r => r.customerName)
      .filter(c => c)
    )]
    
    if (customers.length > 1) {
      // Use fuzzy matching to check if they're similar
      const similarity = this.calculateStringSimilarity(customers[0]!, customers[1]!)
      if (similarity < 0.8) {
        warnings.push(`Different customer names detected: ${customers.join(', ')}`)
      }
    }
    
    return warnings
  }

  private calculateConsensusConfidence(results: OCRResult[], merged: OCRResult): number {
    let score = 0
    let weight = 0
    
    // Check how many providers agree on key fields
    const fields = ['invoiceNumber', 'customerName', 'totalAmount'] as const
    
    for (const field of fields) {
      const values = results.map(r => r[field]).filter(v => v)
      if (values.length > 0) {
        const matches = values.filter(v => v === merged[field]).length
        score += (matches / values.length) * 0.3
        weight += 0.3
      }
    }
    
    // Factor in individual provider confidences
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length
    score += avgConfidence * 0.1
    weight += 0.1
    
    return weight > 0 ? score / weight : merged.confidence
  }

  private async enhanceResult(result: OCRResult): Promise<OCRResult> {
    const enhanced = { ...result }
    
    // Enhance Singapore-specific fields
    if (enhanced.customerUEN) {
      enhanced.customerUEN = this.normalizeUEN(enhanced.customerUEN)
    }
    
    if (enhanced.vendorUEN) {
      enhanced.vendorUEN = this.normalizeUEN(enhanced.vendorUEN)
    }
    
    if (enhanced.vendorGSTNumber) {
      enhanced.vendorGSTNumber = this.normalizeGSTNumber(enhanced.vendorGSTNumber)
    }
    
    // Ensure GST calculations are correct
    if (enhanced.items.length > 0 && !enhanced.gstAmount) {
      const subtotal = enhanced.items.reduce((sum, item) => sum + item.amount, 0)
      enhanced.subtotal = subtotal
      enhanced.gstAmount = subtotal * 0.09 // Singapore GST 9%
      enhanced.totalAmount = subtotal + enhanced.gstAmount
    }
    
    // Try to infer missing vendor details from database
    if (!enhanced.vendorName || !enhanced.vendorUEN) {
      const vendorDetails = await this.inferVendorDetails(result)
      if (vendorDetails) {
        enhanced.vendorName = enhanced.vendorName || vendorDetails.name
        enhanced.vendorUEN = enhanced.vendorUEN || vendorDetails.uen
        enhanced.vendorGSTNumber = enhanced.vendorGSTNumber || vendorDetails.gstNumber
      }
    }
    
    return enhanced
  }

  private normalizeUEN(uen: string): string {
    // Remove spaces and convert to uppercase
    let normalized = uen.toUpperCase().replace(/\s+/g, '')
    
    // Handle common OCR mistakes
    normalized = normalized
      .replace(/O/g, '0') // Replace O with 0 in numeric part
      .replace(/[Il]/g, '1') // Replace I or l with 1
    
    // Ensure correct format
    const match = normalized.match(/([0-9]{8,9})([A-Z])/)
    if (match) {
      return match[1] + match[2]
    }
    
    return normalized
  }

  private normalizeGSTNumber(gst: string): string {
    let normalized = gst.toUpperCase().replace(/\s+/g, '')
    
    // Add GST prefix if missing
    if (/^[0-9]{8}$/.test(normalized)) {
      normalized = 'GST' + normalized
    }
    
    return normalized
  }

  private async inferVendorDetails(result: OCRResult) {
    try {
      const supabase = await createClient()
      
      // Try to find vendor from previous invoices
      const { data } = await supabase
        .from('invoices')
        .select('vendor_name, vendor_uen, vendor_gst_number')
        .or(`vendor_name.ilike.%${result.vendorName}%,vendor_uen.eq.${result.vendorUEN}`)
        .limit(1)
        .single()
      
      if (data) {
        return {
          name: data.vendor_name,
          uen: data.vendor_uen,
          gstNumber: data.vendor_gst_number
        }
      }
    } catch (error) {
      console.log('Could not infer vendor details:', error)
    }
    
    return null
  }

  private getSortedProviders(exclude?: string): Array<[string, OCRProvider]> {
    // In a production system, this would sort by success rate and speed
    return Array.from(this.providers.entries())
      .filter(([name]) => name !== exclude)
      .sort((a, b) => {
        // Prefer Textract for invoices
        if (a[0] === 'aws-textract') return -1
        if (b[0] === 'aws-textract') return 1
        return 0
      })
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1
    
    if (longer.length === 0) return 1.0
    
    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = []
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    
    return matrix[str2.length][str1.length]
  }

  private generateCacheKey(buffer: Buffer): string {
    // Simple hash for caching
    const crypto = require('crypto')
    return crypto.createHash('md5').update(buffer).digest('hex')
  }

  private cleanCache() {
    // Keep cache size under control
    if (this.cache.size > 100) {
      const entries = Array.from(this.cache.entries())
      entries.splice(0, 50).forEach(([key]) => this.cache.delete(key))
    }
  }
}
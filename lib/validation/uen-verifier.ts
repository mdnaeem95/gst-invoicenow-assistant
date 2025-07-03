// lib/validation/uen-verifier.ts
import { createClient } from '@/lib/supabase/server'

export interface UENVerificationResult {
  isValid: boolean
  exists: boolean
  entityName?: string
  entityType?: string
  entityStatus?: string
  gstRegistered?: boolean
  registrationDate?: string
  lastUpdated?: string
  industry?: string
  error?: string
}

interface CachedVerification extends UENVerificationResult {
  cachedAt: Date
  expiresAt: Date
}

export class UENVerifier {
  private cache: Map<string, CachedVerification> = new Map()
  private cacheDuration = 24 * 60 * 60 * 1000 // 24 hours
  private mockMode = process.env.ACRA_API_KEY ? false : true

  async verifyUEN(uen: string): Promise<UENVerificationResult> {
    // Normalize UEN
    const normalizedUEN = this.normalizeUEN(uen)
    
    // Check cache first
    const cached = this.getFromCache(normalizedUEN)
    if (cached) {
      console.log(`UEN verification cache hit: ${normalizedUEN}`)
      return cached
    }

    // Validate format
    if (!this.isValidFormat(normalizedUEN)) {
      return {
        isValid: false,
        exists: false,
        error: 'Invalid UEN format'
      }
    }

    try {
      // Try real API if available
      if (!this.mockMode) {
        const result = await this.verifyWithACRA(normalizedUEN)
        this.cacheResult(normalizedUEN, result)
        return result
      }
      
      // Otherwise use mock/database verification
      const result = await this.verifyWithMockData(normalizedUEN)
      this.cacheResult(normalizedUEN, result)
      return result
      
    } catch (error) {
      console.error('UEN verification error:', error)
      
      // Fallback to database check
      const dbResult = await this.verifyFromDatabase(normalizedUEN)
      if (dbResult.exists) {
        this.cacheResult(normalizedUEN, dbResult)
        return dbResult
      }
      
      return {
        isValid: false,
        exists: false,
        error: 'Verification service unavailable'
      }
    }
  }

  private normalizeUEN(uen: string): string {
    return uen.toUpperCase().replace(/[^0-9A-Z]/g, '')
  }

  private isValidFormat(uen: string): boolean {
    // Singapore UEN formats
    const patterns = [
      /^[0-9]{8,9}[A-Z]$/,           // Business Registration Number
      /^[0-9]{4}[0-9]{5}[A-Z]$/,     // Local Company
      /^[TRS][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z]$/, // Other Entities
      /^[0-9]{4}[A-Z]{5}[A-Z]$/      // VCC format
    ]
    
    return patterns.some(pattern => pattern.test(uen))
  }

  private async verifyWithACRA(uen: string): Promise<UENVerificationResult> {
    // This would integrate with actual ACRA API
    // For now, throwing to trigger fallback
    throw new Error('ACRA API not implemented')
    
    /* Production implementation would be:
    const response = await fetch(`${ACRA_API_URL}/entities/${uen}`, {
      headers: {
        'Authorization': `Bearer ${process.env.ACRA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`ACRA API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    return {
      isValid: true,
      exists: true,
      entityName: data.entityName,
      entityType: data.entityType,
      entityStatus: data.status,
      gstRegistered: data.gstRegistered,
      registrationDate: data.registrationDate,
      industry: data.primaryActivity
    }
    */
  }

  private async verifyWithMockData(uen: string): Promise<UENVerificationResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Common test UENs
    const mockData: Record<string, Partial<UENVerificationResult>> = {
      '201234567A': {
        entityName: 'ABC TRADING PTE. LTD.',
        entityType: 'LOCAL_COMPANY',
        entityStatus: 'LIVE',
        gstRegistered: true,
        registrationDate: '2020-01-15',
        industry: 'Wholesale Trade'
      },
      '199912345K': {
        entityName: 'XYZ SERVICES PTE. LTD.',
        entityType: 'LOCAL_COMPANY',
        entityStatus: 'LIVE',
        gstRegistered: true,
        registrationDate: '1999-12-01',
        industry: 'Professional Services'
      },
      '53234567M': {
        entityName: 'JOHN DOE ENTERPRISE',
        entityType: 'SOLE_PROPRIETORSHIP',
        entityStatus: 'LIVE',
        gstRegistered: false,
        registrationDate: '2015-06-20',
        industry: 'Retail Trade'
      },
      'T20LL1234A': {
        entityName: 'INNOVATIVE TECH LLP',
        entityType: 'LLP',
        entityStatus: 'LIVE',
        gstRegistered: true,
        registrationDate: '2020-03-10',
        industry: 'Information Technology'
      },
      '198801234W': {
        entityName: 'OLD COMPANY PTE. LTD.',
        entityType: 'LOCAL_COMPANY',
        entityStatus: 'STRUCK_OFF',
        gstRegistered: false,
        registrationDate: '1988-01-01',
        industry: 'Manufacturing'
      }
    }
    
    const data = mockData[uen]
    
    if (data) {
      return {
        isValid: true,
        exists: true,
        ...data,
        lastUpdated: new Date().toISOString()
      }
    }
    
    // For unknown UENs, generate based on pattern
    if (this.isValidFormat(uen)) {
      const year = uen.substring(0, 4)
      const currentYear = new Date().getFullYear()
      const yearNum = parseInt(year)
      
      // Check if it's a plausible year
      if (yearNum >= 1900 && yearNum <= currentYear) {
        return {
          isValid: true,
          exists: true,
          entityName: `COMPANY ${uen}`,
          entityType: uen.startsWith('T') ? 'OTHER_ENTITY' : 'LOCAL_COMPANY',
          entityStatus: 'LIVE',
          gstRegistered: Math.random() > 0.3, // 70% chance of being GST registered
          registrationDate: `${year}-01-01`,
          industry: 'General Business',
          lastUpdated: new Date().toISOString()
        }
      }
    }
    
    return {
      isValid: false,
      exists: false,
      error: 'UEN not found'
    }
  }

  private async verifyFromDatabase(uen: string): Promise<UENVerificationResult> {
    try {
      const supabase = await createClient()
      
      // Check if we've seen this UEN before in our invoices
      const { data: invoices } = await supabase
        .from('invoices')
        .select('vendor_name, vendor_uen, customer_name, customer_uen')
        .or(`vendor_uen.eq.${uen},customer_uen.eq.${uen}`)
        .limit(1)
      
      if (invoices && invoices.length > 0) {
        const invoice = invoices[0]
        const isVendor = invoice.vendor_uen === uen
        const entityName = isVendor ? invoice.vendor_name : invoice.customer_name
        
        return {
          isValid: true,
          exists: true,
          entityName: entityName || `Entity ${uen}`,
          entityType: 'UNKNOWN',
          entityStatus: 'PRESUMED_ACTIVE',
          gstRegistered: isVendor, // Assume vendors are GST registered
          lastUpdated: new Date().toISOString()
        }
      }
      
      // Check known entities table (if exists)
      const { data: entity } = await supabase
        .from('known_entities')
        .select('*')
        .eq('uen', uen)
        .single()
      
      if (entity) {
        return {
          isValid: true,
          exists: true,
          entityName: entity.name,
          entityType: entity.type,
          entityStatus: entity.status,
          gstRegistered: entity.gst_registered,
          registrationDate: entity.registration_date,
          industry: entity.industry,
          lastUpdated: entity.updated_at
        }
      }
    } catch (error) {
      console.error('Database verification error:', error)
    }
    
    return {
      isValid: this.isValidFormat(uen),
      exists: false,
      error: 'Entity not found in database'
    }
  }

  private cacheResult(uen: string, result: UENVerificationResult): void {
    const now = new Date()
    const cached: CachedVerification = {
      ...result,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + this.cacheDuration)
    }
    
    this.cache.set(uen, cached)
    
    // Clean old cache entries
    if (this.cache.size > 1000) {
      this.cleanCache()
    }
  }

  private getFromCache(uen: string): UENVerificationResult | null {
    const cached = this.cache.get(uen)
    
    if (!cached) return null
    
    if (new Date() > cached.expiresAt) {
      this.cache.delete(uen)
      return null
    }
    
    // Return without cache metadata
    const { cachedAt, expiresAt, ...result } = cached
    return result
  }

  private cleanCache(): void {
    const now = new Date()
    const entriesToDelete: string[] = []
    
    this.cache.forEach((value, key) => {
      if (now > value.expiresAt) {
        entriesToDelete.push(key)
      }
    })
    
    entriesToDelete.forEach(key => this.cache.delete(key))
    
    // If still too large, remove oldest entries
    if (this.cache.size > 800) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime())
      
      entries.slice(0, 200).forEach(([key]) => this.cache.delete(key))
    }
  }

  // Batch verification for performance
  async verifyBatch(uens: string[]): Promise<Map<string, UENVerificationResult>> {
    const results = new Map<string, UENVerificationResult>()
    
    // Process in chunks to avoid overwhelming the API
    const chunkSize = 10
    for (let i = 0; i < uens.length; i += chunkSize) {
      const chunk = uens.slice(i, i + chunkSize)
      
      await Promise.all(
        chunk.map(async (uen) => {
          const result = await this.verifyUEN(uen)
          results.set(uen, result)
        })
      )
      
      // Rate limiting
      if (i + chunkSize < uens.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    return results
  }

  // Helper methods for specific entity types
  isLocalCompany(uen: string): boolean {
    return /^[0-9]{4}[0-9]{5}[A-Z]$/.test(uen)
  }

  isSoleProprietorship(uen: string): boolean {
    return /^[0-9]{8,9}[A-Z]$/.test(uen) && !this.isLocalCompany(uen)
  }

  isLLP(uen: string): boolean {
    return uen.startsWith('T') && uen.includes('LL')
  }

  isVCC(uen: string): boolean {
    return /^[0-9]{4}[A-Z]{5}[A-Z]$/.test(uen)
  }

  getEntityTypeFromUEN(uen: string): string {
    if (this.isLocalCompany(uen)) return 'LOCAL_COMPANY'
    if (this.isSoleProprietorship(uen)) return 'SOLE_PROPRIETORSHIP'
    if (this.isLLP(uen)) return 'LLP'
    if (this.isVCC(uen)) return 'VCC'
    if (uen.startsWith('T')) return 'OTHER_ENTITY'
    if (uen.startsWith('S')) return 'SOCIETY'
    if (uen.startsWith('R')) return 'REPRESENTATIVE_OFFICE'
    return 'UNKNOWN'
  }

  // Generate test UEN for development
  generateTestUEN(type: 'company' | 'sole_prop' | 'llp' = 'company'): string {
    const year = new Date().getFullYear()
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const randomLetter = letters[Math.floor(Math.random() * letters.length)]
    
    switch (type) {
      case 'company':
        return `${year}${random}${randomLetter}`
      case 'sole_prop':
        const spNumber = Math.floor(Math.random() * 100000000).toString().padStart(8, '0')
        return `${spNumber}${randomLetter}`
      case 'llp':
        const llLetters = 'LL'
        const llRandom = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
        return `T${year.toString().slice(-2)}${llLetters}${llRandom}${randomLetter}`
      default:
        return `${year}${random}${randomLetter}`
    }
  }
}
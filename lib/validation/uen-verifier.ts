export class UENVerifier {
  private cache: Map<string, UENVerificationResult> = new Map()

  async verifyUEN(uen: string): Promise<UENVerificationResult> {
    // Check cache first
    if (this.cache.has(uen)) {
      return this.cache.get(uen)!
    }

    try {
      // In production, this would call ACRA API
      // For now, we'll simulate the verification
      const result = await this.simulateACRAVerification(uen)
      
      // Cache for 24 hours
      this.cache.set(uen, result)
      setTimeout(() => this.cache.delete(uen), 24 * 60 * 60 * 1000)
      
      return result
    } catch (error) {
      return {
        isValid: false,
        exists: false,
        error: 'Failed to verify UEN'
      }
    }
  }

  private async simulateACRAVerification(uen: string): Promise<UENVerificationResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100))

    // Basic format validation
    const isValidFormat = /^[0-9]{8,9}[A-Z]$/.test(uen)

    if (!isValidFormat) {
      return {
        isValid: false,
        exists: false,
        error: 'Invalid UEN format'
      }
    }

    // In production, this would be actual API response
    return {
      isValid: true,
      exists: true,
      entityName: 'Sample Company Pte Ltd',
      entityType: 'LOCAL_COMPANY',
      entityStatus: 'LIVE',
      gstRegistered: Math.random() > 0.5 // Random for demo
    }
  }
}

interface UENVerificationResult {
  isValid: boolean
  exists: boolean
  entityName?: string
  entityType?: string
  entityStatus?: string
  gstRegistered?: boolean
  error?: string
}
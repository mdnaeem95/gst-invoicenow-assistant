// lib/validation/singapore-gst-validator.ts
import { Invoice, InvoiceItem } from '@/types'
import { UENVerifier } from './uen-verifier'
import { createClient } from '@/lib/supabase/server'

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  suggestions: ValidationSuggestion[]
  score: number
  metadata?: {
    gstRate: number
    effectiveDate: string
    complianceChecks: ComplianceCheck[]
  }
}

export interface ValidationError {
  field: string
  code: string
  message: string
  severity: 'error' | 'critical'
  details?: any
}

export interface ValidationWarning {
  field: string
  code: string
  message: string
  details?: any
}

export interface ValidationSuggestion {
  field: string
  code: string
  suggestion: string
  autoFixAvailable: boolean
  autoFixValue?: any
  confidence: number
}

export interface ComplianceCheck {
  name: string
  passed: boolean
  message?: string
}

export class SingaporeGSTValidator {
  private readonly GST_RATES = {
    '2007-07-01': 7,
    '2023-01-01': 8,
    '2024-01-01': 9
  }
  
  private readonly CURRENT_GST_RATE = 9
  private readonly ZERO_RATED_CATEGORIES = ['EXPORT', 'INTERNATIONAL_SERVICE', 'PRECIOUS_METALS']
  private readonly EXEMPT_CATEGORIES = ['FINANCIAL_SERVICE', 'RESIDENTIAL_PROPERTY', 'DIGITAL_PAYMENT_TOKEN']
  
  private uenVerifier: UENVerifier
  private validationCache: Map<string, ValidationResult> = new Map()

  constructor() {
    this.uenVerifier = new UENVerifier()
  }

  async validateInvoice(invoice: Partial<Invoice>): Promise<ValidationResult> {
    // Check cache first
    const cacheKey = this.generateCacheKey(invoice)
    if (this.validationCache.has(cacheKey)) {
      console.log('Returning cached validation result')
      return this.validationCache.get(cacheKey)!
    }

    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const suggestions: ValidationSuggestion[] = []
    const complianceChecks: ComplianceCheck[] = []

    // Run all validation checks
    await Promise.all([
      this.validateBasicInvoiceData(invoice, errors, warnings, suggestions),
      this.validateGSTCompliance(invoice, errors, warnings, suggestions, complianceChecks),
      this.validateBusinessLogic(invoice, errors, warnings, suggestions),
      this.validatePEPPOLRequirements(invoice, errors, warnings),
      this.validateSingaporeSpecific(invoice, errors, warnings, suggestions)
    ])

    // Calculate validation score
    const score = this.calculateValidationScore(errors, warnings, invoice)

    // Determine effective GST rate
    const effectiveGSTRate = this.getEffectiveGSTRate(invoice.invoice_date)

    const result: ValidationResult = {
      isValid: errors.filter(e => e.severity === 'critical').length === 0,
      errors,
      warnings,
      suggestions,
      score,
      metadata: {
        gstRate: effectiveGSTRate,
        effectiveDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
        complianceChecks
      }
    }

    // Cache the result
    this.validationCache.set(cacheKey, result)
    
    // Clean cache if too large
    if (this.validationCache.size > 100) {
      const firstKey = this.validationCache.keys().next().value
      this.validationCache.delete(firstKey as string)
    }

    return result
  }

  private async validateBasicInvoiceData(
    invoice: Partial<Invoice>,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[]
  ): Promise<void> {
    // Invoice Number
    if (!invoice.invoice_number) {
      errors.push({
        field: 'invoice_number',
        code: 'MISSING_INVOICE_NUMBER',
        message: 'Invoice number is required',
        severity: 'critical'
      })
    } else {
      // Check format
      if (!/^[A-Z0-9\-\/]+$/i.test(invoice.invoice_number)) {
        warnings.push({
          field: 'invoice_number',
          code: 'INVALID_INVOICE_NUMBER_FORMAT',
          message: 'Invoice number should only contain letters, numbers, hyphens, and slashes'
        })
      }
      
      // Check for duplicate (would need DB check in production)
      if (await this.checkDuplicateInvoiceNumber(invoice.invoice_number, invoice.user_id)) {
        errors.push({
          field: 'invoice_number',
          code: 'DUPLICATE_INVOICE_NUMBER',
          message: 'This invoice number already exists',
          severity: 'error'
        })
      }
    }

    // Invoice Date
    if (!invoice.invoice_date) {
      errors.push({
        field: 'invoice_date',
        code: 'MISSING_INVOICE_DATE',
        message: 'Invoice date is required',
        severity: 'critical'
      })
    } else {
      const invoiceDate = new Date(invoice.invoice_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      // Future date check
      if (invoiceDate > today) {
        warnings.push({
          field: 'invoice_date',
          code: 'FUTURE_INVOICE_DATE',
          message: 'Invoice date is in the future. Please verify this is correct.'
        })
      }
      
      // Old invoice check (GST records must be kept for 5 years)
      const fiveYearsAgo = new Date()
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
      
      if (invoiceDate < fiveYearsAgo) {
        warnings.push({
          field: 'invoice_date',
          code: 'OLD_INVOICE_DATE',
          message: 'Invoice is more than 5 years old. GST records retention period may have expired.'
        })
      }
    }

    // Customer validation
    if (!invoice.customer_name) {
      errors.push({
        field: 'customer_name',
        code: 'MISSING_CUSTOMER_NAME',
        message: 'Customer name is required',
        severity: 'critical'
      })
    } else {
      // Check for suspicious patterns
      if (invoice.customer_name.length < 2) {
        errors.push({
          field: 'customer_name',
          code: 'INVALID_CUSTOMER_NAME',
          message: 'Customer name is too short',
          severity: 'error'
        })
      }
    }

    // UEN validation
    if (invoice.customer_uen) {
      const uenValidation = await this.validateUEN(invoice.customer_uen, 'customer')
      if (!uenValidation.isValid) {
        errors.push({
          field: 'customer_uen',
          code: 'INVALID_CUSTOMER_UEN',
          message: uenValidation.message || 'Invalid UEN format',
          severity: 'error',
          details: uenValidation
        })
      } else {
        // Suggest company name if available
        if (uenValidation.entityName && uenValidation.entityName !== invoice.customer_name) {
          suggestions.push({
            field: 'customer_name',
            code: 'SUGGEST_CUSTOMER_NAME',
            suggestion: `Update customer name to: ${uenValidation.entityName}`,
            autoFixAvailable: true,
            autoFixValue: uenValidation.entityName,
            confidence: 0.9
          })
        }
      }
    }

    // Vendor validation
    if (!invoice.vendor_name) {
      warnings.push({
        field: 'vendor_name',
        code: 'MISSING_VENDOR_NAME',
        message: 'Vendor name is recommended for proper documentation'
      })
    }

    if (invoice.vendor_uen) {
      const uenValidation = await this.validateUEN(invoice.vendor_uen, 'vendor')
      if (!uenValidation.isValid) {
        errors.push({
          field: 'vendor_uen',
          code: 'INVALID_VENDOR_UEN',
          message: uenValidation.message || 'Invalid vendor UEN format',
          severity: 'error'
        })
      }
    }
  }

  private async validateGSTCompliance(
    invoice: Partial<Invoice>,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[],
    complianceChecks: ComplianceCheck[]
  ): Promise<void> {
    // Check GST registration
    if (!invoice.vendor_gst_number) {
      errors.push({
        field: 'vendor_gst_number',
        code: 'MISSING_GST_NUMBER',
        message: 'GST registration number is required for tax invoices',
        severity: 'critical'
      })
      
      complianceChecks.push({
        name: 'GST Registration',
        passed: false,
        message: 'Vendor GST number missing'
      })
    } else {
      // Validate GST number format
      const gstValidation = this.validateGSTNumber(invoice.vendor_gst_number)
      if (!gstValidation.isValid) {
        errors.push({
          field: 'vendor_gst_number',
          code: 'INVALID_GST_NUMBER',
          message: gstValidation.message || 'Invalid GST number format',
          severity: 'critical'
        })
      } else {
        complianceChecks.push({
          name: 'GST Registration',
          passed: true
        })
      }
    }

    // Validate GST calculations
    if (invoice.items && invoice.items.length > 0) {
      const calculations = this.calculateGST(invoice.items, invoice.invoice_date)
      let gstDiff = 0
      let totalDiff = 0

      // Check subtotal
      if (invoice.subtotal !== undefined) {
        const subtotalDiff = Math.abs(invoice.subtotal - calculations.subtotal)
        if (subtotalDiff > 0.01) {
          errors.push({
            field: 'subtotal',
            code: 'INCORRECT_SUBTOTAL',
            message: `Subtotal mismatch. Expected: $${calculations.subtotal.toFixed(2)}, Got: $${invoice.subtotal.toFixed(2)}`,
            severity: 'error'
          })
          
          suggestions.push({
            field: 'subtotal',
            code: 'FIX_SUBTOTAL',
            suggestion: `Update subtotal to $${calculations.subtotal.toFixed(2)}`,
            autoFixAvailable: true,
            autoFixValue: calculations.subtotal,
            confidence: 0.95
          })
        }
      }

      // Check GST amount
      if (invoice.gst_amount !== undefined) {
        const gstDiff = Math.abs(invoice.gst_amount - calculations.gstAmount)
        if (gstDiff > 0.01) {
          errors.push({
            field: 'gst_amount',
            code: 'INCORRECT_GST_AMOUNT',
            message: `GST amount mismatch. Expected: $${calculations.gstAmount.toFixed(2)}, Got: $${invoice.gst_amount.toFixed(2)}`,
            severity: 'error'
          })
          
          suggestions.push({
            field: 'gst_amount',
            code: 'FIX_GST_AMOUNT',
            suggestion: `Update GST amount to $${calculations.gstAmount.toFixed(2)}`,
            autoFixAvailable: true,
            autoFixValue: calculations.gstAmount,
            confidence: 0.95
          })
        }
      }

      // Check total
      if (invoice.total_amount !== undefined) {
        const totalDiff = Math.abs(invoice.total_amount - calculations.total)
        if (totalDiff > 0.01) {
          errors.push({
            field: 'total_amount',
            code: 'INCORRECT_TOTAL',
            message: `Total amount mismatch. Expected: $${calculations.total.toFixed(2)}, Got: $${invoice.total_amount.toFixed(2)}`,
            severity: 'error'
          })
          
          suggestions.push({
            field: 'total_amount',
            code: 'FIX_TOTAL',
            suggestion: `Update total to $${calculations.total.toFixed(2)}`,
            autoFixAvailable: true,
            autoFixValue: calculations.total,
            confidence: 0.95
          })
        }
      }

      // GST rate validation
      const effectiveRate = this.getEffectiveGSTRate(invoice.invoice_date)
      const hasIncorrectRate = invoice.items.some(item => 
        item.tax_category === 'S' && item.gst_rate !== effectiveRate
      )
      
      if (hasIncorrectRate) {
        errors.push({
          field: 'items',
          code: 'INCORRECT_GST_RATE',
          message: `GST rate should be ${effectiveRate}% for invoice date ${invoice.invoice_date}`,
          severity: 'error'
        })
      }

      complianceChecks.push({
        name: 'GST Calculation',
        passed: gstDiff <= 0.01 && totalDiff <= 0.01
      })
    }

    // Check for reverse charge
    if (this.isReverseChargeApplicable(invoice)) {
      warnings.push({
        field: 'gst_amount',
        code: 'REVERSE_CHARGE_APPLICABLE',
        message: 'This appears to be an imported service. Customer may need to account for GST under reverse charge.',
        details: {
          info: 'For B2B imported services, the GST-registered customer accounts for GST instead of the supplier.'
        }
      })
      
      complianceChecks.push({
        name: 'Reverse Charge',
        passed: true,
        message: 'Reverse charge rules may apply'
      })
    }

    // Check for zero-rated supplies
    if (invoice.gst_amount === 0 && invoice.subtotal && invoice.subtotal > 0) {
      const hasZeroRatedItems = invoice.items?.some(item => item.tax_category === 'Z')
      
      if (!hasZeroRatedItems) {
        warnings.push({
          field: 'gst_amount',
          code: 'ZERO_GST_WITHOUT_CATEGORY',
          message: 'Invoice has zero GST but no items marked as zero-rated. Please verify if this is an export or international service.'
        })
      }
    }
  }

  private async validateBusinessLogic(
    invoice: Partial<Invoice>,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[]
  ): Promise<void> {
    // Payment terms validation
    if (invoice.due_date && invoice.invoice_date) {
      const invoiceDate = new Date(invoice.invoice_date)
      const dueDate = new Date(invoice.due_date)
      const daysDiff = Math.floor((dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysDiff < 0) {
        errors.push({
          field: 'due_date',
          code: 'DUE_DATE_BEFORE_INVOICE',
          message: 'Due date cannot be before invoice date',
          severity: 'error'
        })
      } else if (daysDiff === 0) {
        warnings.push({
          field: 'due_date',
          code: 'SAME_DAY_PAYMENT',
          message: 'Due date is same as invoice date (immediate payment terms)'
        })
      } else if (daysDiff > 120) {
        warnings.push({
          field: 'due_date',
          code: 'EXCESSIVE_PAYMENT_TERMS',
          message: `Payment terms of ${daysDiff} days exceed typical business practice`
        })
      }
      
      // Suggest standard payment terms
      if (!invoice.payment_terms) {
        const standardTerms = this.getStandardPaymentTerms(daysDiff)
        if (standardTerms) {
          suggestions.push({
            field: 'payment_terms',
            code: 'SUGGEST_PAYMENT_TERMS',
            suggestion: `Add payment terms: ${standardTerms}`,
            autoFixAvailable: true,
            autoFixValue: standardTerms,
            confidence: 0.8
          })
        }
      }
    }

    // Amount validation
    if (invoice.total_amount !== undefined) {
      if (invoice.total_amount <= 0) {
        errors.push({
          field: 'total_amount',
          code: 'INVALID_TOTAL_AMOUNT',
          message: 'Total amount must be greater than zero',
          severity: 'error'
        })
      } else if (invoice.total_amount > 10000000) { // $10M SGD
        warnings.push({
          field: 'total_amount',
          code: 'UNUSUALLY_HIGH_AMOUNT',
          message: 'Total amount exceeds $10,000,000. Please verify this is correct.',
          details: {
            amount: invoice.total_amount,
            threshold: 10000000
          }
        })
      } else if (invoice.total_amount < 1) {
        warnings.push({
          field: 'total_amount',
          code: 'UNUSUALLY_LOW_AMOUNT',
          message: 'Total amount is less than $1. Please verify this is correct.'
        })
      }
    }

    // Line items validation
    if (invoice.items) {
      invoice.items.forEach((item, index) => {
        // Description validation
        if (!item.description || item.description.trim().length === 0) {
          errors.push({
            field: `items[${index}].description`,
            code: 'MISSING_ITEM_DESCRIPTION',
            message: `Line item ${index + 1} is missing description`,
            severity: 'error'
          })
        } else if (item.description.length < 3) {
          warnings.push({
            field: `items[${index}].description`,
            code: 'SHORT_ITEM_DESCRIPTION',
            message: `Line item ${index + 1} has very short description`
          })
        }

        // Quantity validation
        if (item.quantity <= 0) {
          errors.push({
            field: `items[${index}].quantity`,
            code: 'INVALID_QUANTITY',
            message: `Line item ${index + 1} has invalid quantity (${item.quantity})`,
            severity: 'error'
          })
        } else if (item.quantity % 1 !== 0 && item.unit_of_measure === 'EA') {
          warnings.push({
            field: `items[${index}].quantity`,
            code: 'FRACTIONAL_QUANTITY',
            message: `Line item ${index + 1} has fractional quantity for unit "Each"`
          })
        }

        // Price validation
        if (item.unit_price < 0) {
          errors.push({
            field: `items[${index}].unit_price`,
            code: 'NEGATIVE_UNIT_PRICE',
            message: `Line item ${index + 1} has negative unit price`,
            severity: 'error'
          })
        }

        // GST rate validation for Singapore
        if (item.tax_category === 'S') {
          const expectedRate = this.getEffectiveGSTRate(invoice.invoice_date)
          if (item.gst_rate !== expectedRate) {
            errors.push({
              field: `items[${index}].gst_rate`,
              code: 'INCORRECT_GST_RATE',
              message: `Line item ${index + 1} has incorrect GST rate. Expected ${expectedRate}% for standard rated items`,
              severity: 'error'
            })
          }
        } else if (item.tax_category === 'Z' && item.gst_rate !== 0) {
          errors.push({
            field: `items[${index}].gst_rate`,
            code: 'ZERO_RATED_WITH_GST',
            message: `Line item ${index + 1} is zero-rated but has GST rate of ${item.gst_rate}%`,
            severity: 'error'
          })
        }

        // Check for common description patterns that might indicate special handling
        const descLower = item.description.toLowerCase()
        if (descLower.includes('export') || descLower.includes('overseas')) {
          if (item.tax_category !== 'Z') {
            suggestions.push({
              field: `items[${index}].tax_category`,
              code: 'SUGGEST_ZERO_RATING',
              suggestion: `Line item ${index + 1} appears to be an export. Consider zero-rating (GST 0%)`,
              autoFixAvailable: true,
              autoFixValue: 'Z',
              confidence: 0.7
            })
          }
        }
      })
    } else {
      errors.push({
        field: 'items',
        code: 'NO_LINE_ITEMS',
        message: 'Invoice must have at least one line item',
        severity: 'critical'
      })
    }
  }

  private validatePEPPOLRequirements(
    invoice: Partial<Invoice>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // PEPPOL BIS 3.0 mandatory fields for Singapore
    const mandatoryFields = [
      { field: 'invoice_number', name: 'Invoice Number' },
      { field: 'invoice_date', name: 'Invoice Date' },
      { field: 'customer_name', name: 'Customer Name' },
      { field: 'vendor_uen', name: 'Supplier UEN' },
      { field: 'vendor_gst_number', name: 'Supplier GST Number' },
      { field: 'currency', name: 'Currency Code' }
    ]

    mandatoryFields.forEach(({ field, name }) => {
      if (!invoice[field as keyof Invoice]) {
        errors.push({
          field,
          code: `PEPPOL_MISSING_${field.toUpperCase()}`,
          message: `${name} is mandatory for InvoiceNow/PEPPOL compliance`,
          severity: 'critical'
        })
      }
    })

    // Validate currency (must be SGD for local invoices)
    if (invoice.currency && invoice.currency !== 'SGD') {
      warnings.push({
        field: 'currency',
        code: 'NON_SGD_CURRENCY',
        message: 'Non-SGD currency detected. Additional exchange rate information may be required for PEPPOL.'
      })
    }

    // Check for buyer reference (recommended)
    if (!invoice.metadata?.buyerReference) {
      warnings.push({
        field: 'metadata.buyerReference',
        code: 'MISSING_BUYER_REFERENCE',
        message: 'Buyer reference is recommended for PEPPOL invoices'
      })
    }

    // Validate address requirements
    if (!invoice.vendor_address) {
      warnings.push({
        field: 'vendor_address',
        code: 'MISSING_VENDOR_ADDRESS',
        message: 'Vendor address is recommended for complete PEPPOL compliance'
      })
    }

    // Check for at least one line item
    if (!invoice.items || invoice.items.length === 0) {
      errors.push({
        field: 'items',
        code: 'PEPPOL_NO_LINE_ITEMS',
        message: 'At least one line item is required for PEPPOL compliance',
        severity: 'critical'
      })
    }
  }

  private async validateSingaporeSpecific(
    invoice: Partial<Invoice>,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[]
  ): Promise<void> {
    // Validate against IRAS requirements
    if (invoice.vendor_gst_number && invoice.total_amount) {
      // Check GST registration threshold
      const annualRevenue = await this.estimateAnnualRevenue(invoice.vendor_uen)
      if (annualRevenue < 1000000 && invoice.vendor_gst_number) {
        warnings.push({
          field: 'vendor_gst_number',
          code: 'BELOW_GST_THRESHOLD',
          message: 'Vendor may be below GST registration threshold ($1M annual revenue)'
        })
      }
    }

    // Check for e-invoice mandate compliance
    const mandateDate = new Date('2025-11-01')
    const invoiceDate = invoice.invoice_date ? new Date(invoice.invoice_date) : new Date()
    
    if (invoiceDate >= mandateDate && !invoice.peppol_id) {
      warnings.push({
        field: 'peppol_id',
        code: 'EINVOICE_MANDATE',
        message: 'E-invoicing via InvoiceNow is mandatory from 1 Nov 2025 for GST-registered businesses'
      })
    }

    // Validate GST grouping if applicable
    if (invoice.metadata?.gstGroupRegistration) {
      if (!invoice.metadata.representativeMemberUEN) {
        errors.push({
          field: 'metadata.representativeMemberUEN',
          code: 'MISSING_GST_GROUP_REP',
          message: 'Representative member UEN required for GST group registration',
          severity: 'error'
        })
      }
    }

    // Check for special schemes
    if (invoice.metadata?.touristRefundScheme) {
      if (invoice.total_amount && invoice.total_amount < 100) {
        warnings.push({
          field: 'total_amount',
          code: 'TOURIST_REFUND_MIN_AMOUNT',
          message: 'Minimum purchase of $100 required for Tourist Refund Scheme'
        })
      }
    }

    // Validate digital payment token transactions
    if (invoice.payment_method?.toLowerCase().includes('crypto') || 
        invoice.payment_method?.toLowerCase().includes('bitcoin')) {
      warnings.push({
        field: 'payment_method',
        code: 'DIGITAL_PAYMENT_TOKEN',
        message: 'Digital payment tokens are exempt from GST in Singapore'
      })
      
      suggestions.push({
        field: 'items',
        code: 'SUGGEST_DPT_EXEMPTION',
        suggestion: 'Consider marking digital payment token transactions as GST exempt',
        autoFixAvailable: false,
        confidence: 0.6
      })
    }
  }

  // Helper methods
  private calculateGST(items: InvoiceItem[], invoiceDate?: string): {
    subtotal: number
    gstAmount: number
    total: number
    breakdown: Record<string, number>
  } {
    let subtotal = 0
    let gstAmount = 0
    const breakdown: Record<string, number> = {}
    const effectiveRate = this.getEffectiveGSTRate(invoiceDate)

    items.forEach(item => {
      const lineAmount = item.quantity * item.unit_price
      const discount = item.discount_amount || 0
      const amountAfterDiscount = lineAmount - discount
      
      subtotal += amountAfterDiscount

      switch (item.tax_category) {
        case 'S': // Standard rated
          const itemGST = amountAfterDiscount * (effectiveRate / 100)
          gstAmount += itemGST
          breakdown['standard'] = (breakdown['standard'] || 0) + itemGST
          break
        case 'Z': // Zero-rated
          breakdown['zero-rated'] = (breakdown['zero-rated'] || 0) + 0
          break
        case 'E': // Exempt
          breakdown['exempt'] = (breakdown['exempt'] || 0) + 0
          break
        default:
          // Assume standard rate if not specified
          const defaultGST = amountAfterDiscount * (effectiveRate / 100)
          gstAmount += defaultGST
          breakdown['standard'] = (breakdown['standard'] || 0) + defaultGST
      }
    })

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      gstAmount: Math.round(gstAmount * 100) / 100,
      total: Math.round((subtotal + gstAmount) * 100) / 100,
      breakdown
    }
  }

  private getEffectiveGSTRate(invoiceDate?: string): number {
    if (!invoiceDate) return this.CURRENT_GST_RATE

    const date = new Date(invoiceDate)
    let effectiveRate = this.CURRENT_GST_RATE

    // Check historical rates
    for (const [effectiveDate, rate] of Object.entries(this.GST_RATES).reverse()) {
      if (date >= new Date(effectiveDate)) {
        effectiveRate = rate
        break
      }
    }

    return effectiveRate
  }

  private async validateUEN(uen: string, type: 'customer' | 'vendor'): Promise<{
    isValid: boolean
    message?: string
    entityName?: string
    entityType?: string
    gstRegistered?: boolean
  }> {
    // Basic format validation
    const patterns = [
      /^[0-9]{8,9}[A-Z]$/,  // Business/Company format
      /^[TRS][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z]$/  // Other entity formats
    ]
    
    const isValidFormat = patterns.some(pattern => pattern.test(uen))
    
    if (!isValidFormat) {
      return {
        isValid: false,
        message: 'Invalid UEN format. Expected: NNNNNNNNX (8-9 digits + letter) or special entity format'
      }
    }

    // Verify with ACRA (using our verifier service)
    try {
      const verification = await this.uenVerifier.verifyUEN(uen)
      
      if (!verification.exists) {
        return {
          isValid: false,
          message: 'UEN not found in ACRA records'
        }
      }

      if (verification.entityStatus !== 'LIVE') {
        return {
          isValid: false,
          message: `Entity status is ${verification.entityStatus}`
        }
      }

      return {
        isValid: true,
        entityName: verification.entityName,
        entityType: verification.entityType,
        gstRegistered: verification.gstRegistered
      }
    } catch (error) {
      // If verification fails, just do format validation
      console.error('UEN verification error:', error)
      return {
        isValid: isValidFormat,
        message: isValidFormat ? undefined : 'Invalid UEN format'
      }
    }
  }

  private validateGSTNumber(gstNumber: string): {
    isValid: boolean
    message?: string
    format?: string
  } {
    // Singapore GST registration number formats
    const patterns = [
      { regex: /^GST[0-9]{8}$/, format: 'GSTNNNNNNNN' },
      { regex: /^M[0-9]-[0-9]{7}-[0-9]$/, format: 'MN-NNNNNNN-N' }
    ]
    
    for (const { regex, format } of patterns) {
      if (regex.test(gstNumber)) {
        // Additional checksum validation for M format
        if (format.startsWith('M')) {
          if (!this.validateGSTChecksum(gstNumber)) {
            return {
              isValid: false,
              message: 'Invalid GST number checksum'
            }
          }
        }
        
        return {
          isValid: true,
          format
        }
      }
    }
    
    return {
      isValid: false,
      message: 'Invalid GST number format. Expected: GSTNNNNNNNN or MN-NNNNNNN-N'
    }
  }

  private validateGSTChecksum(gstNumber: string): boolean {
    // Implement GST checksum validation for M format
    // This is a simplified version - actual algorithm would be more complex
    if (!gstNumber.startsWith('M')) return false
    
    const parts = gstNumber.split('-')
    if (parts.length !== 3) return false
    
    // Simple checksum (in reality, IRAS uses a specific algorithm)
    const checkDigit = parseInt(parts[2])
    const calculated = parseInt(parts[1]) % 10
    
    return checkDigit === calculated
  }

  private isReverseChargeApplicable(invoice: Partial<Invoice>): boolean {
    // Check if this is an imported service subject to reverse charge
    if (!invoice.vendor_address) return false

    // Check if vendor is overseas
    const isOverseasVendor = !invoice.vendor_address.toLowerCase().includes('singapore') &&
                            !invoice.vendor_gst_number

    // Check if it's a service (not goods)
    const isService = invoice.items?.some(item => {
      const desc = item.description.toLowerCase()
      return desc.includes('service') ||
             desc.includes('consulting') ||
             desc.includes('software') ||
             desc.includes('subscription') ||
             desc.includes('license') ||
             desc.includes('fee')
    })

    // Check if customer is GST registered (reverse charge only applies to B2B)
    const isB2B = invoice.customer_uen || 
                  invoice.metadata?.customerGSTRegistered

    return !!(isOverseasVendor && isService && isB2B)
  }

  private getStandardPaymentTerms(days: number): string {
    if (days === 0) return 'Immediate'
    if (days === 7) return 'Net 7'
    if (days === 14) return 'Net 14'
    if (days === 30) return 'Net 30'
    if (days === 60) return 'Net 60'
    if (days === 90) return 'Net 90'
    return `Net ${days}`
  }

  private async checkDuplicateInvoiceNumber(
    invoiceNumber: string, 
    userId?: string
  ): Promise<boolean> {
    if (!userId) return false
    
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('invoices')
        .select('id')
        .eq('user_id', userId)
        .eq('invoice_number', invoiceNumber)
        .limit(1)
      
      return (data && data.length > 0) || false
    } catch (error) {
      console.error('Error checking duplicate invoice:', error)
      return false
    }
  }

  private async estimateAnnualRevenue(uen?: string): Promise<number> {
    // In production, this would query actual revenue data
    // For now, return a placeholder
    return 2000000 // $2M SGD
  }

  private calculateValidationScore(
    errors: ValidationError[],
    warnings: ValidationWarning[],
    invoice: Partial<Invoice>
  ): number {
    let score = 100

    // Deduct points for errors
    errors.forEach(error => {
      if (error.severity === 'critical') {
        score -= 20
      } else {
        score -= 10
      }
    })

    // Deduct smaller points for warnings
    warnings.forEach(() => {
      score -= 2
    })

    // Bonus points for completeness
    if (invoice.vendor_uen) score += 2
    if (invoice.customer_uen) score += 2
    if (invoice.payment_terms) score += 1
    if (invoice.items && invoice.items.length > 0) score += 3

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score))
  }

  private generateCacheKey(invoice: Partial<Invoice>): string {
    // Create a simple hash for caching
    const key = `${invoice.invoice_number}-${invoice.invoice_date}-${invoice.total_amount}`
    return Buffer.from(key).toString('base64')
  }

  // Auto-fix functionality
  async autoFixInvoice(
    invoice: Partial<Invoice>,
    validationResult: ValidationResult
  ): Promise<Partial<Invoice>> {
    const fixed = { ...invoice }

    // Apply auto-fixes with high confidence
    validationResult.suggestions
      .filter(s => s.autoFixAvailable && s.confidence >= 0.8)
      .forEach(suggestion => {
        if (suggestion.autoFixValue !== undefined) {
          // Handle nested fields
          if (suggestion.field.includes('.')) {
            const parts = suggestion.field.split('.')
            let target: any = fixed
            
            for (let i = 0; i < parts.length - 1; i++) {
              if (!target[parts[i]]) {
                target[parts[i]] = {}
              }
              target = target[parts[i]]
            }
            
            target[parts[parts.length - 1]] = suggestion.autoFixValue
          } else if (suggestion.field.includes('[')) {
            // Handle array fields like items[0].gst_rate
            const match = suggestion.field.match(/(\w+)\[(\d+)\]\.(\w+)/)
            if (match && fixed[match[1] as keyof typeof fixed]) {
              const array = fixed[match[1] as keyof typeof fixed] as any[]
              const index = parseInt(match[2])
              if (array[index]) {
                array[index][match[3]] = suggestion.autoFixValue
              }
            }
          } else {
            (fixed as any)[suggestion.field] = suggestion.autoFixValue
          }
        }
      })

    // Recalculate totals if items were modified
    if (fixed.items && fixed.items.length > 0) {
      const calculations = this.calculateGST(fixed.items, fixed.invoice_date)
      fixed.subtotal = calculations.subtotal
      fixed.gst_amount = calculations.gstAmount
      fixed.total_amount = calculations.total
    }

    return fixed
  }

  // Generate validation report
  generateValidationReport(result: ValidationResult): string {
    const report = []
    
    report.push('=== GST INVOICE VALIDATION REPORT ===')
    report.push(`Validation Score: ${result.score}/100`)
    report.push(`Status: ${result.isValid ? 'VALID' : 'INVALID'}`)
    report.push('')

    if (result.metadata) {
      report.push('=== COMPLIANCE INFO ===')
      report.push(`Effective GST Rate: ${result.metadata.gstRate}%`)
      report.push(`Invoice Date: ${result.metadata.effectiveDate}`)
      report.push('')
    }

    if (result.errors.length > 0) {
      report.push('=== ERRORS ===')
      result.errors.forEach(error => {
        report.push(`[${error.severity.toUpperCase()}] ${error.field}: ${error.message}`)
      })
      report.push('')
    }

    if (result.warnings.length > 0) {
      report.push('=== WARNINGS ===')
      result.warnings.forEach(warning => {
        report.push(`${warning.field}: ${warning.message}`)
      })
      report.push('')
    }

    if (result.suggestions.length > 0) {
      report.push('=== SUGGESTIONS ===')
      result.suggestions.forEach(suggestion => {
        report.push(`${suggestion.field}: ${suggestion.suggestion}`)
        if (suggestion.autoFixAvailable) {
          report.push(`  -> Auto-fix available (confidence: ${suggestion.confidence})`)
        }
      })
      report.push('')
    }

    if (result.metadata?.complianceChecks) {
      report.push('=== COMPLIANCE CHECKS ===')
      result.metadata.complianceChecks.forEach(check => {
        report.push(`${check.name}: ${check.passed ? 'PASSED' : 'FAILED'}`)
        if (check.message) {
          report.push(`  -> ${check.message}`)
        }
      })
    }

    return report.join('\n')
  }
}
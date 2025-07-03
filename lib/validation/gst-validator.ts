import { Invoice, InvoiceItem } from '@/types'

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  suggestions: ValidationSuggestion[]
}

export interface ValidationError {
  field: string
  code: string
  message: string
  severity: 'error' | 'critical'
}

export interface ValidationWarning {
  field: string
  code: string
  message: string
}

export interface ValidationSuggestion {
  field: string
  suggestion: string
  autoFixAvailable: boolean
  autoFixValue?: any
}

export class SingaporeGSTValidator {
  private readonly GST_RATE = 9 // Current Singapore GST rate
  private readonly GST_EFFECTIVE_DATE = '2023-01-01'
  private readonly ZERO_RATED_CATEGORIES = ['EXPORT', 'INTERNATIONAL_SERVICE']
  private readonly EXEMPT_CATEGORIES = ['FINANCIAL_SERVICE', 'RESIDENTIAL_PROPERTY']

  async validateInvoice(invoice: Partial<Invoice>): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const suggestions: ValidationSuggestion[] = []

    // Basic invoice validation
    this.validateBasicInvoiceData(invoice, errors, warnings)
    
    // GST-specific validation
    await this.validateGSTCompliance(invoice, errors, warnings, suggestions)
    
    // Business logic validation
    this.validateBusinessLogic(invoice, errors, warnings, suggestions)
    
    // PEPPOL/InvoiceNow specific validation
    this.validatePEPPOLRequirements(invoice, errors, warnings)

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    }
  }

  private validateBasicInvoiceData(
    invoice: Partial<Invoice>, 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ) {
    // Invoice number
    if (!invoice.invoice_number) {
      errors.push({
        field: 'invoice_number',
        code: 'MISSING_INVOICE_NUMBER',
        message: 'Invoice number is required',
        severity: 'error'
      })
    } else if (!/^[A-Z0-9\-\/]+$/i.test(invoice.invoice_number)) {
      warnings.push({
        field: 'invoice_number',
        code: 'INVALID_INVOICE_NUMBER_FORMAT',
        message: 'Invoice number should only contain letters, numbers, hyphens, and slashes'
      })
    }

    // Invoice date
    if (!invoice.invoice_date) {
      errors.push({
        field: 'invoice_date',
        code: 'MISSING_INVOICE_DATE',
        message: 'Invoice date is required',
        severity: 'error'
      })
    } else {
      const invoiceDate = new Date(invoice.invoice_date)
      const today = new Date()
      
      if (invoiceDate > today) {
        warnings.push({
          field: 'invoice_date',
          code: 'FUTURE_INVOICE_DATE',
          message: 'Invoice date is in the future'
        })
      }
      
      // Check if invoice is too old (more than 5 years)
      const fiveYearsAgo = new Date()
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
      
      if (invoiceDate < fiveYearsAgo) {
        warnings.push({
          field: 'invoice_date',
          code: 'OLD_INVOICE_DATE',
          message: 'Invoice is more than 5 years old. GST records must be kept for 5 years.'
        })
      }
    }

    // Customer validation
    if (!invoice.customer_name) {
      errors.push({
        field: 'customer_name',
        code: 'MISSING_CUSTOMER_NAME',
        message: 'Customer name is required',
        severity: 'error'
      })
    }

    // UEN validation for B2B
    if (invoice.customer_uen) {
      if (!this.validateUEN(invoice.customer_uen)) {
        errors.push({
          field: 'customer_uen',
          code: 'INVALID_UEN_FORMAT',
          message: 'Invalid UEN format. Expected format: NNNNNNNNX (8-9 digits followed by a letter)',
          severity: 'error'
        })
      }
    }
  }

  private async validateGSTCompliance(
    invoice: Partial<Invoice>,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[]
  ) {
    // Check if vendor is GST registered
    if (!invoice.vendor_gst_number) {
      errors.push({
        field: 'vendor_gst_number',
        code: 'MISSING_GST_NUMBER',
        message: 'Vendor GST registration number is required for GST invoices',
        severity: 'critical'
      })
      return
    }

    // Validate GST number format
    if (!this.validateGSTNumber(invoice.vendor_gst_number)) {
      errors.push({
        field: 'vendor_gst_number',
        code: 'INVALID_GST_NUMBER',
        message: 'Invalid GST number format. Expected: GSTNNNNNNNN or MN-NNNNNNN-N',
        severity: 'critical'
      })
    }

    // Validate GST calculations
    if (invoice.items && invoice.items.length > 0) {
      const calculations = this.calculateGST(invoice.items)
      
      // Check subtotal
      if (invoice.subtotal !== undefined && Math.abs(invoice.subtotal - calculations.subtotal) > 0.01) {
        errors.push({
          field: 'subtotal',
          code: 'INCORRECT_SUBTOTAL',
          message: `Subtotal mismatch. Expected: $${calculations.subtotal.toFixed(2)}, Got: $${invoice.subtotal.toFixed(2)}`,
          severity: 'error'
        })
        
        suggestions.push({
          field: 'subtotal',
          suggestion: `Update subtotal to $${calculations.subtotal.toFixed(2)}`,
          autoFixAvailable: true,
          autoFixValue: calculations.subtotal
        })
      }

      // Check GST amount
      if (invoice.gst_amount !== undefined && Math.abs(invoice.gst_amount - calculations.gstAmount) > 0.01) {
        errors.push({
          field: 'gst_amount',
          code: 'INCORRECT_GST_AMOUNT',
          message: `GST amount mismatch. Expected: $${calculations.gstAmount.toFixed(2)}, Got: $${invoice.gst_amount.toFixed(2)}`,
          severity: 'error'
        })
        
        suggestions.push({
          field: 'gst_amount',
          suggestion: `Update GST amount to $${calculations.gstAmount.toFixed(2)}`,
          autoFixAvailable: true,
          autoFixValue: calculations.gstAmount
        })
      }

      // Check total
      if (invoice.total_amount !== undefined && Math.abs(invoice.total_amount - calculations.total) > 0.01) {
        errors.push({
          field: 'total_amount',
          code: 'INCORRECT_TOTAL',
          message: `Total amount mismatch. Expected: $${calculations.total.toFixed(2)}, Got: $${invoice.total_amount.toFixed(2)}`,
          severity: 'error'
        })
        
        suggestions.push({
          field: 'total_amount',
          suggestion: `Update total to $${calculations.total.toFixed(2)}`,
          autoFixAvailable: true,
          autoFixValue: calculations.total
        })
      }
    }

    // Check for reverse charge scenarios
    if (this.isReverseChargeApplicable(invoice)) {
      warnings.push({
        field: 'gst_amount',
        code: 'REVERSE_CHARGE_APPLICABLE',
        message: 'This appears to be an imported service. Reverse charge may apply.'
      })
    }

    // Validate GST rate changes
    if (invoice.invoice_date) {
      const invoiceDate = new Date(invoice.invoice_date)
      const gstChangeDate = new Date('2023-01-01') // 8% to 9% change
      
      if (invoiceDate < gstChangeDate && invoice.items?.some(item => item.gst_rate === 9)) {
        errors.push({
          field: 'items',
          code: 'INCORRECT_GST_RATE_FOR_DATE',
          message: 'GST rate should be 8% for invoices before 1 Jan 2023',
          severity: 'error'
        })
      }
    }
  }

  private validateBusinessLogic(
    invoice: Partial<Invoice>,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[]
  ) {
    // Check for duplicate invoice numbers (would need database check)
    // This is a placeholder - actual implementation would query the database
    
    // Validate payment terms
    if (invoice.due_date && invoice.invoice_date) {
      const invoiceDate = new Date(invoice.invoice_date)
      const dueDate = new Date(invoice.due_date)
      const daysDiff = Math.floor((dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysDiff < 0) {
        errors.push({
          field: 'due_date',
          code: 'DUE_DATE_BEFORE_INVOICE_DATE',
          message: 'Due date cannot be before invoice date',
          severity: 'error'
        })
      } else if (daysDiff > 120) {
        warnings.push({
          field: 'due_date',
          code: 'EXCESSIVE_PAYMENT_TERMS',
          message: 'Payment terms exceed 120 days'
        })
      }
    }

    // Check for reasonable amounts
    if (invoice.total_amount !== undefined) {
      if (invoice.total_amount <= 0) {
        errors.push({
          field: 'total_amount',
          code: 'INVALID_TOTAL_AMOUNT',
          message: 'Total amount must be greater than zero',
          severity: 'error'
        })
      } else if (invoice.total_amount > 10000000) { // $10M
        warnings.push({
          field: 'total_amount',
          code: 'UNUSUALLY_HIGH_AMOUNT',
          message: 'Total amount seems unusually high. Please verify.'
        })
      }
    }

    // Validate line items
    if (invoice.items) {
      invoice.items.forEach((item, index) => {
        if (!item.description || item.description.trim().length === 0) {
          errors.push({
            field: `items[${index}].description`,
            code: 'MISSING_ITEM_DESCRIPTION',
            message: `Line item ${index + 1} is missing description`,
            severity: 'error'
          })
        }

        if (item.quantity <= 0) {
          errors.push({
            field: `items[${index}].quantity`,
            code: 'INVALID_QUANTITY',
            message: `Line item ${index + 1} has invalid quantity`,
            severity: 'error'
          })
        }

        if (item.unit_price < 0) {
          errors.push({
            field: `items[${index}].unit_price`,
            code: 'NEGATIVE_UNIT_PRICE',
            message: `Line item ${index + 1} has negative unit price`,
            severity: 'error'
          })
        }

        // Check GST rate
        if (item.gst_rate !== 0 && item.gst_rate !== 9) {
          errors.push({
            field: `items[${index}].gst_rate`,
            code: 'INVALID_GST_RATE',
            message: `Line item ${index + 1} has invalid GST rate. Must be 0% or 9%`,
            severity: 'error'
          })
        }
      })
    }
  }

  private validatePEPPOLRequirements(
    invoice: Partial<Invoice>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ) {
    // PEPPOL BIS 3.0 mandatory fields
    const mandatoryFields = [
      { field: 'invoice_number', name: 'Invoice Number' },
      { field: 'invoice_date', name: 'Invoice Date' },
      { field: 'customer_name', name: 'Customer Name' },
      { field: 'vendor_name', name: 'Vendor Name' },
      { field: 'vendor_uen', name: 'Vendor UEN' },
      { field: 'total_amount', name: 'Total Amount' },
      { field: 'currency', name: 'Currency' }
    ]

    mandatoryFields.forEach(({ field, name }) => {
      if (!invoice[field as keyof Invoice]) {
        errors.push({
          field,
          code: `PEPPOL_MISSING_${field.toUpperCase()}`,
          message: `${name} is required for PEPPOL compliance`,
          severity: 'error'
        })
      }
    })

    // Check for at least one line item
    if (!invoice.items || invoice.items.length === 0) {
      errors.push({
        field: 'items',
        code: 'PEPPOL_NO_LINE_ITEMS',
        message: 'At least one line item is required for PEPPOL compliance',
        severity: 'error'
      })
    }

    // Validate currency
    if (invoice.currency && invoice.currency !== 'SGD') {
      warnings.push({
        field: 'currency',
        code: 'NON_SGD_CURRENCY',
        message: 'Non-SGD invoices may require additional exchange rate information'
      })
    }
  }

  private calculateGST(items: InvoiceItem[]): {
    subtotal: number
    gstAmount: number
    total: number
  } {
    let subtotal = 0
    let gstAmount = 0

    items.forEach(item => {
      const lineAmount = item.quantity * item.unit_price
      const discount = item.discount_amount || 0
      const amountAfterDiscount = lineAmount - discount
      
      subtotal += amountAfterDiscount
      
      if (item.tax_category === 'S') { // Standard rated
        gstAmount += amountAfterDiscount * (item.gst_rate / 100)
      }
      // Zero-rated (Z) and Exempt (E) don't add to GST
    })

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      gstAmount: Math.round(gstAmount * 100) / 100,
      total: Math.round((subtotal + gstAmount) * 100) / 100
    }
  }

  private validateUEN(uen: string): boolean {
    // Singapore UEN format validation
    const patterns = [
      /^[0-9]{8,9}[A-Z]$/,  // Business/Company format
      /^[TRS][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z]$/  // Other entity formats
    ]
    
    return patterns.some(pattern => pattern.test(uen))
  }

  private validateGSTNumber(gstNumber: string): boolean {
    // Singapore GST registration number formats
    const patterns = [
      /^GST[0-9]{8}$/,      // Standard format: GST12345678
      /^M[0-9]-[0-9]{7}-[0-9]$/  // Alternative format: M2-1234567-8
    ]
    
    return patterns.some(pattern => pattern.test(gstNumber))
  }

  private isReverseChargeApplicable(invoice: Partial<Invoice>): boolean {
    // Check if this is an imported service subject to reverse charge
    if (!invoice.vendor_address || !invoice.vendor_gst_number) {
      return false
    }

    // If vendor is not Singapore-based and it's a service
    const isForeignVendor = !invoice.vendor_address.toLowerCase().includes('singapore')
    const isService = invoice.items?.some(item => 
      item.description.toLowerCase().includes('service') ||
      item.description.toLowerCase().includes('consulting') ||
      item.description.toLowerCase().includes('software')
    )

    return isForeignVendor && !!isService
  }

  // Auto-fix functionality
  async autoFixInvoice(
    invoice: Partial<Invoice>, 
    validationResult: ValidationResult
  ): Promise<Partial<Invoice>> {
    const fixed = { ...invoice }

    validationResult.suggestions.forEach(suggestion => {
      if (suggestion.autoFixAvailable && suggestion.autoFixValue !== undefined) {
        (fixed as any)[suggestion.field] = suggestion.autoFixValue
      }
    })

    return fixed
  }
}
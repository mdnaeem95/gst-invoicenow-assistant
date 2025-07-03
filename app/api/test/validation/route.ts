// app/api/test/validation/route.ts
import { SingaporeGSTValidator } from '@/lib/validation/gst-validator'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { invoice } = await request.json()

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'No invoice data provided' },
        { status: 400 }
      )
    }

    const validator = new SingaporeGSTValidator()
    const validationResult = await validator.validateInvoice(invoice)

    // Auto-fix if available
    let fixedInvoice = null
    if (validationResult.suggestions.some((s: any) => s.autoFixAvailable)) {
      fixedInvoice = await validator.autoFixInvoice(invoice, validationResult)
    }

    // Generate report
    const report = validator.generateValidationReport(validationResult)

    return NextResponse.json({
      success: true,
      validationResult: {
        isValid: validationResult.isValid,
        score: validationResult.score,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        suggestions: validationResult.suggestions,
        metadata: validationResult.metadata
      },
      fixedInvoice,
      report
    })
  } catch (error) {
    console.error('Validation test error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      },
      { status: 500 }
    )
  }
}
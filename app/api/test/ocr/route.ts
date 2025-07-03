// app/api/test/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { OCROrchestrator } from '@/lib/services/ocr/ocr-orchestrator'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const enableTemplateMatching = formData.get('enableTemplateMatching') === 'true'
    const minConfidence = parseFloat(formData.get('minConfidence') as string) || 0.7

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const orchestrator = new OCROrchestrator()

    const result = await orchestrator.extractInvoiceData(buffer, file.name, {
      enableTemplateMatching,
      minConfidence
    })

    return NextResponse.json({
      success: true,
      provider: result.provider,
      confidence: result.confidence,
      processingTime: result.processingTime,
      warnings: result.warnings,
      data: {
        invoiceNumber: result.invoiceNumber,
        invoiceDate: result.invoiceDate,
        customerName: result.customerName,
        customerUEN: result.customerUEN,
        vendorName: result.vendorName,
        vendorUEN: result.vendorUEN,
        vendorGSTNumber: result.vendorGSTNumber,
        subtotal: result.subtotal,
        gstAmount: result.gstAmount,
        totalAmount: result.totalAmount,
        items: result.items
      }
    })
  } catch (error) {
    console.error('OCR test error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'OCR processing failed' 
      },
      { status: 500 }
    )
  }
}
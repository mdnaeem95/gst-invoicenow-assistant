import { NextResponse } from 'next/server'
import { InvoiceParser } from '@/lib/services/invoice-parser'

// Test endpoint to verify parser without authentication
export async function GET() {
  try {
    // Create a simple test Excel file buffer
    const testData = {
      invoiceNumber: 'TEST-001',
      invoiceDate: '2024-03-15',
      customerName: 'Test Customer Pte Ltd',
      customerUEN: '12345678A',
      items: [
        {
          description: 'Consulting Services',
          quantity: 10,
          unitPrice: 100,
          amount: 1000
        }
      ],
      subtotal: 1000,
      gstAmount: 90,
      totalAmount: 1090
    }

    return NextResponse.json({
      success: true,
      message: 'Invoice processing system is ready',
      testData,
      services: {
        ocr: process.env.OCR_SERVICE || 'not configured',
        aws: process.env.AWS_ACCESS_KEY_ID ? 'configured' : 'not configured',
        google: process.env.GOOGLE_CLOUD_KEYFILE ? 'configured' : 'not configured'
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
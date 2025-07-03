// app/api/test/uen-verification/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { UENVerifier } from '@/lib/validation/uen-verifier'

export async function POST(request: NextRequest) {
  try {
    const { uens } = await request.json()

    if (!uens || !Array.isArray(uens)) {
      return NextResponse.json(
        { success: false, error: 'No UENs provided' },
        { status: 400 }
      )
    }

    const verifier = new UENVerifier()
    const results = await verifier.verifyBatch(uens)

    const response = {
      success: true,
      results: Object.fromEntries(results),
      summary: {
        total: uens.length,
        valid: Array.from(results.values()).filter(r => r.isValid).length,
        exists: Array.from(results.values()).filter(r => r.exists).length,
        gstRegistered: Array.from(results.values()).filter(r => r.gstRegistered).length
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('UEN verification test error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'UEN verification failed' 
      },
      { status: 500 }
    )
  }
}
import { NextRequest, NextResponse } from "next/server"

// app/api/invoices/queue/stats/route.ts
export async function GET(request: NextRequest) {
  try {
    // This endpoint could be admin-only
    const stats = await processingQueue.getQueueStats()
    
    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Queue stats error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get queue stats' },
      { status: 500 }
    )
  }
}
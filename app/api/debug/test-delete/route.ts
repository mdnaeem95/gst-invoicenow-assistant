import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Add GET method for easier testing
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const invoiceId = searchParams.get('invoiceId')
  
  if (!invoiceId) {
    return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })
  }
  
  return handleDelete(invoiceId)
}

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json()
    return handleDelete(invoiceId)
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

async function handleDelete(invoiceId: string) {
  try {
    console.log('Test delete for invoice:', invoiceId)
    
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('User:', user?.id, 'Auth error:', authError)
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Try to fetch the invoice first
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single()

    console.log('Invoice found:', invoice, 'Fetch error:', fetchError)

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Try to delete
    const { data: deleteData, error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .select()

    console.log('Delete result:', deleteData, 'Delete error:', deleteError)

    return NextResponse.json({
      success: !deleteError,
      deleted: deleteData,
      error: deleteError
    })
  } catch (error) {
    console.error('Test delete error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
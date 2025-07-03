// app/api/test-smtp/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Try to send a test email
    const { error } = await supabase.auth.signUp({
      email: 'test-' + Date.now() + '@example.com',
      password: 'testpassword123',
    })
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Test email sent! Check Resend dashboard for delivery status.' 
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) })
  }
}
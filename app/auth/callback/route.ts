import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  
  if (error) {
    console.error('OAuth error:', error, error_description)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error_description || error)}`
    )
  }
  
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=No authorization code provided`)
  }
  
  const supabase = await createClient()
  
  try {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) throw exchangeError
    
    if (!data?.user) {
      throw new Error('No user data returned')
    }

    // For password recovery
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`)
    }
    
    // For email verification, user is now fully set up
    // Redirect directly to dashboard
    return NextResponse.redirect(`${origin}/dashboard`)
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Authentication failed. Please try again.')}`
    )
  }
}
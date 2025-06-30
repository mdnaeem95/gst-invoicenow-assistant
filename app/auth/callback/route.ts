// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  const type = searchParams.get('type')

  // Handle errors
  if (error) {
    console.error('Auth callback error:', error, error_description)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error_description || error)}`)
  }

  if (code) {
    const supabase = await createClient()
    
    // Exchange the code for a session
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!sessionError && data?.session) {
      // Only redirect to reset-password for explicit recovery type
      if (type === 'recovery') {
        // This is a password reset flow
        const forwardUrl = new URL(`${origin}/reset-password`)
        
        // Forward the access token and type in the hash fragment
        // This is how Supabase expects it for password reset
        forwardUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&expires_in=3600&token_type=bearer&type=recovery`
        
        return NextResponse.redirect(forwardUrl)
      }
      
      // For email confirmation (signup or invite), redirect to intended destination
      // This handles both signup confirmation and regular sign in
      return NextResponse.redirect(`${origin}${next}`)
    }
    
    // Session exchange failed
    console.error('Session exchange error:', sessionError)
  }

  // Return to login with error if no code or exchange failed
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
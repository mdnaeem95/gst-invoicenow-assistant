// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const type = searchParams.get('type') // 'signup', 'recovery', etc.
  
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }
  
  const supabase = await createClient()
  
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) throw error
    
    if (!data?.user) {
      throw new Error('No user data returned')
    }
    
    // For password recovery, redirect to reset page
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`)
    }
    
    // Check if profile exists and is complete
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_uen, onboarding_completed, email_verified')
      .eq('id', data.user.id)
      .single()
    
    if (!profile) {
      // This shouldn't happen if trigger is working
      console.error('Profile missing for user:', data.user.id)
      return NextResponse.redirect(`${origin}/error?message=profile_missing`)
    }
    
    // Update email verification status
    if (data.user.email_confirmed_at && !profile.email_verified) {
      await supabase
        .from('profiles')
        .update({ email_verified: true })
        .eq('id', data.user.id)
    }
    
    // Determine redirect based on profile state
    if (!profile.onboarding_completed) {
      return NextResponse.redirect(`${origin}/setup`)
    }
    
    return NextResponse.redirect(`${origin}${next}`)
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }
}
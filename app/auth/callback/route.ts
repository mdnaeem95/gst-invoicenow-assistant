// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const type = searchParams.get('type')
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  
  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, error_description)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error_description || error)}`
    )
  }
  
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }
  
  const supabase = await createClient()
  
  try {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.error('Auth exchange error:', exchangeError)
      throw exchangeError
    }
    
    if (!data?.user) {
      throw new Error('No user data returned')
    }
    
    // Log the successful authentication
    await supabase.rpc('log_user_action', {
      p_action: 'auth.callback_success',
      p_metadata: {
        provider: data.user.app_metadata?.provider || 'email',
        type: type || 'login'
      }
    })
    
    // For password recovery, redirect to reset page
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`)
    }
    
    // Check if profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()
    
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Profile fetch error:', profileError)
    }
    
    // For Google OAuth users without profile, redirect to complete setup
    if (!profile && data.user.app_metadata?.provider === 'google') {
      // Create basic profile for Google users
      const { error: createError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          company_name: '',
          company_uen: 'TEMP' + data.user.id.replace(/-/g, '').substring(0, 9),
          contact_name: data.user.user_metadata?.full_name || 
                       data.user.user_metadata?.name || 
                       data.user.email?.split('@')[0] || '',
          contact_email: data.user.email || '',
          email_verified: true, // Google emails are pre-verified
          onboarding_completed: false,
          onboarding_step: 'company_details',
          privacy_policy_accepted: false // Will need to accept during setup
        })
      
      if (createError) {
        console.error('Profile creation error:', createError)
      }
      
      // Redirect to setup with privacy policy acceptance required
      return NextResponse.redirect(`${origin}/setup?show_privacy=true`)
    }
    
    // Determine where to redirect based on profile state
    if (profile) {
      // Update email verification status if needed
      if (data.user.email_confirmed_at && !profile.email_verified) {
        await supabase
          .from('profiles')
          .update({ 
            email_verified: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.user.id)
      }
      
      // Check if email is verified
      if (!profile.email_verified && data.user.app_metadata?.provider !== 'google') {
        return NextResponse.redirect(`${origin}/verify-email`)
      }
      
      // Check if onboarding is complete
      if (!profile.onboarding_completed || profile.company_uen?.startsWith('TEMP')) {
        return NextResponse.redirect(`${origin}/setup`)
      }
      
      // Check privacy policy acceptance for existing users
      if (!profile.privacy_policy_accepted) {
        return NextResponse.redirect(`${origin}/setup?show_privacy=true`)
      }
    }
    
    // Update last login
    try {
      const { error: updateError } = await supabase.rpc('update_last_login')
      if (updateError) {
        console.error('Failed to update last login:', updateError)
      }
    } catch (err) {
      console.error('Unexpected failure during last login update:', err)
    }
    
    // All good, redirect to intended destination
    return NextResponse.redirect(`${origin}${next}`)
  } catch (error) {
    console.error('Callback error:', error)
    
    // Log the error
    try {
      await supabase.rpc('log_user_action', {
        p_action: 'auth.callback_error',
        p_metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          code: code ? 'Code provided' : 'No code'
        }
      })
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }
    
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }
}
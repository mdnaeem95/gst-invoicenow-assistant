// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const type = searchParams.get('type')
  
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }
  
  const supabase = await createClient()
  
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Auth exchange error:', error)
      throw error
    }
    
    if (!data?.user) {
      throw new Error('No user data returned')
    }
    
    // For password recovery, redirect to reset page
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`)
    }
    
    // Try to get or create profile
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()
    
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Profile fetch error:', profileError)
    }
    
    // If no profile exists, create one
    if (!profile) {
      console.log('Creating profile for user:', data.user.id)
      
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          company_name: data.user.user_metadata?.company_name || '',
          company_uen: 'TEMP' + data.user.id.replace(/-/g, '').substring(0, 9),
          contact_name: data.user.user_metadata?.contact_name || 
                       data.user.user_metadata?.full_name || 
                       data.user.email?.split('@')[0] || '',
          contact_email: data.user.email || '',
          gst_number: data.user.user_metadata?.gst_number,
          email_verified: !!data.user.email_confirmed_at,
          onboarding_completed: false,
          onboarding_step: 'company_details'
        })
        .select()
        .single()
      
      if (createError) {
        console.error('Profile creation error:', createError)
        // Don't fail completely, redirect to setup
        return NextResponse.redirect(`${origin}/setup`)
      }
      
      profile = newProfile
    }
    
    // Update email verification if needed
    if (data.user.email_confirmed_at && profile && !profile.email_verified) {
      await supabase
        .from('profiles')
        .update({ 
          email_verified: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.user.id)
      
      profile.email_verified = true
    }
    
    // Determine where to redirect
    if (profile) {
      if (!profile.email_verified) {
        return NextResponse.redirect(`${origin}/verify-email`)
      }
      
      if (!profile.onboarding_completed || profile.company_uen?.startsWith('TEMP')) {
        return NextResponse.redirect(`${origin}/setup`)
      }
    }
    
    return NextResponse.redirect(`${origin}${next}`)
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }
}
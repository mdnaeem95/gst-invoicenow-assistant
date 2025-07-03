import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      email, 
      password, 
      fullName,
      contactPhone,
      companyName,
      companyUEN,
      companyAddress,
      gstNumber,
      metadata 
    } = body

    // Create Supabase client
    const supabase = await createClient()

    // Create user with ALL data
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        data: {
          full_name: fullName,
          contact_name: fullName,
          contact_phone: contactPhone,
          company_name: companyName,
          company_uen: companyUEN,
          company_address: companyAddress,
          gst_number: gstNumber,
          privacy_policy_accepted: metadata.privacy_policy_accepted,
          terms_accepted: metadata.terms_accepted,
          marketing_consent: metadata.marketing_consent || false,
        }
      }
    })

    if (authError) {
      console.error('Auth error:', authError)
      
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'This email is already registered. Please sign in instead.' },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    // Supabase will send the verification email automatically
    // No need for custom email here

    return NextResponse.json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.'
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
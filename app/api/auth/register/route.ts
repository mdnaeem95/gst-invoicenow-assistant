// app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, emailTemplates } from '@/lib/services/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, fullName, companyName, metadata } = body

    // Create Supabase client
    const supabase = await createClient()

    // Create user with Supabase Auth (with email autoconfirm to bypass Supabase emails)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Don't auto-confirm, we'll handle it
      user_metadata: {
        full_name: fullName,
        company_name: companyName,
        ...metadata
      }
    })

    if (authError) {
      console.error('Auth error:', authError)
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 400 }
      )
    }

    // Generate email confirmation link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
      }
    })

    if (linkError || !linkData) {
      console.error('Link generation error:', linkError)
      return NextResponse.json(
        { error: 'Failed to generate confirmation link' },
        { status: 500 }
      )
    }

    // Send welcome email with Resend
    const emailResult = await sendEmail({
      to: email,
      ...emailTemplates.welcome(fullName || email.split('@')[0], linkData.properties.action_link)
    })

    if (!emailResult.success) {
      console.error('Email send failed:', emailResult.error)
      // Don't fail the registration, just log the error
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email
      },
      message: 'Registration successful. Please check your email to verify your account.'
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
// lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Define route types
  const isAuthRoute = pathname.startsWith('/login') ||
                     pathname.startsWith('/register') ||
                     pathname.startsWith('/forgot-password') ||
                     pathname.startsWith('/reset-password') ||
                     pathname.startsWith('/auth')

  const isProtectedRoute = pathname.startsWith('/dashboard') ||
                          pathname.startsWith('/invoices') ||
                          pathname.startsWith('/settings') ||
                          pathname.startsWith('/analytics')

  const isSetupRoute = pathname.startsWith('/setup')
  const isErrorPage = pathname.startsWith('/error')
  const isVerifyEmailPage = pathname.startsWith('/verify-email')

  // Always allow access to error page to prevent loops
  if (isErrorPage) {
    return supabaseResponse
  }

  // Handle unauthenticated users
  if (!user) {
    // Allow access to auth routes
    if (isAuthRoute) {
      return supabaseResponse
    }
    
    // Redirect to login if accessing protected routes
    if (isProtectedRoute || isSetupRoute || isVerifyEmailPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    
    return supabaseResponse
  }

  // Handle authenticated users
  if (user) {
    // Skip profile check for auth callback to prevent loops
    if (pathname.startsWith('/auth/callback')) {
      return supabaseResponse
    }

    // Check if profile exists (but not if already on setup or verify-email page)
    if (!isSetupRoute && !isAuthRoute && !isVerifyEmailPage) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_uen, email_verified, onboarding_completed')
        .eq('id', user.id)
        .single()
      
      if (profileError || !profile) {
        console.log('Profile check failed:', profileError)
        // Don't redirect to error, redirect to setup
        const url = request.nextUrl.clone()
        url.pathname = '/setup'
        return NextResponse.redirect(url)
      }
      
      // Check email verification
      if (!profile.email_verified && !isVerifyEmailPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/verify-email'
        return NextResponse.redirect(url)
      }
      
      // Check if needs setup
      if (!profile.onboarding_completed && 
          (profile.company_uen?.startsWith('TEMP') || profile.company_uen?.startsWith('PENDING'))) {
        const url = request.nextUrl.clone()
        url.pathname = '/setup'
        return NextResponse.redirect(url)
      }
    }

    // Redirect away from auth routes if already logged in
    if (isAuthRoute && 
        !pathname.startsWith('/auth/callback') &&
        !pathname.startsWith('/reset-password')) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
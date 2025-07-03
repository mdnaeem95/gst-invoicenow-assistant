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
                          pathname.startsWith('/analytics') ||
                          pathname.startsWith('/billing')

  const isPublicRoute = pathname === '/' ||
                       pathname.startsWith('/terms') ||
                       pathname.startsWith('/privacy') ||
                       pathname.startsWith('/contact') ||
                       pathname.startsWith('/api/public')

  const isSetupRoute = pathname.startsWith('/setup')
  const isVerifyEmailPage = pathname.startsWith('/verify-email')

  // Allow public routes
  if (isPublicRoute) {
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
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
    
    return supabaseResponse
  }

  // Handle authenticated users
  if (user) {
    // Skip checks for auth callback
    if (pathname.startsWith('/auth/callback')) {
      return supabaseResponse
    }

    // Get profile for authenticated user
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    // If no profile exists, redirect to setup
    if (!profile && !isSetupRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/setup'
      return NextResponse.redirect(url)
    }
    
    if (profile) {
      // Check privacy policy acceptance (PDPA requirement)
      if (!profile.privacy_policy_accepted && !isSetupRoute && !isAuthRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/setup'
        url.searchParams.set('show_privacy', 'true')
        return NextResponse.redirect(url)
      }
      
      // Check email verification
      if (!profile.email_verified && 
          !isVerifyEmailPage && 
          !isSetupRoute && 
          !isAuthRoute &&
          user.app_metadata?.provider !== 'google') {
        const url = request.nextUrl.clone()
        url.pathname = '/verify-email'
        return NextResponse.redirect(url)
      }
      
      // Check if onboarding is complete
      if (!profile.onboarding_completed && 
          !isSetupRoute && 
          !isAuthRoute && 
          !isVerifyEmailPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/setup'
        return NextResponse.redirect(url)
      }
      
      // Check if UEN is still temporary
      if (profile.company_uen?.startsWith('TEMP') && 
          !isSetupRoute && 
          !isAuthRoute && 
          !isVerifyEmailPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/setup'
        return NextResponse.redirect(url)
      }
      
      // Redirect away from auth routes if already logged in and verified
      if (isAuthRoute && 
          profile.email_verified && 
          profile.onboarding_completed &&
          !pathname.startsWith('/auth/callback') &&
          !pathname.startsWith('/reset-password')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
      
      // Redirect away from setup if already completed
      if (isSetupRoute && 
          profile.onboarding_completed && 
          !profile.company_uen?.startsWith('TEMP') &&
          !request.nextUrl.searchParams.get('show_privacy')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
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

  // Route classifications
  const publicRoutes = ['/', '/pricing', '/about']
  const authRoutes = ['/login', '/register', '/forgot-password']
  const protectedRoutes = ['/dashboard', '/invoices', '/analytics', '/settings']
  const setupRoutes = ['/setup', '/verify-email']
  
  // Public routes - always accessible
  if (publicRoutes.includes(pathname)) {
    return supabaseResponse
  }
  
  // Not authenticated
  if (!user) {
    // Allow access to auth routes
    if (authRoutes.some(route => pathname.startsWith(route))) {
      return supabaseResponse
    }
    
    // Redirect to login for protected/setup routes
    if (protectedRoutes.some(route => pathname.startsWith(route)) || 
        setupRoutes.some(route => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    
    return supabaseResponse
  }
  
  // Authenticated - get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('email_verified, onboarding_completed, company_uen')
    .eq('id', user.id)
    .single()
  
  if (!profile) {
    // Profile missing - critical error
    return NextResponse.redirect(new URL('/error?code=profile_missing', request.url))
  }
  
  // Email not verified
  if (!profile.email_verified && !pathname.startsWith('/verify-email')) {
    return NextResponse.redirect(new URL('/verify-email', request.url))
  }
  
  // Onboarding not completed
  if (!profile.onboarding_completed) {
    // Allow access to setup routes
    if (setupRoutes.some(route => pathname.startsWith(route))) {
      return supabaseResponse
    }
    
    // Redirect to setup for any other route
    return NextResponse.redirect(new URL('/setup', request.url))
  }
  
  // Fully authenticated and onboarded
  // Redirect away from auth/setup routes
  if (authRoutes.some(route => pathname.startsWith(route)) || 
      pathname.startsWith('/setup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  
  return supabaseResponse
}
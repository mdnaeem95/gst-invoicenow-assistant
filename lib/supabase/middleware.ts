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

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Public routes
  const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/auth', '/api/auth', '/terms', '/privacy']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  
  // Protected routes
  const protectedRoutes = ['/dashboard', '/invoices', '/settings', '/analytics', '/billing']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  // No user - redirect to login for protected routes
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // User exists and trying to access auth pages
  if (user && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
    // Check if user is fully verified
    const { data: profile } = await supabase
      .from('profiles')
      .select('email_verified, onboarding_completed')
      .eq('id', user.id)
      .single()
    
    if (profile?.email_verified && profile?.onboarding_completed) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}
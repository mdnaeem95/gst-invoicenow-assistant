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

  // Handle unauthenticated users
  if (!user) {
    // Redirect to login if accessing protected routes
    if (isProtectedRoute || isSetupRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Handle authenticated users
  if (user) {
    // Check if profile needs completion (but not if already on setup page)
    if (!isSetupRoute && !isAuthRoute) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_uen')
        .eq('id', user.id)
        .single()
      
      console.log('Profile check:', profile) // Debug log
      
      // Redirect to setup if using temporary UEN
      if (profile?.company_uen?.startsWith('TEMP') || profile?.company_uen?.startsWith('PENDING')) {
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
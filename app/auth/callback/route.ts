// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!sessionError && data?.user) {
      // Check if profile exists
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single()
      
      // Create profile if it doesn't exist
      if (!profile) {
        await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            company_name: data.user.user_metadata?.company_name || 
                         data.user.email?.split('@')[1] || 
                         'My Company',
            company_uen: 'TEMP' + data.user.id.replace(/-/g, '').substring(0, 9),
            contact_name: data.user.user_metadata?.full_name || 
                         data.user.user_metadata?.name || 
                         data.user.email?.split('@')[0],
            contact_email: data.user.email,
          })
      }
      
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login`)
}
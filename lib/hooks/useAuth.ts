import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuthError } from '@supabase/supabase-js'

interface SignUpData {
  email: string
  password: string
  companyName: string
  uen: string
  gstNumber?: string
  contactName: string
}

interface UseAuthReturn {
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (data: SignUpData) => Promise<boolean>
  signInWithGoogle: () => Promise<void>
  clearError: () => void
}

export function useAuth(): UseAuthReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const clearError = () => setError(null)

  const handleAuthError = (error: AuthError) => {
    if (error.message.includes('Invalid login credentials')) {
      return 'Invalid email or password'
    }
    if (error.message.includes('Email not confirmed')) {
      return 'Please verify your email before signing in'
    }
    if (error.message.includes('already registered')) {
      return 'This email is already registered'
    }
    return error.message
  }

  const signIn = async (email: string, password: string): Promise<boolean> => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(handleAuthError(error))
        return false
      }

      return true
    } catch (err) {
      setError('An unexpected error occurred')
      return false
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (data: SignUpData): Promise<boolean> => {
      setLoading(true)
      setError(null)

      try {
        // 1. Create auth account
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        })

        if (authError) {
          setError(handleAuthError(authError))
          return false
        }

        if (!authData.user) {
          setError('Failed to create account')
          return false
        }

        // 2. Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            company_name: data.companyName,
            company_uen: data.uen,
            gst_number: data.gstNumber || null,
            contact_name: data.contactName,
            contact_email: data.email,
            email_verified: false
          })

        if (profileError) {
          console.error('Profile creation failed:', profileError)
          setError('Account created but profile setup failed. Please contact support.')
          return false
        }

        return true
      } catch (err) {
        setError('An unexpected error occurred')
        return false
      } finally {
        setLoading(false)
      }
  }

  const signInWithGoogle = async () => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      })

      if (error) {
        setError(error.message)
      }
    } catch (err) {
      setError('Failed to sign in with Google')
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    signIn,
    signUp,
    signInWithGoogle,
    clearError
  }
}
// lib/hooks/useAuth.ts
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuthError, User } from '@supabase/supabase-js'

interface SignUpData {
  email: string
  password: string
  companyName: string
  contactName: string
  acceptPrivacyPolicy: boolean
  marketingConsent?: boolean
}

interface UseAuthReturn {
  loading: boolean
  error: string | null
  user: User | null
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (data: SignUpData) => Promise<boolean>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

export function useAuth(): UseAuthReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
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
    if (error.message.includes('rate limit')) {
      return 'Too many attempts. Please try again later'
    }
    return error.message || 'An authentication error occurred'
  }

  const logAuthAction = async (action: string, metadata?: any) => {
    try {
      await supabase.rpc('log_user_action', {
        p_action: action,
        p_resource_type: 'auth',
        p_metadata: metadata || {}
      })
    } catch (err) {
      console.error('Failed to log action:', err)
    }
  }

  // In the signIn function, add better error handling:
  const signIn = async (email: string, password: string): Promise<boolean> => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        // Specific error messages
        if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please try again.')
        } else if (error.message.includes('Email not confirmed')) {
          setError('Please verify your email before signing in.')
        } else if (error.message.includes('too many requests')) {
          setError('Too many login attempts. Please try again later.')
        } else {
          setError(error.message)
        }
        return false
      }

      if (data.user) {
        setUser(data.user)
        return true
      }

      return false
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (data: SignUpData): Promise<boolean> => {
    setLoading(true)
    setError(null)

    try {
      // Validate PDPA requirements
      if (!data.acceptPrivacyPolicy) {
        setError('You must accept the privacy policy to create an account')
        return false
      }

      console.log('Signing up with data:', {
        email: data.email,
        metadata: {
          company_name: data.companyName,
          contact_name: data.contactName,
          privacy_policy_accepted: data.acceptPrivacyPolicy,
          marketing_consent: data.marketingConsent
        }
      })

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            company_name: data.companyName,
            contact_name: data.contactName,
            privacy_policy_accepted: data.acceptPrivacyPolicy,
            marketing_consent: data.marketingConsent || false,
            signup_timestamp: new Date().toISOString()
          }
        }
      })

      if (authError) {
        console.error('Signup error:', authError)
        setError(handleAuthError(authError))
        await logAuthAction('auth.signup_failed', { 
          email: data.email, 
          reason: authError.message 
        })
        return false
      }

      console.log('Signup response:', authData)

      if (!authData.user) {
        setError('Failed to create account - no user returned')
        return false
      }

      // Log successful signup (but don't try to use RPC yet as user might not be fully created)
      console.log('User created successfully:', authData.user.id)

      return true
    } catch (err) {
      console.error('Unexpected signup error:', err)
      setError('An unexpected error occurred during signup')
      return false
    } finally {
      setLoading(false)
    }
  }

  const signInWithGoogle = async () => {
    setLoading(true)
    setError(null)

    try {
      // Generate and store PKCE verifier
      const redirectTo = `${window.location.origin}/auth/callback`
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          scopes: 'email profile'
        }
      })

      if (error) {
        setError(error.message)
        await logAuthAction('auth.google_login_failed', { reason: error.message })
      } else {
        await logAuthAction('auth.google_login_initiated')
      }
    } catch (err) {
      setError('Failed to sign in with Google')
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    setLoading(true)
    setError(null)

    try {
      // Log the signout action first
      await logAuthAction('auth.logout')
      
      const { error } = await supabase.auth.signOut()

      if (error) {
        setError(error.message)
      } else {
        setUser(null)
        // Clear any cached data
        window.location.href = '/login'
      }
    } catch (err) {
      setError('Failed to sign out')
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    user,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    clearError
  }
}
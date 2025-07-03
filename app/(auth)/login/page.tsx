// app/(auth)/login/page.tsx
'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, Loader2, Shield } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useFormValidation } from '@/lib/hooks/useFormValidation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { createClient } from '@/lib/supabase/client'

interface LoginForm {
  email: string
  password: string
  rememberMe: boolean
  [key: string]: string | boolean;
}

const validationRules = {
  email: (value: any) => {
    if (!value || typeof value !== 'string') return 'Email is required'
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) return 'Please enter a valid email'
    return null
  },
  password: (value: any) => {
    if (!value || typeof value !== 'string') return 'Password is required'
    return null
  }
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const supabase = createClient();
  const { loading, error, signIn, signInWithGoogle } = useAuth()
  
  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateForm
  } = useFormValidation<LoginForm>(
    { email: '', password: '', rememberMe: false },
    validationRules
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    console.log('Login form submitted with values:', values)
    
    if (!validateForm()) {
      console.log('Form validation failed')
      return
    }

    const success = await signIn(values.email as string, values.password as string)
    if (success) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email_verified, onboarding_completed')
          .eq('id', user.id)
          .single()

        if (!profile?.email_verified) {
          router.push('/verify-email')
        } else if (!profile?.onboarding_completed) {
          router.push('/setup')
        } else {
          router.push('/dashboard')
        }
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div>
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-3 rounded-full">
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            Welcome back
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access your GST InvoiceNow dashboard
          </p>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 px-6 py-8 space-y-6">
            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              {/* Email Field */}
              <div>
                <Label htmlFor="email">Email address</Label>
                <div className="mt-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={values.email as string}
                    onChange={(e) => handleChange('email', e.target.value)}
                    onBlur={() => handleBlur('email')}
                    className={`pl-10 ${
                      errors.email && touched.email 
                        ? 'border-red-300' 
                        : ''
                    }`}
                    placeholder="you@example.com"
                  />
                </div>
                {errors.email && touched.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="mt-1 relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={values.password as string}
                    onChange={(e) => handleChange('password', e.target.value)}
                    onBlur={() => handleBlur('password')}
                    className={`pl-10 pr-10 ${
                      errors.password && touched.password 
                        ? 'border-red-300' 
                        : ''
                    }`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.password && touched.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                )}
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Checkbox
                  id="remember-me"
                  checked={values.rememberMe as boolean}
                  onCheckedChange={(checked) => 
                    handleChange('rememberMe', checked as boolean)
                  }
                />
                <Label 
                  htmlFor="remember-me" 
                  className="ml-2 text-sm text-gray-700 cursor-pointer"
                >
                  Remember me
                </Label>
              </div>

              <Link 
                href="/forgot-password" 
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            {/* Google Sign In */}
            <Button
              type="button"
              variant="outline"
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>

            {/* PDPA Notice */}
            <div className="text-center text-xs text-gray-500">
              <Shield className="inline-block w-3 h-3 mr-1" />
              Your data is protected under Singapore's PDPA
            </div>
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
              Start your free trial
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
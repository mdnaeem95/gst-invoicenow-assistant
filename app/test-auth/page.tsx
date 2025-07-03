// app/(auth)/register-v2/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Building2, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2,
  User,
  CheckCircle,
  Info
} from 'lucide-react'

export default function EnhancedRegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  
  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    companyName: '',
    privacyAccepted: false,
    termsAccepted: false,
    marketingConsent: false
  })
  
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null) // Clear error when user types
  }

  const validateForm = () => {
    if (!formData.email || !formData.password || !formData.fullName || !formData.companyName) {
      setError('Please fill in all required fields')
      return false
    }
    
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return false
    }
    
    if (!formData.privacyAccepted || !formData.termsAccepted) {
      setError('You must accept the Privacy Policy and Terms of Service')
      return false
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address')
      return false
    }
    
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return
    
    setLoading(true)
    setError(null)
    
    try {
      console.log('Submitting registration with data:', formData)
      
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: formData.fullName,
            contact_name: formData.fullName, // For compatibility
            company_name: formData.companyName,
            privacy_policy_accepted: formData.privacyAccepted,
            terms_accepted: formData.termsAccepted,
            marketing_consent: formData.marketingConsent
          }
        }
      })
      
      if (signUpError) throw signUpError
      
      console.log('Registration successful:', data)
      
      // Log the signup action
      if (data.user) {
        try {
          await supabase.rpc('log_user_action', {
            p_action: 'user.registered',
            p_metadata: {
              email: formData.email,
              company_name: formData.companyName
            }
          })
        } catch (logError) {
          console.error('Failed to log action:', logError)
        }
      }
      
      setShowSuccess(true)
    } catch (err: any) {
      console.error('Registration error:', err)
      setError(err.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Check your email
            </h2>
            <p className="text-gray-600 mb-6">
              We've sent a verification link to <strong className="text-gray-900">{formData.email}</strong>
            </p>
            <div className="bg-blue-50 rounded-md p-4 mb-6">
              <p className="text-sm text-blue-800">
                Click the link in the email to verify your account and complete setup.
              </p>
            </div>
            <Link 
              href="/login" 
              className="text-blue-600 hover:text-blue-500 text-sm font-medium"
            >
              Return to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Start your 30-day free trial
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 px-6 py-8 space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Company Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Company Information</h3>
              
              <div>
                <Label htmlFor="companyName">Company Name *</Label>
                <div className="mt-1 relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="companyName"
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    className="pl-10"
                    placeholder="ABC Pte Ltd"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="fullName">Your Name *</Label>
                <div className="mt-1 relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    className="pl-10"
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Account Information */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Account Information</h3>
              
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <div className="mt-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="pl-10"
                    placeholder="john@company.com"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password">Password *</Label>
                <div className="mt-1 relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="pl-10 pr-10"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Minimum 6 characters</p>
              </div>
            </div>

            {/* Legal Agreements */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div className="flex items-start">
                <Checkbox
                  id="privacy"
                  checked={formData.privacyAccepted}
                  onCheckedChange={(checked) => handleInputChange('privacyAccepted', !!checked)}
                  className="mt-1"
                />
                <Label htmlFor="privacy" className="ml-3 text-sm text-gray-700 cursor-pointer">
                  I accept the{' '}
                  <Link href="/privacy" className="text-blue-600 hover:text-blue-500 underline">
                    Privacy Policy
                  </Link>
                  <span className="text-red-500 ml-1">*</span>
                </Label>
              </div>

              <div className="flex items-start">
                <Checkbox
                  id="terms"
                  checked={formData.termsAccepted}
                  onCheckedChange={(checked) => handleInputChange('termsAccepted', !!checked)}
                  className="mt-1"
                />
                <Label htmlFor="terms" className="ml-3 text-sm text-gray-700 cursor-pointer">
                  I accept the{' '}
                  <Link href="/terms" className="text-blue-600 hover:text-blue-500 underline">
                    Terms of Service
                  </Link>
                  <span className="text-red-500 ml-1">*</span>
                </Label>
              </div>

              <div className="flex items-start">
                <Checkbox
                  id="marketing"
                  checked={formData.marketingConsent}
                  onCheckedChange={(checked) => handleInputChange('marketingConsent', !!checked)}
                  className="mt-1"
                />
                <Label htmlFor="marketing" className="ml-3 text-sm text-gray-700 cursor-pointer">
                  I agree to receive product updates and marketing communications
                  <span className="text-gray-500 ml-1">(optional)</span>
                </Label>
              </div>

              <div className="bg-blue-50 rounded-md p-3 flex items-start">
                <Info className="h-5 w-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0" />
                <p className="text-xs text-blue-800">
                  Your data is protected under Singapore's Personal Data Protection Act (PDPA).
                </p>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </div>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
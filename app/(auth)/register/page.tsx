'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Building2, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2,
  User,
  CheckCircle,
  Info,
  Hash,
  FileText,
  Phone,
  MapPin,
  ArrowRight
} from 'lucide-react'
import { formatUEN, formatGST } from '@/lib/utils'

export default function UnifiedRegisterPage() {
  const router = useRouter()
  
  const [activeTab, setActiveTab] = useState('personal')
  const [formData, setFormData] = useState({
    // Personal Details
    email: '',
    password: '',
    fullName: '',
    contactPhone: '',
    
    // Company Details  
    companyName: '',
    companyUEN: '',
    companyAddress: '',
    gstNumber: '',
    
    // Legal
    privacyAccepted: false,
    termsAccepted: false,
    marketingConsent: false
  })
  
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [personalValid, setPersonalValid] = useState(false)

  const handleInputChange = (field: string, value: any) => {
    let processedValue = value

    // Format specific fields
    if (field === 'companyUEN') {
      processedValue = formatUEN(value)
    } else if (field === 'gstNumber') {
      processedValue = formatGST(value)
    }

    setFormData(prev => ({ ...prev, [field]: processedValue }))
    setError(null)
  }

  const validatePersonalDetails = () => {
    if (!formData.email || !formData.password || !formData.fullName) {
      setError('Please fill in all required fields')
      return false
    }
    
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return false
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address')
      return false
    }
    
    setPersonalValid(true)
    return true
  }

  const validateCompanyDetails = () => {
    if (!formData.companyName || !formData.companyUEN) {
      setError('Please fill in all required company fields')
      return false
    }
    
    // UEN validation
    const uenRegex = /^[0-9]{8,9}[A-Z]$/
    if (!uenRegex.test(formData.companyUEN)) {
      setError('Invalid UEN format (e.g., 201234567A)')
      return false
    }
    
    // GST validation (optional)
    if (formData.gstNumber) {
      const gstRegex = /^(GST[0-9]{8}|M[0-9]-[0-9]{7}-[0-9])$/
      if (!gstRegex.test(formData.gstNumber)) {
        setError('Invalid GST format (e.g., GST12345678)')
        return false
      }
    }
    
    if (!formData.privacyAccepted || !formData.termsAccepted) {
      setError('You must accept the Privacy Policy and Terms of Service')
      return false
    }
    
    return true
  }

  const handleContinue = () => {
    if (validatePersonalDetails()) {
      setActiveTab('company')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateCompanyDetails()) return
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          contactName: formData.fullName,
          contactPhone: formData.contactPhone,
          companyName: formData.companyName,
          companyUEN: formData.companyUEN,
          companyAddress: formData.companyAddress,
          gstNumber: formData.gstNumber,
          metadata: {
            privacy_policy_accepted: formData.privacyAccepted,
            terms_accepted: formData.termsAccepted,
            marketing_consent: formData.marketingConsent
          }
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed')
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
                Click the link in the email to verify your account and start using GST InvoiceNow.
              </p>
            </div>
            <p className="text-sm text-gray-500">
              Can't find the email? Check your spam folder or{' '}
              <button
                onClick={() => setShowSuccess(false)}
                className="text-blue-600 hover:underline"
              >
                try again
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-gray-600">
            Get started with your 30-day free trial
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="personal">Personal Details</TabsTrigger>
                <TabsTrigger value="company" disabled={!personalValid}>
                  Company Details
                </TabsTrigger>
              </TabsList>

              {error && (
                <div className="px-6 pt-4">
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </div>
              )}

              <TabsContent value="personal" className="px-6 pb-6 space-y-6">
                <div className="space-y-4">
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

                  <div>
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <div className="mt-1 relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="contactPhone"
                        type="tel"
                        value={formData.contactPhone}
                        onChange={(e) => handleInputChange('contactPhone', e.target.value)}
                        className="pl-10"
                        placeholder="+65 1234 5678"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleContinue}
                  className="w-full"
                >
                  Continue to Company Details
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </TabsContent>

              <TabsContent value="company" className="px-6 pb-6 space-y-6">
                <div className="space-y-4">
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
                    <Label htmlFor="companyUEN">Company UEN *</Label>
                    <div className="mt-1 relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="companyUEN"
                        type="text"
                        value={formData.companyUEN}
                        onChange={(e) => handleInputChange('companyUEN', e.target.value)}
                        maxLength={10}
                        className="pl-10"
                        placeholder="201234567A"
                        required
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Format: 8-9 digits followed by a letter
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="companyAddress">Company Address</Label>
                    <div className="mt-1 relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="companyAddress"
                        type="text"
                        value={formData.companyAddress}
                        onChange={(e) => handleInputChange('companyAddress', e.target.value)}
                        className="pl-10"
                        placeholder="123 Orchard Road, Singapore 238858"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="gstNumber">GST Registration Number</Label>
                    <div className="mt-1 relative">
                      <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="gstNumber"
                        type="text"
                        value={formData.gstNumber}
                        onChange={(e) => handleInputChange('gstNumber', e.target.value)}
                        className="pl-10"
                        placeholder="GST12345678 (optional)"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Leave blank if not GST registered
                    </p>
                  </div>
                </div>

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
              </TabsContent>
            </Tabs>
          </div>

          <p className="text-center text-sm text-gray-600 mt-6">
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
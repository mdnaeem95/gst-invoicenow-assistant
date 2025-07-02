// app/(auth)/register/page.tsx
'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { 
  Building2, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2,
  User,
  Hash,
  FileText,
  CheckCircle
} from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useFormValidation } from '@/lib/hooks/useFormValidation'
import { registrationValidationRules } from '@/lib/validation/auth'
import { formatUEN, formatGST } from '@/lib/utils'

interface RegistrationForm {
  companyName: string
  uen: string
  gstNumber: string
  contactName: string
  email: string
  password: string
  [key: string]: string;
}

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const { loading, error, signUp } = useAuth()
  
  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateForm
  } = useFormValidation<RegistrationForm>(
    {
      companyName: '',
      uen: '',
      gstNumber: '',
      contactName: '',
      email: '',
      password: ''
    },
    registrationValidationRules
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    const success = await signUp({
      email: values.email,
      password: values.password,
      companyName: values.companyName,
      uen: values.uen,
      gstNumber: values.gstNumber || undefined,
      contactName: values.contactName
    })

    if (success) {
      setShowSuccess(true)
    }
  }

  // Format handlers
  const handleUENChange = (value: string) => {
    handleChange('uen', formatUEN(value))
  }

  const handleGSTChange = (value: string) => {
    handleChange('gstNumber', formatGST(value))
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
              We've sent a verification link to <strong className="text-gray-900">{values.email}</strong>
            </p>
            <div className="bg-blue-50 rounded-md p-4 mb-6">
              <p className="text-sm text-blue-800">
                Click the link in the email to verify your account and start using GST InvoiceNow.
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Start your 30-day free trial
          </p>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 px-6 py-8 space-y-6">
            {/* Error Alert */}
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Company Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Company Information</h3>
              
              {/* Company Name */}
              <div>
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                  Company Name
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="companyName"
                    name="companyName"
                    type="text"
                    value={values.companyName}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    onBlur={() => handleBlur('companyName')}
                    className={`appearance-none block w-full pl-10 pr-3 py-2 border ${
                      errors.companyName && touched.companyName 
                        ? 'border-red-300' 
                        : 'border-gray-300'
                    } rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="ABC Pte Ltd"
                  />
                </div>
                {errors.companyName && touched.companyName && (
                  <p className="mt-1 text-sm text-red-600">{errors.companyName}</p>
                )}
              </div>

              {/* UEN */}
              <div>
                <label htmlFor="uen" className="block text-sm font-medium text-gray-700">
                  UEN (Unique Entity Number)
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Hash className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="uen"
                    name="uen"
                    type="text"
                    value={values.uen}
                    onChange={(e) => handleUENChange(e.target.value)}
                    onBlur={() => handleBlur('uen')}
                    maxLength={10}
                    className={`appearance-none block w-full pl-10 pr-3 py-2 border ${
                      errors.uen && touched.uen 
                        ? 'border-red-300' 
                        : 'border-gray-300'
                    } rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="123456789A"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Format: 8-9 digits followed by a letter</p>
                {errors.uen && touched.uen && (
                  <p className="mt-1 text-sm text-red-600">{errors.uen}</p>
                )}
              </div>

              {/* GST Number */}
              <div>
                <label htmlFor="gstNumber" className="block text-sm font-medium text-gray-700">
                  GST Registration Number <span className="text-gray-500">(Optional)</span>
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="gstNumber"
                    name="gstNumber"
                    type="text"
                    value={values.gstNumber}
                    onChange={(e) => handleGSTChange(e.target.value)}
                    onBlur={() => handleBlur('gstNumber')}
                    className={`appearance-none block w-full pl-10 pr-3 py-2 border ${
                      errors.gstNumber && touched.gstNumber 
                        ? 'border-red-300' 
                        : 'border-gray-300'
                    } rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="GST12345678"
                  />
                </div>
                {errors.gstNumber && touched.gstNumber && (
                  <p className="mt-1 text-sm text-red-600">{errors.gstNumber}</p>
                )}
              </div>
            </div>

            {/* Account Information Section */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Account Information</h3>
              
              {/* Contact Name */}
              <div>
                <label htmlFor="contactName" className="block text-sm font-medium text-gray-700">
                  Your Name
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="contactName"
                    name="contactName"
                    type="text"
                    value={values.contactName}
                    onChange={(e) => handleChange('contactName', e.target.value)}
                    onBlur={() => handleBlur('contactName')}
                    className={`appearance-none block w-full pl-10 pr-3 py-2 border ${
                      errors.contactName && touched.contactName 
                        ? 'border-red-300' 
                        : 'border-gray-300'
                    } rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="John Doe"
                  />
                </div>
                {errors.contactName && touched.contactName && (
                  <p className="mt-1 text-sm text-red-600">{errors.contactName}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={values.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    onBlur={() => handleBlur('email')}
                    className={`appearance-none block w-full pl-10 pr-3 py-2 border ${
                      errors.email && touched.email 
                        ? 'border-red-300' 
                        : 'border-gray-300'
                    } rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="john@company.com"
                  />
                </div>
                {errors.email && touched.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={values.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    onBlur={() => handleBlur('password')}
                    className={`appearance-none block w-full pl-10 pr-10 py-2 border ${
                      errors.password && touched.password 
                        ? 'border-red-300' 
                        : 'border-gray-300'
                    } rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Minimum 6 characters</p>
                {errors.password && touched.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                )}
              </div>
            </div>

            {/* Terms */}
            <div className="text-xs text-gray-600 pt-4 border-t border-gray-200">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="text-blue-600 hover:text-blue-500">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-blue-600 hover:text-blue-500">
                Privacy Policy
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                'Create Account'
              )}
            </button>
          </div>

          {/* Sign In Link */}
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
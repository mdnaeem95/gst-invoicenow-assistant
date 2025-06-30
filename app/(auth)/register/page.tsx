'use client'

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Building2, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Shield,
  CreditCard
} from 'lucide-react';

interface FormData {
  // Step 1 - Company Info
  companyName: string;
  uen: string;
  gstNumber: string;
  
  // Step 2 - Account Info
  email: string;
  password: string;
  
  // Step 3 - Terms
  agreeToTerms: boolean;
  subscribeToUpdates: boolean;
}

interface FormErrors {
  companyName?: string;
  uen?: string;
  gstNumber?: string;
  email?: string;
  password?: string;
  agreeToTerms?: string;
}

export default function ImprovedRegistrationPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    uen: '',
    gstNumber: '',
    email: '',
    password: '',
    agreeToTerms: false,
    subscribeToUpdates: true,
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [uenSuggestion, setUenSuggestion] = useState('');

  // UEN validation and formatting
  const formatUEN = (value: string) => {
    // Remove all non-alphanumeric characters
    const cleaned = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
    
    // Format as 123456789A
    if (cleaned.length >= 9) {
      return cleaned.slice(0, 9) + cleaned.slice(9, 10);
    }
    return cleaned;
  };

  // GST number formatting
  const formatGST = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^0-9A-Z-]/g, '');
    
    // Auto-add GST prefix if not present
    if (cleaned && !cleaned.startsWith('GST') && !cleaned.startsWith('M')) {
      return 'GST' + cleaned;
    }
    
    // Format M2-1234567-8 pattern
    if (cleaned.startsWith('M') && cleaned.length > 2) {
      const parts = cleaned.match(/^(M\d)(\d{0,7})(\d{0,1})$/);
      if (parts) {
        let formatted = parts[1];
        if (parts[2]) formatted += '-' + parts[2];
        if (parts[3]) formatted += '-' + parts[3];
        return formatted;
      }
    }
    
    return cleaned;
  };

  // Password strength calculation
  const calculatePasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 6) strength += 25;
    if (password.length >= 8) strength += 25;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
    if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) strength += 25;
    setPasswordStrength(strength);
  };

  // Validation functions
  const validateStep = (step: number): boolean => {
    const newErrors: FormErrors = {};
    
    if (step === 1) {
      if (!formData.companyName) {
        newErrors.companyName = 'Company name is required';
      }
      
      if (!formData.uen) {
        newErrors.uen = 'UEN is required';
      } else if (!/^[0-9]{8,9}[A-Z]$/.test(formData.uen)) {
        newErrors.uen = 'Invalid UEN format (e.g., 123456789A)';
      }
      
      if (formData.gstNumber && !/^(GST[0-9]{8}|M[0-9]-[0-9]{7}-[0-9])$/.test(formData.gstNumber)) {
        newErrors.gstNumber = 'Invalid GST format (e.g., GST12345678 or M2-1234567-8)';
      }
    }
    
    if (step === 2) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!formData.email) {
        newErrors.email = 'Email is required';
      } else if (!emailRegex.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
      
      if (!formData.password) {
        newErrors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
      }
    }
    
    if (step === 3) {
      if (!formData.agreeToTerms) {
        newErrors.agreeToTerms = 'You must agree to the terms to continue';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(3)) return;
    
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      // Handle success
    }, 2000);
  };

  const handleFieldChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
    
    // Clear error when user types
    //@ts-ignore
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
    
    // Special handling for password
    if (field === 'password') {
      calculatePasswordStrength(value);
    }
  };

  // Progress indicator
  const steps = [
    { number: 1, title: 'Company Info' },
    { number: 2, title: 'Account Setup' },
    { number: 3, title: 'Complete' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo and Title */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">GST InvoiceNow</h2>
          <p className="mt-2 text-sm text-gray-600">
            Create your account in 3 easy steps
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mt-8">
          <nav aria-label="Progress">
            <ol className="flex items-center justify-between">
              {steps.map((step) => (
                <li key={step.number} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                      ${currentStep > step.number 
                        ? 'bg-blue-600 text-white' 
                        : currentStep === step.number 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-200 text-gray-600'}
                    `}>
                      {currentStep > step.number ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        step.number
                      )}
                    </div>
                    <span className={`mt-2 text-xs ${
                      currentStep >= step.number ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {step.title}
                    </span>
                  </div>
                  {step.number < steps.length && (
                    <div className={`flex-1 h-0.5 mx-2 ${
                      currentStep > step.number ? 'bg-blue-600' : 'bg-gray-200'
                    }`} />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
          {/* Step 1: Company Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Company Information</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Tell us about your business
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Company Name *
                </label>
                <div className="mt-1 relative">
                  <Building2 className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => handleFieldChange('companyName', e.target.value)}
                    className={`pl-10 block w-full rounded-md border ${
                      errors.companyName ? 'border-red-300' : 'border-gray-300'
                    } px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="ABC Pte Ltd"
                  />
                </div>
                {errors.companyName && (
                  <p className="mt-1 text-sm text-red-600">{errors.companyName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  UEN (Unique Entity Number) *
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    value={formData.uen}
                    onChange={(e) => handleFieldChange('uen', formatUEN(e.target.value))}
                    className={`block w-full rounded-md border ${
                      errors.uen ? 'border-red-300' : 'border-gray-300'
                    } px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="123456789A"
                    maxLength={10}
                  />
                </div>
                {errors.uen && (
                  <p className="mt-1 text-sm text-red-600">{errors.uen}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Format: 8-9 digits followed by a letter (e.g., 201812345A)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  GST Registration Number
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    value={formData.gstNumber}
                    onChange={(e) => handleFieldChange('gstNumber', formatGST(e.target.value))}
                    className={`block w-full rounded-md border ${
                      errors.gstNumber ? 'border-red-300' : 'border-gray-300'
                    } px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="GST12345678 or M2-1234567-8"
                  />
                </div>
                {errors.gstNumber && (
                  <p className="mt-1 text-sm text-red-600">{errors.gstNumber}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank if not GST registered yet
                </p>
              </div>

              <div className="pt-5">
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Account Setup */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Account Setup</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Create your login credentials
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email Address *
                </label>
                <div className="mt-1 relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    className={`pl-10 block w-full rounded-md border ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    } px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="name@company.com"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <div className="mt-1 relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleFieldChange('password', e.target.value)}
                    className={`pl-10 pr-10 block w-full rounded-md border ${
                      errors.password ? 'border-red-300' : 'border-gray-300'
                    } px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                )}
                
                {/* Password strength indicator */}
                {formData.password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Password strength</span>
                      <span className={`font-medium ${
                        passwordStrength >= 75 ? 'text-green-600' :
                        passwordStrength >= 50 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {passwordStrength >= 75 ? 'Strong' :
                         passwordStrength >= 50 ? 'Medium' :
                         'Weak'}
                      </span>
                    </div>
                    <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          passwordStrength >= 75 ? 'bg-green-500' :
                          passwordStrength >= 50 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${passwordStrength}%` }}
                      />
                    </div>
                    <ul className="mt-2 text-xs text-gray-600 space-y-1">
                      <li className={formData.password.length >= 6 ? 'text-green-600' : ''}>
                        • At least 6 characters
                      </li>
                      <li className={/[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password) ? 'text-green-600' : ''}>
                        • Mix of uppercase and lowercase
                      </li>
                      <li className={/\d/.test(formData.password) ? 'text-green-600' : ''}>
                        • Include numbers
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-5">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center text-sm text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Terms and Complete */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Almost done!</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Review and accept our terms to complete registration
                </p>
              </div>

              {/* Pricing preview */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-start">
                  <CreditCard className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-gray-900">Free Trial</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      Start with 30 days free. No credit card required.
                    </p>
                  </div>
                </div>
              </div>

              {/* Terms and conditions */}
              <div className="space-y-4">
                <div className="flex items-start">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={formData.agreeToTerms}
                    onChange={(e) => handleFieldChange('agreeToTerms', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="terms" className="ml-2 block text-sm text-gray-700">
                    I agree to the{' '}
                    <a href="#" className="text-blue-600 hover:text-blue-500">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="#" className="text-blue-600 hover:text-blue-500">
                      Privacy Policy
                    </a>
                  </label>
                </div>
                {errors.agreeToTerms && (
                  <p className="text-sm text-red-600">{errors.agreeToTerms}</p>
                )}

                <div className="flex items-start">
                  <input
                    id="updates"
                    type="checkbox"
                    checked={formData.subscribeToUpdates}
                    onChange={(e) => handleFieldChange('subscribeToUpdates', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="updates" className="ml-2 block text-sm text-gray-700">
                    Send me product updates and GST compliance tips
                  </label>
                </div>
              </div>

              {/* Security notice */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start">
                  <Shield className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="ml-3 text-sm text-gray-600">
                    <p>Your data is encrypted and secure. We're SOC 2 compliant and PDPA certified.</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-5">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center text-sm text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !formData.agreeToTerms}
                  className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin mr-2 h-4 w-4" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <Check className="ml-2 h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Login link */}
          <div className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
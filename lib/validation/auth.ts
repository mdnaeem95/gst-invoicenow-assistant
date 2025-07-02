// lib/validation/auth.ts

// Individual field validators (reusable across forms)
export const emailValidation = (email: string): string | null => {
  if (!email) return 'Email is required'
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return 'Please enter a valid email'
  return null
}

export const passwordValidation = (password: string): string | null => {
  if (!password) return 'Password is required'
  if (password.length < 6) return 'Password must be at least 6 characters'
  return null
}

export const companyNameValidation = (name: string): string | null => {
  if (!name) return 'Company name is required'
  if (name.length < 2) return 'Company name must be at least 2 characters'
  return null
}

export const uenValidation = (uen: string): string | null => {
  if (!uen) return 'UEN is required'
  const uenRegex = /^[0-9]{8,9}[A-Z]$/
  if (!uenRegex.test(uen)) return 'Invalid UEN format (e.g., 123456789A)'
  return null
}

export const gstValidation = (gst: string): string | null => {
  if (!gst) return null // Optional field
  const gstRegex = /^(GST[0-9]{8}|M[0-9]-[0-9]{7}-[0-9])$/
  if (!gstRegex.test(gst)) return 'Invalid GST format (e.g., GST12345678)'
  return null
}

export const contactNameValidation = (name: string): string | null => {
  if (!name) return 'Your name is required'
  if (name.length < 2) return 'Name must be at least 2 characters'
  return null
}

// Optional validators for other auth flows
export const newPasswordValidation = (password: string): string | null => {
  if (!password) return 'New password is required'
  if (password.length < 6) return 'Password must be at least 6 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number'
  return null
}

export const confirmPasswordValidation = (password: string, confirmPassword: string): string | null => {
  if (!confirmPassword) return 'Please confirm your password'
  if (password !== confirmPassword) return 'Passwords do not match'
  return null
}

// Validation rule sets for different forms
export const loginValidationRules = {
  email: emailValidation,
  password: passwordValidation
}

export const registrationValidationRules = {
  companyName: companyNameValidation,
  uen: uenValidation,
  gstNumber: gstValidation,
  contactName: contactNameValidation,
  email: emailValidation,
  password: passwordValidation
}

export const forgotPasswordValidationRules = {
  email: emailValidation
}

export const resetPasswordValidationRules = {
  password: newPasswordValidation,
  confirmPassword: (value: string, allValues: any) => 
    confirmPasswordValidation(allValues.password, value)
}

// You can also create a profile update validation rule set
export const profileUpdateValidationRules = {
  companyName: companyNameValidation,
  uen: uenValidation,
  gstNumber: gstValidation,
  contactName: contactNameValidation
}

// Helper function to validate a single field (useful for on-blur validation)
export const validateField = (
  fieldName: string, 
  value: string, 
  rules: Record<string, (value: string) => string | null>
): string | null => {
  const validator = rules[fieldName]
  return validator ? validator(value) : null
}

// Helper to validate all fields at once
export const validateAllFields = (
  values: Record<string, any>,
  rules: Record<string, (value: string, allValues?: any) => string | null>
): Record<string, string> => {
  const errors: Record<string, string> = {}
  
  Object.keys(rules).forEach(fieldName => {
    const validator = rules[fieldName]
    const error = validator(values[fieldName], values)
    if (error) {
      errors[fieldName] = error
    }
  })
  
  return errors
}
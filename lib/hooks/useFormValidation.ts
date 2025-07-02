// lib/hooks/useFormValidation.ts
import { useState, useCallback } from 'react'

interface ValidationRules {
  [key: string]: (value: string) => string | null
}

interface UseFormValidationReturn<T> {
  values: T
  errors: Partial<Record<keyof T, string>>
  touched: Partial<Record<keyof T, boolean>>
  handleChange: (name: keyof T, value: string) => void
  handleBlur: (name: keyof T) => void
  validateForm: () => boolean
  resetForm: () => void
}

export function useFormValidation<T extends Record<string, string>>(
  initialValues: T,
  validationRules: ValidationRules
): UseFormValidationReturn<T> {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({})

  const validateField = useCallback((name: keyof T, value: string) => {
    const rule = validationRules[name as string]
    return rule ? rule(value) : null
  }, [validationRules])

  const handleChange = useCallback((name: keyof T, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }, [errors])

  const handleBlur = useCallback((name: keyof T) => {
    setTouched(prev => ({ ...prev, [name]: true }))
    
    const error = validateField(name, values[name])
    if (error) {
      setErrors(prev => ({ ...prev, [name]: error }))
    }
  }, [values, validateField])

  const validateForm = useCallback(() => {
    const newErrors: Partial<Record<keyof T, string>> = {}
    let isValid = true

    Object.keys(validationRules).forEach(key => {
      const error = validateField(key as keyof T, values[key as keyof T])
      if (error) {
        newErrors[key as keyof T] = error
        isValid = false
      }
    })

    setErrors(newErrors)
    setTouched(Object.keys(values).reduce((acc, key) => ({ ...acc, [key]: true }), {}))
    
    return isValid
  }, [values, validationRules, validateField])

  const resetForm = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
  }, [initialValues])

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateForm,
    resetForm
  }
}
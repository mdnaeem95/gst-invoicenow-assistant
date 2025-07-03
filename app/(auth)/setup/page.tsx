// app/(auth)/setup/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Building2, 
  Hash,
  FileText,
  Phone,
  MapPin,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react'

export default function SetupPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  const [profile, setProfile] = useState({
    company_uen: '',
    company_address: '',
    gst_number: '',
    contact_phone: ''
  })

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      console.log('Loading profile for user:', user.id)

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      console.log('Profile query result:', { data, error })

      if (error) {
        // Handle the case where profile doesn't exist
        if (error.code === 'PGRST116') {
          console.log('No profile found, creating one...')
          // Create a basic profile if it doesn't exist
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              email: user.email,
              full_name: user.user_metadata?.full_name || '',
              company_name: user.user_metadata?.company_name || ''
            })
            .select()
            .single()
          
          if (createError) {
            console.error('Error creating profile:', createError)
            throw createError
          }
          
          if (newProfile) {
            setProfile({
              company_uen: '',
              company_address: '',
              gst_number: '',
              contact_phone: ''
            })
          }
        } else {
          throw error
        }
      } else if (data) {
        setProfile({
          company_uen: data.company_uen?.startsWith('TEMP') ? '' : data.company_uen || '',
          company_address: data.company_address || '',
          gst_number: data.gst_number || '',
          contact_phone: data.contact_phone || ''
        })
      }
    } catch (err) {
      console.error('Error loading profile:', err)
      setError('Failed to load profile. Please try refreshing the page.')
    } finally {
      setLoading(false)
    }
  }

  const formatUEN = (value: string) => {
    return value.toUpperCase().replace(/[^0-9A-Z]/g, '')
  }

  const formatGST = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^0-9A-Z-]/g, '')
    if (cleaned && /^[0-9]/.test(cleaned)) {
      return 'GST' + cleaned
    }
    return cleaned
  }

  const validateForm = () => {
    // UEN validation
    if (!profile.company_uen) {
      setError('Company UEN is required')
      return false
    }
    
    const uenRegex = /^[0-9]{8,9}[A-Z]$/
    if (!uenRegex.test(profile.company_uen)) {
      setError('Invalid UEN format (e.g., 201234567A)')
      return false
    }

    // GST validation (optional)
    if (profile.gst_number) {
      const gstRegex = /^(GST[0-9]{8}|M[0-9]-[0-9]{7}-[0-9])$/
      if (!gstRegex.test(profile.gst_number)) {
        setError('Invalid GST format (e.g., GST12345678)')
        return false
      }
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return
    
    setSaving(true)
    setError(null)
    setSuccess(null)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          company_uen: profile.company_uen,
          company_address: profile.company_address,
          gst_number: profile.gst_number || null,
          contact_phone: profile.contact_phone,
          onboarding_completed: true,
          onboarding_step: 'complete',
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      // Log the setup completion
      await supabase.rpc('log_user_action', {
        p_action: 'user.setup_completed',
        p_metadata: {
          company_uen: profile.company_uen,
          has_gst: !!profile.gst_number
        }
      })

      setSuccess('Setup completed successfully!')
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    } catch (err: any) {
      console.error('Setup error:', err)
      setError(err.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Complete Your Setup
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Please provide your company details for GST compliance
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 px-6 py-8 space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="uen">Company UEN *</Label>
                <div className="mt-1 relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="uen"
                    type="text"
                    value={profile.company_uen}
                    onChange={(e) => setProfile(prev => ({ 
                      ...prev, 
                      company_uen: formatUEN(e.target.value) 
                    }))}
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
                <Label htmlFor="address">Company Address</Label>
                <div className="mt-1 relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="address"
                    type="text"
                    value={profile.company_address}
                    onChange={(e) => setProfile(prev => ({ 
                      ...prev, 
                      company_address: e.target.value 
                    }))}
                    className="pl-10"
                    placeholder="123 Orchard Road, Singapore 238858"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="gst">GST Registration Number</Label>
                <div className="mt-1 relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="gst"
                    type="text"
                    value={profile.gst_number}
                    onChange={(e) => setProfile(prev => ({ 
                      ...prev, 
                      gst_number: formatGST(e.target.value) 
                    }))}
                    className="pl-10"
                    placeholder="GST12345678 (optional)"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank if not GST registered
                </p>
              </div>

              <div>
                <Label htmlFor="phone">Contact Phone</Label>
                <div className="mt-1 relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="phone"
                    type="tel"
                    value={profile.contact_phone}
                    onChange={(e) => setProfile(prev => ({ 
                      ...prev, 
                      contact_phone: e.target.value 
                    }))}
                    className="pl-10"
                    placeholder="+65 1234 5678"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Complete Setup'
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
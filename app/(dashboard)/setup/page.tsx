// app/(dashboard)/setup/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, FileText, CreditCard, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function SetupPage() {
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [formData, setFormData] = useState({
    companyName: '',
    uen: '',
    gstNumber: ''
  })
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkProfile()
  }, [])

  const checkProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profile) {
      setProfile(profile)
      
      // If profile is already complete, redirect to dashboard
      if (profile.company_uen && !profile.company_uen.startsWith('TEMP')) {
        router.push('/dashboard')
      }
      
      // Pre-fill form with existing data
      setFormData({
        companyName: profile.company_name || '',
        uen: profile.company_uen?.startsWith('TEMP') ? '' : profile.company_uen || '',
        gstNumber: profile.gst_number || ''
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { error } = await supabase
        .from('profiles')
        .update({
          company_name: formData.companyName,
          company_uen: formData.uen,
          gst_number: formData.gstNumber
        })
        .eq('id', user?.id)

      if (error) throw error

      toast.success('Profile updated successfully!')
      router.push('/dashboard')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <CardHeader>
            <CardTitle>Complete Your Profile</CardTitle>
            <CardDescription>
              Just a few more details to get you started with GST InvoiceNow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="companyName">Company Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="pl-10"
                    placeholder="ABC Pte Ltd"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="uen">UEN (Unique Entity Number)</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="uen"
                    value={formData.uen}
                    onChange={(e) => setFormData({ ...formData, uen: e.target.value.toUpperCase() })}
                    className="pl-10"
                    placeholder="123456789A"
                    pattern="[0-9]{8,9}[A-Z]"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Format: 8-9 digits followed by a letter
                </p>
              </div>

              <div>
                <Label htmlFor="gstNumber">GST Registration Number (Optional)</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="gstNumber"
                    value={formData.gstNumber}
                    onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                    className="pl-10"
                    placeholder="GST12345678"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  You can add this later if not GST registered yet
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Complete Setup'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
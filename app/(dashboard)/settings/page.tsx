'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { 
  Building2, 
  CreditCard, 
  FileText, 
  Save, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Bell,
  Shield,
  Key,
  Smartphone,
  Download,
  Trash2,
  Info,
  ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'

interface ProfileData {
  company_name: string
  company_uen: string
  gst_number: string
  contact_name: string
  email: string
  phone: string
  website: string
  address: string
  postal_code: string
}

interface NotificationSettings {
  email_notifications: boolean
  invoice_processed: boolean
  invoice_failed: boolean
  weekly_summary: boolean
  compliance_alerts: boolean
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<ProfileData>({
    company_name: '',
    company_uen: '',
    gst_number: '',
    contact_name: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    postal_code: ''
  })
  const [originalProfile, setOriginalProfile] = useState<ProfileData | null>(null)
  const [notifications, setNotifications] = useState<NotificationSettings>({
    email_notifications: true,
    invoice_processed: true,
    invoice_failed: true,
    weekly_summary: false,
    compliance_alerts: true
  })
  const [userStats, setUserStats] = useState({
    joinDate: '',
    totalInvoices: 0,
    lastLogin: '',
    storageUsed: 0
  })
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
    loadUserStats()
  }, [])

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error loading profile:', error)
        toast.error('Failed to load profile data')
        return
      }

      const profileInfo = {
        company_name: profileData.company_name || '',
        company_uen: profileData.company_uen || '',
        gst_number: profileData.gst_number || '',
        contact_name: profileData.contact_name || '',
        email: user.email || '',
        phone: profileData.phone || '',
        website: profileData.website || '',
        address: profileData.address || '',
        postal_code: profileData.postal_code || ''
      }

      setProfile(profileInfo)
      setOriginalProfile(profileInfo)
      
      // Load notification settings (in real app, from database)
      setNotifications({
        email_notifications: profileData.email_notifications ?? true,
        invoice_processed: profileData.invoice_processed ?? true,
        invoice_failed: profileData.invoice_failed ?? true,
        weekly_summary: profileData.weekly_summary ?? false,
        compliance_alerts: profileData.compliance_alerts ?? true
      })
    } catch (error) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const loadUserStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get invoice count
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      // Get user metadata
      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user.id)
        .single()

      setUserStats({
        joinDate: profile?.created_at || '',
        totalInvoices: count || 0,
        lastLogin: user.last_sign_in_at || '',
        storageUsed: Math.random() * 500 // Simulated storage in MB
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        toast.error('You must be logged in to update settings')
        return
      }

      // Validate UEN format
      if (profile.company_uen && !/^[0-9]{8,9}[A-Z]$/.test(profile.company_uen)) {
        toast.error('Invalid UEN format (e.g., 123456789A)')
        setSaving(false)
        return
      }

      // Validate GST format
      if (profile.gst_number && !/^(GST[0-9]{8}|M[0-9]-[0-9]{7}-[0-9])$/.test(profile.gst_number)) {
        toast.error('Invalid GST format (e.g., GST12345678 or M2-1234567-8)')
        setSaving(false)
        return
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          company_name: profile.company_name,
          company_uen: profile.company_uen,
          gst_number: profile.gst_number,
          contact_name: profile.contact_name,
          phone: profile.phone,
          website: profile.website,
          address: profile.address,
          postal_code: profile.postal_code,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) {
        console.error('Error updating profile:', error)
        toast.error('Failed to update profile')
        return
      }

      setOriginalProfile(profile)
      toast.success('Settings updated successfully!')
      router.refresh()
    } catch (error) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleNotificationChange = (key: keyof NotificationSettings, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }))
    // In real app, save to database
    toast.success('Notification preferences updated')
  }

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(originalProfile)

  const formatUEN = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^0-9A-Z]/g, '')
    if (cleaned.length >= 9) {
      return cleaned.slice(0, 9) + cleaned.slice(9, 10)
    }
    return cleaned
  }

  const formatGST = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^0-9A-Z-]/g, '')
    
    if (cleaned && !cleaned.startsWith('GST') && !cleaned.startsWith('M')) {
      return 'GST' + cleaned
    }
    
    return cleaned
  }

  const handleExportData = () => {
    toast.info('Preparing your data export...')
    // Implement data export functionality
  }

  const handleDeleteAccount = () => {
    toast.error('Account deletion requires contacting support')
    // Implement account deletion flow
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your account settings and preferences
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        {/* Company Information Tab */}
        <TabsContent value="company" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>
                Update your company details for InvoiceNow compliance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="company_name"
                      value={profile.company_name}
                      onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                      className="pl-10"
                      placeholder="ABC Pte Ltd"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company_uen">UEN (Unique Entity Number)</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="company_uen"
                      value={profile.company_uen}
                      onChange={(e) => setProfile({ ...profile, company_uen: formatUEN(e.target.value) })}
                      className="pl-10"
                      placeholder="123456789A"
                      maxLength={10}
                    />
                  </div>
                  <p className="text-xs text-gray-500">Format: 8-9 digits followed by a letter</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gst_number">GST Registration Number</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="gst_number"
                      value={profile.gst_number}
                      onChange={(e) => setProfile({ ...profile, gst_number: formatGST(e.target.value) })}
                      className="pl-10"
                      placeholder="GST12345678 or M2-1234567-8"
                    />
                  </div>
                  <p className="text-xs text-gray-500">Leave blank if not GST registered</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="website"
                      type="url"
                      value={profile.website}
                      onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                      className="pl-10"
                      placeholder="https://www.example.com"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Business Address</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Street Address</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="address"
                        value={profile.address}
                        onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                        className="pl-10"
                        placeholder="123 Business Street, #01-01"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={profile.postal_code}
                      onChange={(e) => setProfile({ ...profile, postal_code: e.target.value })}
                      placeholder="123456"
                      maxLength={6}
                    />
                  </div>
                </div>
              </div>

              {!profile.gst_number && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Adding your GST number is required for processing InvoiceNow compliant invoices.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>
                Your personal contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="contact_name">Contact Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="contact_name"
                      value={profile.contact_name}
                      onChange={(e) => setProfile({ ...profile, contact_name: e.target.value })}
                      className="pl-10"
                      placeholder="John Doe"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="pl-10"
                      placeholder="+65 1234 5678"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      value={profile.email}
                      className="pl-10"
                      disabled
                    />
                  </div>
                  <p className="text-xs text-gray-500">Email cannot be changed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => setProfile(originalProfile!)}
              disabled={!hasChanges || saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Choose what emails you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-gray-500">Receive email updates about your account</p>
                </div>
                <Switch
                  checked={notifications.email_notifications}
                  onCheckedChange={(checked) => handleNotificationChange('email_notifications', checked)}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Activity Notifications</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Invoice Processed</Label>
                      <p className="text-sm text-gray-500">When an invoice is successfully processed</p>
                    </div>
                    <Switch
                      checked={notifications.invoice_processed}
                      onCheckedChange={(checked) => handleNotificationChange('invoice_processed', checked)}
                      disabled={!notifications.email_notifications}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Processing Failed</Label>
                      <p className="text-sm text-gray-500">When invoice processing fails</p>
                    </div>
                    <Switch
                      checked={notifications.invoice_failed}
                      onCheckedChange={(checked) => handleNotificationChange('invoice_failed', checked)}
                      disabled={!notifications.email_notifications}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Weekly Summary</Label>
                      <p className="text-sm text-gray-500">Weekly overview of your invoices</p>
                    </div>
                    <Switch
                      checked={notifications.weekly_summary}
                      onCheckedChange={(checked) => handleNotificationChange('weekly_summary', checked)}
                      disabled={!notifications.email_notifications}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Compliance Alerts</Label>
                      <p className="text-sm text-gray-500">Important GST compliance updates</p>
                    </div>
                    <Switch
                      checked={notifications.compliance_alerts}
                      onCheckedChange={(checked) => handleNotificationChange('compliance_alerts', checked)}
                      disabled={!notifications.email_notifications}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Password & Authentication</CardTitle>
              <CardDescription>
                Manage your security settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium">Password</p>
                      <p className="text-sm text-gray-500">Last changed 3 months ago</p>
                    </div>
                  </div>
                  <Button variant="outline">Change Password</Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-gray-500">Add an extra layer of security</p>
                    </div>
                  </div>
                  <Button variant="outline">Enable 2FA</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Manage your active sessions across devices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">Current Session</p>
                      <p className="text-sm text-gray-500">Chrome on MacOS • Singapore</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-green-600">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Overview</CardTitle>
              <CardDescription>
                Your account information and usage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Member Since</p>
                  <p className="font-medium">
                    {userStats.joinDate ? format(new Date(userStats.joinDate), 'MMMM d, yyyy') : 'N/A'}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Total Invoices</p>
                  <p className="font-medium">{userStats.totalInvoices}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Last Login</p>
                  <p className="font-medium">
                    {userStats.lastLogin ? format(new Date(userStats.lastLogin), 'MMM d, yyyy h:mm a') : 'N/A'}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Storage Used</p>
                  <p className="font-medium">{userStats.storageUsed.toFixed(1)} MB / 1 GB</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Management</CardTitle>
              <CardDescription>
                Export or delete your account data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Download className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium">Export Data</p>
                    <p className="text-sm text-gray-500">Download all your invoices and account data</p>
                  </div>
                </div>
                <Button variant="outline" onClick={handleExportData}>
                  Export
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
                <div className="flex items-center gap-3">
                  <Trash2 className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium text-red-900">Delete Account</p>
                    <p className="text-sm text-red-700">Permanently delete your account and data</p>
                  </div>
                </div>
                <Button variant="destructive" onClick={handleDeleteAccount}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Legal & Compliance</CardTitle>
              <CardDescription>
                Important documents and agreements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <a href="#" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <span className="text-sm font-medium">Terms of Service</span>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </a>
              <a href="#" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <span className="text-sm font-medium">Privacy Policy</span>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </a>
              <a href="#" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <span className="text-sm font-medium">Data Processing Agreement</span>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </a>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Upload, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user?.id)
    .single()
  
  // Get invoice statistics
  const { count: totalInvoices } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user?.id)
  
  const { count: processedInvoices } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user?.id)
    .eq('status', 'submitted')
  
  const { count: pendingInvoices } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user?.id)
    .in('status', ['draft', 'processing'])

  return (
    <div>
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {profile?.company_name || 'there'}!
        </h1>
        <p className="text-gray-600 mt-2">
          Manage your GST e-invoices and ensure compliance with InvoiceNow requirements.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Invoice
            </CardTitle>
            <CardDescription>
              Convert your PDF or Excel invoices to InvoiceNow format
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/invoices/upload">
              <Button className="w-full">Upload New Invoice</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              View Invoices
            </CardTitle>
            <CardDescription>
              Check the status of your processed invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/invoices">
              <Button variant="outline" className="w-full">View All Invoices</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">Total Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalInvoices || 0}</div>
            <p className="text-sm text-gray-600 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Processed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{processedInvoices || 0}</div>
            <p className="text-sm text-gray-600 mt-1">Successfully submitted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{pendingInvoices || 0}</div>
            <p className="text-sm text-gray-600 mt-1">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Status */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Compliance Status</CardTitle>
          <CardDescription>Your InvoiceNow readiness</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Company UEN</span>
              <span className="text-sm text-gray-600">{profile?.uen || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">GST Registration</span>
              <span className="text-sm text-gray-600">{profile?.gst_number || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">InvoiceNow Status</span>
              <span className="text-sm font-medium text-green-600">Ready</span>
            </div>
          </div>
          
          {!profile?.gst_number && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                Please update your GST registration number in settings.
              </p>
              <Link href="/settings">
                <Button size="sm" variant="outline" className="mt-2">
                  Update Settings
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
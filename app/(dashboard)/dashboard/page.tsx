import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  TrendingUp,
  ArrowRight,
  Calendar,
  Building2,
  CreditCard,
  FileCheck,
  AlertTriangle,
  Activity
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

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

  const { count: failedInvoices } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user?.id)
    .eq('status', 'failed')

  // Get recent invoices
  const { data: recentInvoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Calculate compliance rate
  const complianceRate = totalInvoices ? Math.round((processedInvoices || 0) / totalInvoices * 100) : 0

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back{profile?.company_name ? `, ${profile.company_name}` : ''}! 👋
        </h1>
        <p className="text-gray-600 mt-2">
          Here's an overview of your GST e-invoice compliance status
        </p>
      </div>

      {/* Compliance Alert */}
      {!profile?.gst_number && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-900">Complete Your Setup</h3>
              <p className="text-sm text-amber-700 mt-1">
                Add your GST registration number to start processing InvoiceNow compliant invoices.
              </p>
              <Link href="/settings">
                <Button size="sm" variant="outline" className="mt-3">
                  Complete Setup
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-2 hover:border-primary/50 transition-colors cursor-pointer">
          <Link href="/invoices/upload">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <CardTitle className="text-xl mt-4">Upload Invoice</CardTitle>
              <CardDescription>
                Convert PDF or Excel invoices to InvoiceNow XML format
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="border-2 hover:border-primary/50 transition-colors cursor-pointer">
          <Link href="/invoices">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <CardTitle className="text-xl mt-4">View Invoices</CardTitle>
              <CardDescription>
                Manage and track all your processed invoices
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Total Invoices</CardTitle>
              <FileText className="h-4 w-4 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInvoices || 0}</div>
            <p className="text-xs text-gray-500 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Processed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{processedInvoices || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Successfully submitted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingInvoices || 0}</div>
            <p className="text-xs text-gray-500 mt-1">In progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Failed</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{failedInvoices || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Invoices</CardTitle>
                <Link href="/invoices">
                  <Button variant="ghost" size="sm">
                    View all
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentInvoices && recentInvoices.length > 0 ? (
                <div className="space-y-4">
                  {recentInvoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          invoice.status === 'submitted' ? 'bg-green-100' :
                          invoice.status === 'failed' ? 'bg-red-100' :
                          'bg-gray-100'
                        }`}>
                          <FileText className={`h-4 w-4 ${
                            invoice.status === 'submitted' ? 'text-green-600' :
                            invoice.status === 'failed' ? 'text-red-600' :
                            'text-gray-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{invoice.invoice_number}</p>
                          <p className="text-xs text-gray-500">
                            {invoice.customer_name} • {format(new Date(invoice.created_at), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          invoice.status === 'submitted' ? 'bg-green-100 text-green-700' :
                          invoice.status === 'failed' ? 'bg-red-100 text-red-700' :
                          invoice.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {invoice.status}
                        </span>
                        <Link href={`/invoices/${invoice.id}`}>
                          <Button variant="ghost" size="sm">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No invoices yet</p>
                  <Link href="/invoices/upload">
                    <Button size="sm" className="mt-3">
                      Upload your first invoice
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Compliance Score */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Compliance Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative pt-1">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-3xl font-bold text-primary">{complianceRate}%</span>
                    <p className="text-sm text-gray-500 mt-1">InvoiceNow ready</p>
                  </div>
                  <Activity className={`h-8 w-8 ${
                    complianceRate >= 80 ? 'text-green-500' :
                    complianceRate >= 50 ? 'text-yellow-500' :
                    'text-red-500'
                  }`} />
                </div>
                <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
                  <div
                    style={{ width: `${complianceRate}%` }}
                    className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${
                      complianceRate >= 80 ? 'bg-green-500' :
                      complianceRate >= 50 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                  />
                </div>
              </div>
              {complianceRate < 100 && (
                <p className="text-xs text-gray-600 mt-3">
                  Process {pendingInvoices} more invoice{pendingInvoices !== 1 ? 's' : ''} to improve your score
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Company</span>
                </div>
                <span className="text-sm font-medium">{profile?.company_name || 'Not set'}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">UEN</span>
                </div>
                <span className="text-sm font-medium">{profile?.company_uen || 'Not set'}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">GST No.</span>
                </div>
                <span className="text-sm font-medium">{profile?.gst_number || 'Not set'}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Member since</span>
                </div>
                <span className="text-sm font-medium">
                  {profile?.created_at ? format(new Date(profile.created_at), 'MMM yyyy') : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg">Need Help?</CardTitle>
              <CardDescription>
                Learn how to use GST InvoiceNow Assistant
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Link href="/help/getting-started">
                  <Button variant="ghost" size="sm" className="w-full justify-start">
                    Getting Started Guide
                  </Button>
                </Link>
                <Link href="/help/faq">
                  <Button variant="ghost" size="sm" className="w-full justify-start">
                    Frequently Asked Questions
                  </Button>
                </Link>
                <Link href="/help/contact">
                  <Button variant="ghost" size="sm" className="w-full justify-start">
                    Contact Support
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
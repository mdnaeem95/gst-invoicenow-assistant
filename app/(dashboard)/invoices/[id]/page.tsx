import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ArrowLeft, 
  Download, 
  Send,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Eye
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { XMLPreviewModal } from '@/components/invoice/xml-preview-modal'
import { DeleteInvoiceModal } from '@/components/invoice/delete-invoice-modal'
import { DownloadXMLButton, DownloadOriginalButton } from '@/components/invoice/download-buttons'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get invoice with items
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      *,
      items:invoice_items(*)
    `)
    .eq('id', id)
    .eq('user_id', user?.id)
    .single()

  if (!invoice) {
    notFound()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'processing':
        return <Clock className="h-5 w-5 text-blue-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD'
    }).format(amount)
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/invoices">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Invoices
          </Button>
        </Link>
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Invoice {invoice.invoice_number}</h1>
            <div className="flex items-center gap-3 mt-2">
              {getStatusIcon(invoice.status)}
              <Badge variant={invoice.status === 'submitted' ? 'default' : 'secondary'}>
                {invoice.status}
              </Badge>
              <span className="text-gray-500">•</span>
              <span className="text-gray-600">
                Created {format(new Date(invoice.created_at), 'dd MMM yyyy, h:mm a')}
              </span>
            </div>
          </div>
          
          <div className="flex gap-2">
            {invoice.converted_xml_url && (
              <DownloadXMLButton xmlUrl={invoice.converted_xml_url} />
            )}
            {invoice.status === 'draft' && (
              <Button>
                <Send className="h-4 w-4 mr-2" />
                Submit to PEPPOL
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {invoice.error_message && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Processing Error:</strong> {invoice.error_message}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Invoice Number</p>
                  <p className="font-medium">{invoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Invoice Date</p>
                  <p className="font-medium">
                    {format(new Date(invoice.invoice_date), 'dd MMM yyyy')}
                  </p>
                </div>
                {invoice.due_date && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Due Date</p>
                    <p className="font-medium">
                      {format(new Date(invoice.due_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Customer</p>
                  <p className="font-medium">{invoice.customer_name}</p>
                  {invoice.customer_uen && (
                    <p className="text-sm text-gray-600">UEN: {invoice.customer_uen}</p>
                  )}
                </div>
                {invoice.peppol_id && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">PEPPOL ID</p>
                    <p className="font-medium">{invoice.peppol_id}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="pb-3 font-medium">Description</th>
                      <th className="pb-3 font-medium text-right">Qty</th>
                      <th className="pb-3 font-medium text-right">Unit Price</th>
                      <th className="pb-3 font-medium text-right">GST</th>
                      <th className="pb-3 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items?.map((item: any) => (
                      <tr key={item.id} className="border-b">
                        <td className="py-3">{item.description}</td>
                        <td className="py-3 text-right">{item.quantity}</td>
                        <td className="py-3 text-right">{formatCurrency(item.unit_price)}</td>
                        <td className="py-3 text-right">{item.gst_rate}%</td>
                        <td className="py-3 text-right font-medium">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2">
                    <tr>
                      <td colSpan={4} className="py-3 text-right">Subtotal</td>
                      <td className="py-3 text-right font-medium">
                        {formatCurrency(invoice.subtotal)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="py-3 text-right">GST (9%)</td>
                      <td className="py-3 text-right font-medium">
                        {formatCurrency(invoice.gst_amount)}
                      </td>
                    </tr>
                    <tr className="text-lg">
                      <td colSpan={4} className="py-3 text-right font-medium">Total</td>
                      <td className="py-3 text-right font-bold">
                        {formatCurrency(invoice.total_amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invoice.converted_xml_url && (
                <XMLPreviewModal 
                  xmlUrl={invoice.converted_xml_url} 
                  invoiceNumber={invoice.invoice_number}
                />
              )}
              {invoice.original_file_url && (
                <DownloadOriginalButton fileUrl={invoice.original_file_url} />
              )}
              <DeleteInvoiceModal 
                invoiceId={invoice.id} 
                invoiceNumber={invoice.invoice_number}
                variant="default"
              />
            </CardContent>
          </Card>

          {/* Processing History */}
          <Card>
            <CardHeader>
              <CardTitle>Processing History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Invoice Created</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(invoice.created_at), 'dd MMM yyyy, h:mm a')}
                    </p>
                  </div>
                </div>
                
                {invoice.status !== 'draft' && (
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${
                      invoice.status === 'submitted' ? 'bg-green-500' : 
                      invoice.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                    }`} />
                    <div className="flex-1">
                      <p className="font-medium text-sm capitalize">{invoice.status}</p>
                      <p className="text-sm text-gray-500">
                        {format(new Date(invoice.updated_at), 'dd MMM yyyy, h:mm a')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
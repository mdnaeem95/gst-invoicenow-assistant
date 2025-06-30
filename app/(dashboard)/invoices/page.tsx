'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { 
  FileText, 
  Plus, 
  Search, 
  MoreVertical, 
  Download, 
  Eye, 
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Filter,
  Calendar,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Send,
  RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { DeleteInvoiceModal } from '@/components/invoice/delete-invoice-modal'
import { DownloadMenuItem } from '@/components/invoice/download-menu-item'
import { toast } from 'sonner'

interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date?: string
  customer_name: string
  customer_uen?: string
  subtotal: number
  gst_amount: number
  total_amount: number
  status: 'draft' | 'processing' | 'submitted' | 'failed' | 'delivered'
  peppol_id?: string
  original_file_url?: string
  converted_xml_url?: string
  error_message?: string
  created_at: string
  updated_at: string
  items?: any[]
}

type SortField = 'invoice_date' | 'total_amount' | 'created_at'
type SortOrder = 'asc' | 'desc'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  
  const itemsPerPage = 10
  const supabase = createClient()

  useEffect(() => {
    loadInvoices()
  }, [searchQuery, statusFilter, dateFilter, sortField, sortOrder, currentPage])

  const loadInvoices = async () => {
    setLoading(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)

      // Search filter
      if (searchQuery) {
        query = query.or(`invoice_number.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%`)
      }

      // Status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      // Date filter
      const now = new Date()
      if (dateFilter === 'today') {
        const today = now.toISOString().split('T')[0]
        query = query.gte('created_at', today + 'T00:00:00')
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(now.setDate(now.getDate() - 7))
        query = query.gte('created_at', weekAgo.toISOString())
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1))
        query = query.gte('created_at', monthAgo.toISOString())
      }

      // Sorting
      query = query.order(sortField, { ascending: sortOrder === 'asc' })

      // Pagination
      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) {
        console.error('Error loading invoices:', error)
        toast.error('Failed to load invoices')
        return
      }

      setInvoices(data || [])
      setTotalPages(Math.ceil((count || 0) / itemsPerPage))
    } catch (error) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      submitted: "default",
      delivered: "default",
      processing: "secondary",
      failed: "destructive",
      draft: "outline"
    }
    
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD'
    }).format(amount)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(invoices.map(inv => inv.id))
    } else {
      setSelectedInvoices([])
    }
  }

  const handleSelectInvoice = (invoiceId: string, checked: boolean) => {
    if (checked) {
      setSelectedInvoices([...selectedInvoices, invoiceId])
    } else {
      setSelectedInvoices(selectedInvoices.filter(id => id !== invoiceId))
    }
  }

  const handleBulkDownload = () => {
    // Implement bulk download logic
    toast.info(`Downloading ${selectedInvoices.length} invoices...`)
  }

  const handleRefresh = () => {
    loadInvoices()
    toast.success('Invoices refreshed')
  }

  const stats = {
    total: invoices.length,
    submitted: invoices.filter(inv => inv.status === 'submitted' || inv.status === 'delivered').length,
    pending: invoices.filter(inv => inv.status === 'draft' || inv.status === 'processing').length,
    failed: invoices.filter(inv => inv.status === 'failed').length
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-1">Manage and track your e-invoices</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link href="/invoices/upload">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Upload Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-gray-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Submitted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.submitted}</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by invoice number or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Filters */}
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedInvoices.length > 0 && (
            <div className="flex items-center gap-4 mt-4 p-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium">
                {selectedInvoices.length} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleBulkDownload}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button size="sm" variant="outline">
                  <Send className="h-4 w-4 mr-2" />
                  Submit
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedInvoices.length === invoices.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('invoice_date')}>
                      <div className="flex items-center gap-1">
                        Date
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('total_amount')}>
                      <div className="flex items-center gap-1">
                        Amount
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedInvoices.includes(invoice.id)}
                          onCheckedChange={(checked) => handleSelectInvoice(invoice.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          {invoice.invoice_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{invoice.customer_name}</p>
                          {invoice.customer_uen && (
                            <p className="text-sm text-gray-500">UEN: {invoice.customer_uen}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.invoice_date), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{formatCurrency(invoice.total_amount)}</p>
                          <p className="text-sm text-gray-500">
                            GST: {formatCurrency(invoice.gst_amount)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(invoice.status)}
                          {getStatusBadge(invoice.status)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/invoices/${invoice.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {invoice.converted_xml_url && (
                              <DownloadMenuItem xmlUrl={invoice.converted_xml_url} />
                            )}
                            {invoice.status === 'draft' && (
                              <DropdownMenuItem>
                                <Send className="h-4 w-4 mr-2" />
                                Submit to PEPPOL
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <DeleteInvoiceModal 
                                invoiceId={invoice.id} 
                                invoiceNumber={invoice.invoice_number}
                                variant="dropdown"
                              />
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
              <p className="text-gray-500 mb-6">
                {searchQuery || statusFilter !== 'all' || dateFilter !== 'all' 
                  ? 'Try adjusting your filters'
                  : 'Upload your first invoice to get started'}
              </p>
              {!searchQuery && statusFilter === 'all' && dateFilter === 'all' && (
                <Link href="/invoices/upload">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Upload Invoice
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
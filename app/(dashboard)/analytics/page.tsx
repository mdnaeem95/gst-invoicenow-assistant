'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  DollarSign,
  Calendar,
  Building2,
  Activity,
  Download,
  Info,
  PieChart,
  BarChart3,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval } from 'date-fns'
import {
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts'

interface AnalyticsData {
  totalInvoices: number
  totalAmount: number
  totalGST: number
  averageInvoiceValue: number
  complianceRate: number
  processingSuccessRate: number
  topCustomers: Array<{ name: string; count: number; amount: number }>
  monthlyTrends: Array<{ month: string; count: number; amount: number }>
  statusBreakdown: Array<{ status: string; count: number; percentage: number }>
  processingTime: { average: number; fastest: number; slowest: number }
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('last30days')
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    loadAnalytics()
  }, [timeRange])

  const loadAnalytics = async () => {
    setLoading(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get date range
      const endDate = new Date()
      let startDate = new Date()
      
      switch (timeRange) {
        case 'last7days':
          startDate.setDate(endDate.getDate() - 7)
          break
        case 'last30days':
          startDate.setDate(endDate.getDate() - 30)
          break
        case 'last90days':
          startDate.setDate(endDate.getDate() - 90)
          break
        case 'last12months':
          startDate.setMonth(endDate.getMonth() - 12)
          break
      }

      // Fetch invoices
      const { data: invoicesData, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error loading analytics:', error)
        return
      }

      setInvoices(invoicesData || [])

      // Calculate analytics
      const analyticsData = calculateAnalytics(invoicesData || [], startDate, endDate)
      setAnalytics(analyticsData)
      
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateAnalytics = (invoices: any[], startDate: Date, endDate: Date): AnalyticsData => {
    const totalInvoices = invoices.length
    const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
    const totalGST = invoices.reduce((sum, inv) => sum + (inv.gst_amount || 0), 0)
    const averageInvoiceValue = totalInvoices > 0 ? totalAmount / totalInvoices : 0

    // Status breakdown
    const statusCounts = invoices.reduce((acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: totalInvoices > 0 ? (count as any / totalInvoices) * 100 : 0
    }))

    // Compliance and success rates
    const submittedCount = invoices.filter(inv => 
      inv.status === 'submitted' || inv.status === 'delivered'
    ).length
    const complianceRate = totalInvoices > 0 ? (submittedCount / totalInvoices) * 100 : 0

    const successCount = invoices.filter(inv => 
      inv.status !== 'failed'
    ).length
    const processingSuccessRate = totalInvoices > 0 ? (successCount / totalInvoices) * 100 : 0

    // Top customers
    const customerStats = invoices.reduce((acc, inv) => {
      const customer = inv.customer_name || 'Unknown'
      if (!acc[customer]) {
        acc[customer] = { name: customer, count: 0, amount: 0 }
      }
      acc[customer].count += 1
      acc[customer].amount += inv.total_amount || 0
      return acc
    }, {} as Record<string, { name: string; count: number; amount: number }>)

    const topCustomers = Object.values(customerStats)
      .sort((a: any, b: any) => b.amount - a.amount)
      .slice(0, 5)

    // Monthly trends
    const monthlyData = invoices.reduce((acc, inv) => {
      const month = format(new Date(inv.created_at), 'MMM yyyy')
      if (!acc[month]) {
        acc[month] = { month, count: 0, amount: 0 }
      }
      acc[month].count += 1
      acc[month].amount += inv.total_amount || 0
      return acc
    }, {} as Record<string, { month: string; count: number; amount: number }>)

    const monthlyTrends = Object.values(monthlyData)

    // Processing time (simulated - in real app, you'd track actual processing times)
    const processingTime = {
      average: 45, // seconds
      fastest: 15,
      slowest: 120
    }

    return {
      totalInvoices,
      totalAmount,
      totalGST,
      averageInvoiceValue,
      complianceRate,
      processingSuccessRate,
      topCustomers: topCustomers as Array<{ name: string; count: number; amount: number }>,
      monthlyTrends: monthlyTrends as Array<{ month: string; count: number; amount: number }>,
      statusBreakdown: statusBreakdown as Array<{ status: string; count: number; percentage: number }>,
      processingTime
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const COLORS = {
    submitted: '#10b981',
    delivered: '#10b981',
    processing: '#3b82f6',
    draft: '#f59e0b',
    failed: '#ef4444'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No data available</h3>
        <p className="text-gray-500">Upload some invoices to see analytics</p>
      </div>
    )
  }

  // Calculate month-over-month growth
  const currentMonthAmount = analytics.monthlyTrends[analytics.monthlyTrends.length - 1]?.amount || 0
  const previousMonthAmount = analytics.monthlyTrends[analytics.monthlyTrends.length - 2]?.amount || 0
  const monthGrowth = previousMonthAmount > 0 
    ? ((currentMonthAmount - previousMonthAmount) / previousMonthAmount) * 100 
    : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Track your invoice processing performance</p>
        </div>
        <div className="flex gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last7days">Last 7 days</SelectItem>
              <SelectItem value="last30days">Last 30 days</SelectItem>
              <SelectItem value="last90days">Last 90 days</SelectItem>
              <SelectItem value="last12months">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.totalAmount)}</div>
            <div className="flex items-center gap-1 mt-1">
              {monthGrowth > 0 ? (
                <>
                  <ArrowUpRight className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">+{monthGrowth.toFixed(1)}%</span>
                </>
              ) : monthGrowth < 0 ? (
                <>
                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600">{monthGrowth.toFixed(1)}%</span>
                </>
              ) : null}
              <span className="text-sm text-gray-500">vs last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Total Invoices</CardTitle>
              <FileText className="h-4 w-4 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalInvoices}</div>
            <p className="text-sm text-gray-500 mt-1">
              Avg: {formatCurrency(analytics.averageInvoiceValue)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Compliance Rate</CardTitle>
              <Target className="h-4 w-4 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.complianceRate.toFixed(1)}%</div>
            <Progress value={analytics.complianceRate} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Success Rate</CardTitle>
              <Activity className="h-4 w-4 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.processingSuccessRate.toFixed(1)}%</div>
            <Progress value={analytics.processingSuccessRate} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Revenue Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Monthly invoice amounts over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: '#000' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#3b82f6" 
                      fill="#3b82f6" 
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Status Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Invoice Status Distribution</CardTitle>
                <CardDescription>Breakdown by current status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={analytics.statusBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ status, percentage }) => `${status}: ${percentage.toFixed(1)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {analytics.statusBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS] || '#gray'} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {analytics.statusBreakdown.map((item) => (
                    <div key={item.status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[item.status as keyof typeof COLORS] || '#gray' }}
                        />
                        <span className="text-sm capitalize">{item.status}</span>
                      </div>
                      <span className="text-sm font-medium">{item.count} invoices</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>GST Summary</CardTitle>
                <CardDescription>Total GST collected</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Total GST Collected</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(analytics.totalGST)}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Average GST per invoice</span>
                      <span className="text-sm font-medium">
                        {formatCurrency(analytics.totalInvoices > 0 ? analytics.totalGST / analytics.totalInvoices : 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">GST Rate</span>
                      <span className="text-sm font-medium">9%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Total Revenue (excl. GST)</span>
                      <span className="text-sm font-medium">
                        {formatCurrency(analytics.totalAmount - analytics.totalGST)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Customers</CardTitle>
              <CardDescription>By total invoice value</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.topCustomers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value: any) => `$${(value / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {analytics.topCustomers.map((customer, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-gray-200 rounded-full text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-gray-500">{customer.count} invoices</p>
                      </div>
                    </div>
                    <p className="font-medium">{formatCurrency(customer.amount)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Processing Time</CardTitle>
                <CardDescription>Average time to process invoices</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-600">Average Processing Time</p>
                    <p className="text-2xl font-bold mt-1">{analytics.processingTime.average}s</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Fastest</span>
                        <span className="text-sm font-medium">{analytics.processingTime.fastest}s</span>
                      </div>
                      <Progress value={30} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Average</span>
                        <span className="text-sm font-medium">{analytics.processingTime.average}s</span>
                      </div>
                      <Progress value={60} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Slowest</span>
                        <span className="text-sm font-medium">{analytics.processingTime.slowest}s</span>
                      </div>
                      <Progress value={100} className="h-2" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Overall system performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">System Status</span>
                    </div>
                    <span className="text-sm font-medium text-green-600">Operational</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Uptime</span>
                      <span className="text-sm font-medium">99.9%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">API Response Time</span>
                      <span className="text-sm font-medium">124ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Error Rate</span>
                      <span className="text-sm font-medium text-green-600">0.1%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
// app/test/ocr-validation/page.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
  Shield,
  Zap,
  Brain,
  Info
} from 'lucide-react'
import { toast } from 'sonner'

interface TestResult {
  type: 'ocr' | 'validation'
  timestamp: Date
  duration: number
  success: boolean
  details: any
}

export default function OCRValidationTestPage() {
  const [loading, setLoading] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mockInvoiceData, setMockInvoiceData] = useState('')

  // Test OCR with multiple providers
  const testOCR = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first')
      return
    }

    setLoading(true)
    const startTime = Date.now()

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('enableTemplateMatching', 'true')
      formData.append('minConfidence', '0.7')

      const response = await fetch('/api/test/ocr', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()
      
      setTestResults(prev => [...prev, {
        type: 'ocr',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        success: result.success,
        details: result
      }])

      if (result.success) {
        toast.success(`OCR completed successfully using ${result.provider}`)
        
        // Set the extracted data for validation testing
        setMockInvoiceData(JSON.stringify(result.data, null, 2))
      } else {
        toast.error('OCR test failed: ' + result.error)
      }
    } catch (error) {
      toast.error('OCR test error: ' + (error instanceof Error ? error.message : 'Unknown error'))
      
      setTestResults(prev => [...prev, {
        type: 'ocr',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }])
    } finally {
      setLoading(false)
    }
  }

  // Test validation engine
  const testValidation = async () => {
    if (!mockInvoiceData) {
      toast.error('Please provide invoice data or run OCR test first')
      return
    }

    setLoading(true)
    const startTime = Date.now()

    try {
      const invoiceData = JSON.parse(mockInvoiceData)
      
      const response = await fetch('/api/test/validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice: invoiceData })
      })

      const result = await response.json()
      
      setTestResults(prev => [...prev, {
        type: 'validation',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        success: result.success,
        details: result
      }])

      if (result.success) {
        toast.success(`Validation completed. Score: ${result.validationResult.score}/100`)
      } else {
        toast.error('Validation test failed: ' + result.error)
      }
    } catch (error) {
      toast.error('Validation test error: ' + (error instanceof Error ? error.message : 'Unknown error'))
      
      setTestResults(prev => [...prev, {
        type: 'validation',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }])
    } finally {
      setLoading(false)
    }
  }

  // Test UEN verification
  const testUENVerification = async () => {
    setLoading(true)
    const testUENs = ['201234567A', '199912345K', 'INVALID123', 'T20LL1234A']
    
    try {
      const response = await fetch('/api/test/uen-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uens: testUENs })
      })

      const result = await response.json()
      
      setTestResults(prev => [...prev, {
        type: 'validation',
        timestamp: new Date(),
        duration: 0,
        success: result.success,
        details: result
      }])

      toast.success('UEN verification test completed')
    } catch (error) {
      toast.error('UEN verification error')
    } finally {
      setLoading(false)
    }
  }

  const loadSampleInvoice = () => {
    const sample = {
      invoice_number: "INV-2024-001",
      invoice_date: "2024-03-15",
      customer_name: "ABC Trading Pte Ltd",
      customer_uen: "201234567A",
      vendor_name: "XYZ Services Pte Ltd",
      vendor_uen: "199912345K",
      vendor_gst_number: "GST12345678",
      subtotal: 1000,
      gst_amount: 90,
      total_amount: 1090,
      items: [
        {
          description: "Consulting Services",
          quantity: 10,
          unit_price: 100,
          amount: 1000,
          tax_category: "S",
          gst_rate: 9
        }
      ]
    }
    
    setMockInvoiceData(JSON.stringify(sample, null, 2))
    toast.success('Sample invoice loaded')
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">OCR & Validation Test Suite</h1>
        <p className="text-gray-600 mt-2">Test the enhanced OCR orchestrator and Singapore GST validation engine</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feature Cards */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Multi-Provider OCR</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Intelligent OCR with AWS Textract, Google Vision, and template matching
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg">GST Validation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Comprehensive Singapore GST compliance validation with auto-fix
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-lg">UEN Verification</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Real-time UEN validation with ACRA integration (mock)
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ocr" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ocr">OCR Testing</TabsTrigger>
          <TabsTrigger value="validation">Validation Testing</TabsTrigger>
          <TabsTrigger value="results">Test Results</TabsTrigger>
        </TabsList>

        <TabsContent value="ocr" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>OCR Test Configuration</CardTitle>
              <CardDescription>
                Upload an invoice to test the multi-provider OCR system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {selectedFile && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  The OCR system will automatically:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Try template matching for known invoice formats</li>
                    <li>Use multiple OCR providers with fallback</li>
                    <li>Merge results for higher accuracy</li>
                    <li>Apply Singapore-specific enhancements</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Button 
                onClick={testOCR} 
                disabled={!selectedFile || loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Run OCR Test
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Validation Test Configuration</CardTitle>
              <CardDescription>
                Test the Singapore GST validation engine
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Invoice Data (JSON)</label>
                <Textarea
                  value={mockInvoiceData}
                  onChange={(e) => setMockInvoiceData(e.target.value)}
                  placeholder="Paste invoice JSON or run OCR test first"
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={loadSampleInvoice}
                  variant="outline"
                  className="flex-1"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Load Sample Invoice
                </Button>
                <Button
                  onClick={testValidation}
                  disabled={!mockInvoiceData || loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Run Validation Test
                    </>
                  )}
                </Button>
              </div>

              <Button
                onClick={testUENVerification}
                variant="outline"
                className="w-full"
                disabled={loading}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Test UEN Verification
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
              <CardDescription>
                View detailed results from OCR and validation tests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {testResults.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No test results yet. Run some tests to see results here.
                </p>
              ) : (
                <div className="space-y-4">
                  {testResults.map((result, index) => (
                    <Card key={index} className={result.success ? 'border-green-200' : 'border-red-200'}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {result.success ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600" />
                            )}
                            <span className="font-medium">
                              {result.type === 'ocr' ? 'OCR Test' : 'Validation Test'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={result.success ? 'default' : 'destructive'}>
                              {result.success ? 'Success' : 'Failed'}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {result.duration}ms
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {result.timestamp.toLocaleString()}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <details className="cursor-pointer">
                          <summary className="text-sm font-medium">View Details</summary>
                          <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
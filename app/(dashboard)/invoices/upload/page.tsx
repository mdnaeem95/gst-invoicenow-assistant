'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadZone } from '@/components/invoice/upload-zone'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  ArrowLeft, 
  FileText, 
  AlertCircle, 
  CheckCircle,
  Upload,
  FileCheck,
  Loader2,
  X,
  Eye,
  Download,
  Info
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface ProcessingStep {
  id: string
  label: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  message?: string
}

export default function UploadPage() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([])
  const [processedInvoiceId, setProcessedInvoiceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  const initializeProcessingSteps = (): ProcessingStep[] => [
    { id: 'upload', label: 'Uploading file', status: 'pending' },
    { id: 'extract', label: 'Extracting invoice data', status: 'pending' },
    { id: 'validate', label: 'Validating information', status: 'pending' },
    { id: 'convert', label: 'Converting to InvoiceNow format', status: 'pending' },
    { id: 'save', label: 'Saving invoice', status: 'pending' }
  ]

  const updateStepStatus = (stepId: string, status: ProcessingStep['status'], message?: string) => {
    setProcessingSteps(prev => 
      prev.map(step => 
        step.id === stepId 
          ? { ...step, status, message }
          : step
      )
    )
  }

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file)
    setIsProcessing(true)
    setError(null)
    setProcessedInvoiceId(null)
    
    const steps = initializeProcessingSteps()
    setProcessingSteps(steps)

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Step 1: Upload
      updateStepStatus('upload', 'processing')
      await new Promise(resolve => setTimeout(resolve, 500)) // Simulate upload time
      updateStepStatus('upload', 'completed')

      // Step 2: Extract
      updateStepStatus('extract', 'processing')
      
      const response = await fetch('/api/invoices/process', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to process invoice')
      }

      updateStepStatus('extract', 'completed')

      // Step 3: Validate
      updateStepStatus('validate', 'processing')
      await new Promise(resolve => setTimeout(resolve, 300))
      updateStepStatus('validate', 'completed')

      // Step 4: Convert
      updateStepStatus('convert', 'processing')
      await new Promise(resolve => setTimeout(resolve, 300))
      updateStepStatus('convert', 'completed')

      // Step 5: Save
      updateStepStatus('save', 'processing')
      await new Promise(resolve => setTimeout(resolve, 300))
      updateStepStatus('save', 'completed')

      setProcessedInvoiceId(result.invoice.id)
      
      toast.success('Invoice processed successfully!', {
        description: `Invoice ${result.invoice.invoice_number} is ready`,
      })

      // Auto-redirect after 2 seconds
      setTimeout(() => {
        router.push(`/invoices/${result.invoice.id}`)
      }, 2000)

    } catch (error) {
      console.error('Upload error:', error)
      
      // Find the current processing step and mark it as error
      const currentStep = processingSteps.find(step => step.status === 'processing')
      if (currentStep) {
        updateStepStatus(currentStep.id, 'error', error instanceof Error ? error.message : 'Unknown error')
      }
      
      setError(error instanceof Error ? error.message : 'Failed to process invoice')
      toast.error('Failed to process invoice', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const resetUpload = () => {
    setUploadedFile(null)
    setProcessingSteps([])
    setProcessedInvoiceId(null)
    setError(null)
  }

  const completedSteps = processingSteps.filter(step => step.status === 'completed').length
  const totalSteps = processingSteps.length
  const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        
        <h1 className="text-3xl font-bold text-gray-900">Upload Invoice</h1>
        <p className="text-gray-600 mt-2">
          Convert your existing invoices to InvoiceNow format
        </p>
      </div>

      {/* Instructions */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="space-y-2">
          <p>Upload your invoice in PDF or Excel format. We'll automatically:</p>
          <ul className="list-disc list-inside ml-2 space-y-1 text-sm">
            <li>Extract invoice details using advanced OCR technology</li>
            <li>Validate GST calculations and compliance requirements</li>
            <li>Generate InvoiceNow XML format ready for submission</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Upload Zone or Processing View */}
      {!uploadedFile ? (
        <UploadZone onFileUpload={handleFileUpload} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Processing Invoice</span>
              {!isProcessing && (
                <Button variant="ghost" size="sm" onClick={resetUpload}>
                  <X className="h-4 w-4 mr-2" />
                  Upload Another
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Info */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="p-3 bg-white rounded-lg">
                <FileText className="h-6 w-6 text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{uploadedFile.name}</p>
                <p className="text-sm text-gray-500">
                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Processing...</span>
                  <span className="font-medium">{Math.round(progressPercentage)}%</span>
                </div>
                <Progress value={progressPercentage} className="h-2" />
              </div>
            )}

            {/* Processing Steps */}
            <div className="space-y-3">
              {processingSteps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                    step.status === 'completed' ? 'bg-green-50' :
                    step.status === 'processing' ? 'bg-blue-50' :
                    step.status === 'error' ? 'bg-red-50' :
                    'bg-gray-50'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {step.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : step.status === 'processing' ? (
                      <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                    ) : step.status === 'error' ? (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      step.status === 'completed' ? 'text-green-900' :
                      step.status === 'processing' ? 'text-blue-900' :
                      step.status === 'error' ? 'text-red-900' :
                      'text-gray-500'
                    }`}>
                      {step.label}
                    </p>
                    {step.message && (
                      <p className="text-xs text-red-600 mt-1">{step.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Success State */}
            {processedInvoiceId && !isProcessing && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-green-900">Invoice processed successfully!</p>
                    <p className="text-sm text-green-700 mt-1">
                      Your invoice has been converted to InvoiceNow format.
                    </p>
                    <div className="flex gap-3 mt-3">
                      <Link href={`/invoices/${processedInvoiceId}`}>
                        <Button size="sm" variant="default">
                          <Eye className="h-4 w-4 mr-2" />
                          View Invoice
                        </Button>
                      </Link>
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Download XML
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && !isProcessing && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Processing Error:</strong> {error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Supported Formats</CardTitle>
          <CardDescription>
            We support the following invoice formats
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <div className="p-2 bg-blue-100 rounded">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">PDF Invoices</p>
                <p className="text-sm text-gray-600 mt-1">
                  Standard PDF invoices with clear text. We use OCR to extract data automatically.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <div className="p-2 bg-green-100 rounded">
                <FileCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium">Excel Files</p>
                <p className="text-sm text-gray-600 mt-1">
                  XLSX or XLS files with structured invoice data for faster processing.
                </p>
              </div>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Tip:</strong> For best results, ensure your invoice includes:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Invoice Number and Date</li>
                <li>Customer Name and UEN</li>
                <li>Clear item descriptions with amounts</li>
                <li>GST breakdown and total amount</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
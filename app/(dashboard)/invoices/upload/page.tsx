'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadZone } from '@/components/invoice/upload-zone'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileText, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function UploadPage() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const router = useRouter()

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file)
    setIsProcessing(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/invoices/process', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        // Redirect to invoice details or list
        router.push(`/invoices/${result.invoice.id}`)
      } else {
        throw new Error(result.error || 'Failed to process invoice')
      }
    } catch (error) {
      console.error('Upload error:', error)
      // Show error to user
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
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
      <Alert className="mb-6">
        <FileText className="h-4 w-4" />
        <AlertDescription>
          Upload your invoice in PDF or Excel format. We'll automatically extract the data and convert it to InvoiceNow XML format.
        </AlertDescription>
      </Alert>

      {/* Upload Zone */}
      <UploadZone onFileUpload={handleFileUpload} />

      {/* Processing Status */}
      {isProcessing && uploadedFile && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Processing Invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              <div>
                <p className="font-medium">{uploadedFile.name}</p>
                <p className="text-sm text-gray-500">Extracting invoice data...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Supported Formats</CardTitle>
          <CardDescription>
            We support the following invoice formats
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 p-2 rounded">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium">PDF Invoices</p>
              <p className="text-sm text-gray-600">
                Standard PDF invoices with clear text. We'll use OCR to extract the data.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="bg-green-100 p-2 rounded">
              <FileText className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="font-medium">Excel Files</p>
              <p className="text-sm text-gray-600">
                XLSX or XLS files with structured invoice data.
              </p>
            </div>
          </div>

          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Tip:</strong> For best results, ensure your invoice includes: Invoice Number, Date, Customer Name/UEN, Item descriptions, GST amounts, and Total amount.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
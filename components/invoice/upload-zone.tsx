'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'


interface UploadZoneProps {
  onFileUpload: (file: File) => Promise<void>
}

export function UploadZone({ onFileUpload }: UploadZoneProps) {
  const [isUploading, setIsUploading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    setIsUploading(true)

    try {
      await onFileUpload(file)
      toast(
        'Success', {
            description: 'Invoice uploaded successfully',
        }
      )
    } catch (error) {
        toast.error(
            'Error', {
                description: 'Failed to upload invoice',
      })
    } finally {
      setIsUploading(false)
    }
  }, [onFileUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  return (
    <Card
      {...getRootProps()}
      className={`p-8 border-2 border-dashed cursor-pointer transition-colors
        ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} disabled={isUploading} />
      <div className="flex flex-col items-center justify-center space-y-4">
        {isUploading ? (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        ) : (
          <Upload className="h-12 w-12 text-gray-400" />
        )}
        <div className="text-center">
          <p className="text-lg font-medium">
            {isDragActive ? 'Drop your invoice here' : 'Drag & drop your invoice'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            or click to browse (PDF, Excel up to 10MB)
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <FileText className="h-4 w-4" />
          <span>Supported: PDF, XLSX, XLS</span>
        </div>
      </div>
    </Card>
  )
}
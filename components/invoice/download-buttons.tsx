'use client'

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface DownloadXMLButtonProps {
  xmlUrl: string
}

export function DownloadXMLButton({ xmlUrl }: DownloadXMLButtonProps) {
  const handleDownload = () => {
    window.open(xmlUrl, '_blank')
  }

  return (
    <Button variant="outline" onClick={handleDownload}>
      <Download className="h-4 w-4 mr-2" />
      Download XML
    </Button>
  )
}

interface DownloadOriginalButtonProps {
  fileUrl: string
}

export function DownloadOriginalButton({ fileUrl }: DownloadOriginalButtonProps) {
  const handleDownload = () => {
    window.open(fileUrl, '_blank')
  }

  return (
    <Button variant="outline" className="w-full justify-start" onClick={handleDownload}>
      <Download className="h-4 w-4 mr-2" />
      Download Original
    </Button>
  )
}
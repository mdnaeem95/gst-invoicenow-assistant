'use client'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Download } from 'lucide-react'

interface DownloadMenuItemProps {
  xmlUrl: string
}

export function DownloadMenuItem({ xmlUrl }: DownloadMenuItemProps) {
  const handleDownload = () => {
    window.open(xmlUrl, '_blank')
  }

  return (
    <DropdownMenuItem onClick={handleDownload}>
      <Download className="h-4 w-4 mr-2" />
      Download XML
    </DropdownMenuItem>
  )
}
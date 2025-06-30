'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Eye, Copy, Check, AlertCircle, X } from 'lucide-react'

interface XMLPreviewModalProps {
  xmlUrl?: string | null
  invoiceNumber: string
}

export function XMLPreviewModal({ xmlUrl, invoiceNumber }: XMLPreviewModalProps) {
  const [xmlContent, setXmlContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const loadXML = async () => {
    if (!xmlUrl) return
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(xmlUrl)
      
      if (!response.ok) {
        // Try to parse error response
        try {
          const errorData = await response.json()
          throw new Error(errorData.message || `Failed to load XML: ${response.statusText}`)
        } catch {
          throw new Error(`Failed to load XML: ${response.statusText}`)
        }
      }
      
      const text = await response.text()
      
      // Check if response is actually XML
      if (!text.trim().startsWith('<?xml') && !text.trim().startsWith('<')) {
        throw new Error('Invalid XML format received')
      }
      
      setXmlContent(text)
    } catch (error) {
      console.error('Failed to load XML:', error)
      setError(error instanceof Error ? error.message : 'Failed to load XML content')
      setXmlContent('')
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = () => {
    setIsOpen(true)
    loadXML()
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(xmlContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatXML = (xml: string) => {
    try {
      // Basic XML formatting for display
      let formatted = xml
      let indent = 0
      
      formatted = formatted.replace(/>\s*</g, '><') // Remove whitespace between tags
      formatted = formatted.replace(/(<[^\/][^>]*>)/g, (match) => {
        const result = '\n' + '  '.repeat(indent) + match
        if (!match.endsWith('/>')) {
          indent++
        }
        return result
      })
      formatted = formatted.replace(/(<\/[^>]+>)/g, (match) => {
        indent--
        return '\n' + '  '.repeat(indent) + match
      })
      
      return formatted.trim()
    } catch {
      return xml
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start" onClick={handleOpen}>
          <Eye className="h-4 w-4 mr-2" />
          Preview XML
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] p-0 overflow-hidden">
        <div className="flex flex-col h-full max-h-[90vh]">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DialogTitle>InvoiceNow XML Preview - {invoiceNumber}</DialogTitle>
                <DialogDescription>
                  This is the PEPPOL-compliant XML that will be submitted to InvoiceNow
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden px-6 py-4">
            <div className="relative h-full">
              {xmlContent && !error && (
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute right-0 top-0 z-10"
                  onClick={copyToClipboard}
                  disabled={!xmlContent || loading}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              )}
              
              <div className="h-full">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center h-full">
                    <Alert variant="destructive" className="max-w-md">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {error}
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : xmlContent ? (
                  <div className="relative h-full">
                    {xmlContent && !error && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute right-2 top-2 z-10"
                        onClick={copyToClipboard}
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </>
                        )}
                      </Button>
                    )}
                    <div 
                      className="h-full w-full rounded-md border bg-gray-50 dark:bg-gray-900 p-4"
                      style={{ overflow: 'auto' }}
                    >
                      <pre 
                        className="text-xs font-mono text-gray-800 dark:text-gray-200"
                        style={{ whiteSpace: 'pre', wordWrap: 'normal', overflowWrap: 'normal' }}
                      >
                        {formatXML(xmlContent)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    No XML content available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface DeleteInvoiceModalProps {
  invoiceId: string
  invoiceNumber: string
  variant?: 'default' | 'dropdown'
}

export function DeleteInvoiceModal({ invoiceId, invoiceNumber, variant = 'default' }: DeleteInvoiceModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setIsDeleting(true)
    
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        toast.success('Invoice deleted', {
          description: `Invoice ${invoiceNumber} has been deleted successfully`,
        })
        router.push('/invoices')
        router.refresh()
      } else {
        throw new Error(result.error || 'Failed to delete invoice')
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Failed to delete invoice', {
        description: error instanceof Error ? error.message : 'An error occurred',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const triggerButton = variant === 'dropdown' ? (
    <div className="flex items-center text-red-600 cursor-pointer w-full ml-2 text-s mt-1">
      <Trash2 className="h-4 w-4 mr-2" />
      Delete
    </div>
  ) : (
    <Button variant="destructive" size="sm" className='w-full justify-start'>
      <Trash2 className="h-4 w-4 mr-2" />
      Delete Invoice
    </Button>
  )

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {triggerButton}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete invoice <strong>{invoiceNumber}</strong>? 
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
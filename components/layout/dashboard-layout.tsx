import { ReactNode } from 'react'
import Link from 'next/link'
import { Home, FileText, Settings } from 'lucide-react'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-800">GST InvoiceNow</h1>
        </div>
        <nav className="mt-6">
          <Link href="/dashboard" className="flex items-center px-6 py-3 hover:bg-gray-100">
            <Home className="h-5 w-5 mr-3" />
            Dashboard
          </Link>
          <Link href="/invoices" className="flex items-center px-6 py-3 hover:bg-gray-100">
            <FileText className="h-5 w-5 mr-3" />
            Invoices
          </Link>
          <Link href="/settings" className="flex items-center px-6 py-3 hover:bg-gray-100">
            <Settings className="h-5 w-5 mr-3" />
            Settings
          </Link>
        </nav>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
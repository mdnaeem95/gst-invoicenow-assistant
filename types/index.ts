// Database Types
export interface Profile {
  id: string
  // Company information
  company_name: string
  company_uen: string
  company_address?: string
  gst_number?: string
  
  // Contact information
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  phone?: string
  website?: string
  address?: string
  postal_code?: string
  
  // Subscription information
  subscription_plan: 'starter' | 'professional' | 'business'
  subscription_status: 'trial' | 'active' | 'cancelled' | 'expired'
  trial_ends_at: string
  
  // Notification preferences
  email_notifications?: boolean
  invoice_processed?: boolean
  invoice_failed?: boolean
  weekly_summary?: boolean
  compliance_alerts?: boolean
  
  // Timestamps
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  user_id: string
  
  // Invoice details
  invoice_number: string
  invoice_date: string
  due_date?: string
  
  // Customer details
  customer_name: string
  customer_uen?: string
  customer_address?: string
  customer_email?: string
  customer_phone?: string
  
  // Vendor details
  vendor_name?: string
  vendor_uen?: string
  vendor_address?: string
  vendor_gst_number?: string
  
  // Financial details
  currency: string
  subtotal: number
  gst_amount: number
  total_amount: number
  
  // Status tracking
  status: 'draft' | 'processing' | 'submitted' | 'failed' | 'delivered'
  
  // PEPPOL/InvoiceNow details
  peppol_id?: string
  peppol_participant_id?: string
  submission_timestamp?: string
  delivery_timestamp?: string
  
  // File storage
  original_filename?: string
  original_file_url?: string
  converted_xml_url?: string
  
  // Processing metadata
  processing_started_at?: string
  processing_completed_at?: string
  processing_duration_ms?: number
  ocr_confidence_score?: number
  
  // Error tracking
  error_message?: string
  error_details?: any
  
  // Payment terms
  payment_terms?: string
  payment_method?: string
  
  // Additional metadata
  notes?: string
  metadata?: any
  
  // Timestamps
  created_at: string
  updated_at: string
  
  // Relations
  items?: InvoiceItem[]
  processing_logs?: ProcessingLog[]
  peppol_submissions?: PeppolSubmission[]
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  
  // Item details
  line_number: number
  description: string
  item_code?: string
  
  // Quantity and pricing
  quantity: number
  unit_of_measure: string
  unit_price: number
  discount_percentage?: number
  discount_amount?: number
  
  // Tax details
  tax_category: 'S' | 'Z' | 'E' // Standard, Zero-rated, Exempt
  gst_rate: number
  gst_amount: number
  
  // Totals
  line_amount: number // Before tax
  total_amount: number // After tax
  
  // Additional fields
  notes?: string
  metadata?: any
  
  created_at: string
  updated_at: string
}

export interface ProcessingLog {
  id: string
  invoice_id: string
  user_id: string
  
  action: 'upload' | 'ocr_start' | 'ocr_complete' | 'validation' | 'xml_generation' | 'submission'
  status: 'started' | 'completed' | 'failed'
  
  details?: any
  error_message?: string
  
  duration_ms?: number
  created_at: string
}

export interface PeppolSubmission {
  id: string
  invoice_id: string
  
  submission_id?: string
  participant_id?: string
  document_id?: string
  
  status: string
  submission_timestamp: string
  
  response_data?: any
  error_data?: any
  
  retry_count: number
  next_retry_at?: string
  
  created_at: string
  updated_at: string
}

// Form/Input Types
export interface CreateInvoiceInput {
  invoice_number: string
  invoice_date: string
  due_date?: string
  customer_name: string
  customer_uen?: string
  customer_address?: string
  customer_email?: string
  customer_phone?: string
  payment_terms?: string
  notes?: string
  items: CreateInvoiceItemInput[]
}

export interface CreateInvoiceItemInput {
  description: string
  item_code?: string
  quantity: number
  unit_price: number
  gst_rate?: number
  discount_percentage?: number
}

// API Response Types
export interface ConversionResult {
  success: boolean
  invoice?: Invoice
  xml?: string
  errors?: string[]
}

export interface ProcessingResult {
  success: boolean
  invoiceId?: string
  message?: string
  error?: string
  details?: any
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationWarning {
  field: string
  message: string
  code: string
}

// Enums
export enum InvoiceStatus {
  Draft = 'draft',
  Processing = 'processing',
  Submitted = 'submitted',
  Failed = 'failed',
  Delivered = 'delivered'
}

export enum TaxCategory {
  Standard = 'S',
  ZeroRated = 'Z',
  Exempt = 'E'
}

// Statistics Types
export interface InvoiceStatistics {
  total: number
  byStatus: Record<InvoiceStatus, number>
  totalAmount: number
  totalGST: number
  averageAmount: number
  processingSuccessRate: number
}

// Supabase Database Types
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile>
        Update: Partial<Profile>
      }
      invoices: {
        Row: Invoice
        Insert: Partial<Invoice>
        Update: Partial<Invoice>
      }
      invoice_items: {
        Row: InvoiceItem
        Insert: Partial<InvoiceItem>
        Update: Partial<InvoiceItem>
      }
      invoice_processing_logs: {
        Row: ProcessingLog
        Insert: Partial<ProcessingLog>
        Update: Partial<ProcessingLog>
      }
      peppol_submissions: {
        Row: PeppolSubmission
        Insert: Partial<PeppolSubmission>
        Update: Partial<PeppolSubmission>
      }
    }
  }
}

export interface AuthProfile {
  id: string
  company_name: string
  company_uen: string
  company_address?: string
  company_postal_code?: string
  gst_number?: string
  gst_registration_date?: string
  contact_name: string
  contact_email: string
  contact_phone?: string
  email_verified: boolean
  onboarding_completed: boolean
  onboarding_step: 'company_details' | 'gst_verification' | 'complete'
  subscription_plan: 'trial' | 'starter' | 'professional' | 'business'
  subscription_status: 'active' | 'cancelled' | 'expired' | 'suspended'
  trial_ends_at: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  notification_preferences: {
    email: boolean
    invoice_processed: boolean
    invoice_failed: boolean
    weekly_summary: boolean
    compliance_alerts: boolean
  }
  invoices_processed: number
  last_invoice_at?: string
  storage_used_mb: number
  created_at: string
  updated_at: string
  last_login_at?: string
}

export interface AuthUser extends AuthProfile {
  email_confirmed_at?: string
  user_metadata: {
    company_name?: string
    company_uen?: string
    gst_number?: string
    contact_name?: string
    full_name?: string
    onboarding_step?: string
  }
}
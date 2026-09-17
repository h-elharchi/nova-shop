export type Language = 'fr' | 'ar'

export interface Category {
  id: string
  name_fr: string
  name_ar: string
  slug: string
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductImage {
  id: string
  product_id: string
  image_url: string
  display_order: number
  created_at: string
}

export interface ProductVideo {
  id: string
  product_id: string
  video_url: string
  display_order: number
  created_at: string
}

export interface Product {
  id: string
  slug: string
  name_fr: string
  name_ar: string
  description_fr: string
  description_ar: string
  price: number
  old_price?: number | null
  category_id: string
  is_active: boolean
  is_featured: boolean
  is_new: boolean
  stock_available: boolean
  display_order: number
  created_at: string
  updated_at: string
  category?: Category
  images?: ProductImage[]
  videos?: ProductVideo[]
}

export type StaffRole = 'admin' | 'agent'

export interface AdminUser {
  id: string
  email: string
  role: 'admin' | 'agent' | 'user'
}

export interface StaffProfile {
  id: string
  email: string
  role: StaffRole
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

export interface ProductFilters {
  categorySlug?: string
  search?: string
  sortByPrice?: 'asc' | 'desc'
  onlyAvailable?: boolean
}

// ─── Client ───────────────────────────────────────────────────

export type OrderChannel = 'site' | 'whatsapp' | 'email' | 'chat' | 'phone'

export interface Customer {
  id: string
  phone: string
  first_name: string
  last_name: string
  email: string | null
  notes: string | null
  source: OrderChannel
  created_at: string
  updated_at: string
}

// Re-export des types étendus depuis interactions.ts pour backward compat
export type { CustomerV2, CustomerView, CustomerAddress, CustomerStatus } from './interactions'

// ─── Commandes ────────────────────────────────────────────────

export type OrderStatus =
  | 'new'
  | 'assigned'
  | 'contacted'
  | 'unreachable'
  | 'callback'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'on_hold'

export interface Order {
  id: string
  product_id: string
  product_name: string
  product_price: number
  customer_first_name: string
  customer_last_name: string
  customer_phone: string
  customer_id: string | null
  channel: OrderChannel
  assigned_agent_id: string | null
  notes: string | null
  callback_at: string | null
  status: OrderStatus
  created_at: string
  updated_at: string
  product?: Pick<Product, 'id' | 'slug' | 'name_fr' | 'name_ar' | 'images'>
  customer?: Pick<Customer, 'id' | 'first_name' | 'last_name' | 'email'>
}

// ─── Email ────────────────────────────────────────────────────

export interface EmailAccount {
  id: string
  label: string
  gmail_address: string
  is_active: boolean
  last_sync_at: string | null
  created_at: string
}

export type EmailStatus = 'new' | 'read' | 'replied' | 'archived'
export type EmailDirection = 'in' | 'out'

export interface EmailMessage {
  id: string
  email_account_id: string
  gmail_message_id: string
  gmail_thread_id: string
  subject: string | null
  from_address: string
  to_address: string
  body_text: string | null
  body_html: string | null
  direction: EmailDirection
  status: EmailStatus
  customer_id: string | null
  order_id: string | null
  received_at: string
  created_at: string
  // Champs joints (depuis email_messages_view)
  account_label?: string
  account_gmail_address?: string
  customer_first_name?: string | null
  customer_last_name?: string | null
  customer_phone?: string | null
}

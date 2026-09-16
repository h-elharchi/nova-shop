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

export type OrderStatus = 'new' | 'contacted' | 'confirmed' | 'cancelled' | 'completed'

export interface Order {
  id: string
  product_id: string
  product_name: string
  product_price: number
  customer_first_name: string
  customer_last_name: string
  customer_phone: string
  status: OrderStatus
  created_at: string
  updated_at: string
  product?: Pick<Product, 'id' | 'slug' | 'name_fr' | 'name_ar' | 'images'>
}

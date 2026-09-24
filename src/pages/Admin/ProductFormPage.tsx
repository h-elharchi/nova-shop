import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Upload, X, ArrowLeft, Play } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../context/LanguageContext'
import { useCategories } from '../../hooks/useCategories'
import { flattenCategoryTree, categoryOptionLabel } from '../../lib/categories'
import { AdminLayout } from './AdminLayout'
import type { Product, ProductImage, ProductVideo } from '../../types'

interface ProductForm {
  name_fr: string
  name_ar: string
  description_fr: string
  description_ar: string
  price: string
  old_price: string
  category_id: string
  is_active: boolean
  is_featured: boolean
  is_new: boolean
  stock_available: boolean
  display_order: string
  slug: string
}

const emptyForm: ProductForm = {
  name_fr: '', name_ar: '', description_fr: '', description_ar: '',
  price: '', old_price: '', category_id: '', is_active: true,
  is_featured: false, is_new: false, stock_available: true, display_order: '0', slug: '',
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function ProductFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { t } = useI18n()
  const { categories } = useCategories()
  const navigate = useNavigate()

  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [existingImages, setExistingImages] = useState<ProductImage[]>([])
  const [existingVideos, setExistingVideos] = useState<ProductVideo[]>([])
  const [newImages, setNewImages] = useState<File[]>([])
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])
  const [newVideos, setNewVideos] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit || !id) return
    setLoading(true)
    supabase
      .from('products')
      .select('*, images:product_images(*), videos:product_videos(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          const p = data as Product & { images: ProductImage[]; videos: ProductVideo[] }
          setForm({
            name_fr: p.name_fr, name_ar: p.name_ar,
            description_fr: p.description_fr, description_ar: p.description_ar,
            price: String(p.price), old_price: p.old_price ? String(p.old_price) : '',
            category_id: p.category_id, is_active: p.is_active, is_featured: p.is_featured,
            is_new: p.is_new, stock_available: p.stock_available,
            display_order: String(p.display_order), slug: p.slug,
          })
          setExistingImages(p.images ?? [])
          setExistingVideos(p.videos ?? [])
        }
        setLoading(false)
      })
  }, [id, isEdit])

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'name_fr' && !isEdit ? { slug: slugify(value) } : {}),
    }))
  }

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setNewImages(prev => [...prev, ...files])
    setNewImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  const handleVideoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setNewVideos(prev => [...prev, ...files])
  }

  const removeNewImage = (index: number) => {
    setNewImages(prev => prev.filter((_, i) => i !== index))
    setNewImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const removeNewVideo = (index: number) => {
    setNewVideos(prev => prev.filter((_, i) => i !== index))
  }

  const removeExistingImage = async (img: ProductImage) => {
    await supabase.from('product_images').delete().eq('id', img.id)
    setExistingImages(prev => prev.filter(i => i.id !== img.id))
  }

  const removeExistingVideo = async (vid: ProductVideo) => {
    await supabase.from('product_videos').delete().eq('id', vid.id)
    setExistingVideos(prev => prev.filter(v => v.id !== vid.id))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      name_fr: form.name_fr, name_ar: form.name_ar,
      description_fr: form.description_fr, description_ar: form.description_ar,
      price: parseFloat(form.price), old_price: form.old_price ? parseFloat(form.old_price) : null,
      category_id: form.category_id, is_active: form.is_active, is_featured: form.is_featured,
      is_new: form.is_new, stock_available: form.stock_available,
      display_order: parseInt(form.display_order, 10) || 0, slug: form.slug,
    }

    let productId = id
    if (isEdit && id) {
      const { error: err } = await supabase.from('products').update(payload).eq('id', id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('products').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      productId = (data as Product).id
    }

    // Upload images
    const uploadErrors: string[] = []
    for (let i = 0; i < newImages.length; i++) {
      const file = newImages[i]
      const ext = file.name.split('.').pop()
      const path = `${productId}/${Date.now()}-${i}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true })
      if (upErr) {
        uploadErrors.push(`Image ${i + 1}: ${upErr.message}`)
      } else {
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
        await supabase.from('product_images').insert({
          product_id: productId,
          image_url: urlData.publicUrl,
          display_order: existingImages.length + i,
        })
      }
    }

    // Upload vidéos
    for (let i = 0; i < newVideos.length; i++) {
      const file = newVideos[i]
      const ext = file.name.split('.').pop()
      const path = `${productId}/${Date.now()}-video-${i}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('product-videos')
        .upload(path, file, { upsert: true })
      if (upErr) {
        uploadErrors.push(`Vidéo ${i + 1}: ${upErr.message}`)
      } else {
        const { data: urlData } = supabase.storage.from('product-videos').getPublicUrl(path)
        await supabase.from('product_videos').insert({
          product_id: productId,
          video_url: urlData.publicUrl,
          display_order: existingVideos.length + i,
        })
      }
    }

    if (uploadErrors.length > 0) {
      setError(`Erreur upload : ${uploadErrors.join(' | ')}`)
      setSaving(false)
      return
    }

    setSaving(false)
    navigate('/admin/products')
  }

  if (loading) return (
    <AdminLayout>
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </AdminLayout>
  )

  const inputCls = "w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"

  return (
    <AdminLayout>
      <div className="max-w-3xl">
        <button onClick={() => navigate('/admin/products')} className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t('product.back_to_products')}
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          {isEdit ? t('forms.edit') : t('admin.add_product')}
        </h1>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informations */}
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6 space-y-4 transition-colors duration-200">
            <h2 className="font-semibold text-gray-900 dark:text-white">Informations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.name_fr')}</label>
                <input name="name_fr" value={form.name_fr} onChange={handleChange} required className={inputCls} />
              </div>
              <div dir="rtl">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.name_ar')}</label>
                <input name="name_ar" value={form.name_ar} onChange={handleChange} required className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.slug')}</label>
              <input name="slug" value={form.slug} onChange={handleChange} required className={`${inputCls} font-mono`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.description_fr')}</label>
                <textarea name="description_fr" value={form.description_fr} onChange={handleChange} rows={4}
                  className={`${inputCls} resize-none`} />
              </div>
              <div dir="rtl">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.description_ar')}</label>
                <textarea name="description_ar" value={form.description_ar} onChange={handleChange} rows={4}
                  className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>

          {/* Prix & Catégorie */}
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6 space-y-4 transition-colors duration-200">
            <h2 className="font-semibold text-gray-900 dark:text-white">Prix & Catégorie</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.price')}</label>
                <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={handleChange} required className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.old_price')}</label>
                <input name="old_price" type="number" min="0" step="0.01" value={form.old_price} onChange={handleChange} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.display_order')}</label>
                <input name="display_order" type="number" value={form.display_order} onChange={handleChange} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.category')}</label>
              <select name="category_id" value={form.category_id} onChange={handleChange} required className={inputCls}>
                <option value="">{t('forms.select_category')}</option>
                {flattenCategoryTree(categories).map(c => (
                  <option key={c.id} value={c.id}>{categoryOptionLabel(c, 'both')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Options */}
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6 space-y-3 transition-colors duration-200">
            <h2 className="font-semibold text-gray-900 dark:text-white">Options</h2>
            {[
              { name: 'is_active', label: t('forms.is_active') },
              { name: 'is_featured', label: t('forms.is_featured') },
              { name: 'is_new', label: t('forms.is_new') },
              { name: 'stock_available', label: t('forms.stock_available') },
            ].map(opt => (
              <label key={opt.name} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name={opt.name}
                  checked={form[opt.name as keyof ProductForm] as boolean}
                  onChange={handleChange} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
              </label>
            ))}
          </div>

          {/* Images */}
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6 space-y-4 transition-colors duration-200">
            <h2 className="font-semibold text-gray-900 dark:text-white">Photos</h2>

            {existingImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {existingImages.map(img => (
                  <div key={img.id} className="relative group w-20 h-20">
                    <img src={img.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                    <button type="button" onClick={() => removeExistingImage(img)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {newImagePreviews.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {newImagePreviews.map((src, i) => (
                  <div key={i} className="relative group w-20 h-20">
                    <img src={src} alt="" className="w-full h-full object-cover rounded-lg border-2 border-blue-300" />
                    <button type="button" onClick={() => removeNewImage(i)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
              <Upload className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Ajouter des photos (JPG, PNG, WebP)</span>
              <input type="file" accept="image/*" multiple onChange={handleImageChange} className="hidden" />
            </label>
          </div>

          {/* Vidéos */}
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6 space-y-4 transition-colors duration-200">
            <h2 className="font-semibold text-gray-900 dark:text-white">Vidéos</h2>

            {existingVideos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {existingVideos.map(vid => (
                  <div key={vid.id} className="relative group w-28 h-20 bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
                    <Play className="w-8 h-8 text-white/80" fill="white" />
                    <button type="button" onClick={() => removeExistingVideo(vid)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-1 left-1 text-white text-xs bg-black/50 px-1 rounded">
                      Vidéo
                    </div>
                  </div>
                ))}
              </div>
            )}

            {newVideos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {newVideos.map((file, i) => (
                  <div key={i} className="relative group w-28 h-20 bg-blue-800 rounded-lg flex items-center justify-center border-2 border-blue-400">
                    <Play className="w-8 h-8 text-white/80" fill="white" />
                    <button type="button" onClick={() => removeNewVideo(i)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-1 left-1 text-white text-xs bg-black/50 px-1 rounded truncate max-w-[80px]">
                      {file.name}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
              <Play className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Ajouter des vidéos (MP4, MOV, WebM)</span>
              <input type="file" accept="video/*" multiple onChange={handleVideoChange} className="hidden" />
            </label>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              Les vidéos sont stockées dans Supabase Storage. Taille max recommandée : 50 MB par vidéo.
            </p>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => navigate('/admin/products')}
              className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm transition-colors">
              {t('forms.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm">
              {saving ? t('common.loading') : t('forms.save')}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}

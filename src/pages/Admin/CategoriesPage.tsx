import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { PlusCircle, Pencil, Trash2, X, ChevronUp, ChevronDown, Upload, ImageOff, CornerDownRight, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../context/LanguageContext'
import { loadCategories, flattenCategoryTree, categoryOptionLabel, getChildren, getTopLevel, getDescendantIds, parentIdsOf } from '../../lib/categories'
import { AdminLayout } from './AdminLayout'
import type { Category } from '../../types'

interface CategoryForm {
  name_fr: string
  name_ar: string
  slug: string
  image_url: string
  is_active: boolean
  parent_ids: string[]
  show_at_root: boolean
}

const empty: CategoryForm = { name_fr: '', name_ar: '', slug: '', image_url: '', is_active: true, parent_ids: [], show_at_root: false }

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function AdminCategoriesPage() {
  const { t, lang } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryForm>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [newImage, setNewImage] = useState<File | null>(null)
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [formError, setFormError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const fetchCategories = async () => {
    setLoading(true)
    const { data } = await loadCategories(false)
    setCategories(data)
    setLoading(false)
  }

  useEffect(() => { fetchCategories() }, [])

  // Les flèches réordonnent parmi les catégories de même niveau : celles du premier niveau
  // (categories.display_order) ou celles d'un même parent (category_parents.display_order).
  // `parentId` est le parent sous lequel la ligne est affichée (null = premier niveau).
  const siblingsUnder = (parentId: string | null) =>
    parentId ? getChildren(categories, parentId) : getTopLevel(categories)

  const moveCategory = async (id: string, parentId: string | null, direction: 'up' | 'down') => {
    if (reordering) return
    const siblings = siblingsUnder(parentId)
    const idx = siblings.findIndex(c => c.id === id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || targetIdx < 0 || targetIdx >= siblings.length) return

    // Renumérote les frères selon l'ordre visuel actuel puis échange les deux positions
    const order = siblings.map((c, i) => ({ id: c.id, position: i }))
    const tmp = order[idx].position
    order[idx].position = order[targetIdx].position
    order[targetIdx].position = tmp
    const newOrder = new Map(order.map(o => [o.id, o.position]))

    setCategories(prev => prev.map(c => {
      const pos = newOrder.get(c.id)
      if (pos === undefined) return c
      if (!parentId) return { ...c, display_order: pos }
      return { ...c, parent_links: c.parent_links.map(l => l.parent_id === parentId ? { ...l, display_order: pos } : l) }
    }))
    setReordering(true)
    await Promise.all(
      order.map(o => parentId
        ? supabase.from('category_parents').update({ display_order: o.position }).eq('category_id', o.id).eq('parent_id', parentId)
        : supabase.from('categories').update({ display_order: o.position }).eq('id', o.id))
    )
    setReordering(false)
  }

  const resetImageState = () => {
    setNewImage(null)
    setNewImagePreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setUploadError('')
    setFormError('')
  }

  const openNew = (parentId?: string) => {
    setEditing(null)
    setForm({ ...empty, parent_ids: parentId ? [parentId] : [] })
    resetImageState()
    setShowForm(true)
  }
  const openEdit = (cat: Category) => {
    setEditing(cat)
    setForm({
      name_fr: cat.name_fr, name_ar: cat.name_ar, slug: cat.slug, image_url: cat.image_url ?? '',
      is_active: cat.is_active, parent_ids: parentIdsOf(cat), show_at_root: cat.show_at_root,
    })
    resetImageState()
    setShowForm(true)
  }

  // Parents possibles : toute catégorie sauf elle-même et ses propres sous-catégories (pas de cycle).
  const forbiddenParents = editing ? getDescendantIds(categories, editing.id) : new Set<string>()
  const parentOptions = flattenCategoryTree(categories, true).filter(c => !forbiddenParents.has(c.id))

  const toggleParent = (id: string) => {
    setForm(prev => ({
      ...prev,
      parent_ids: prev.parent_ids.includes(id) ? prev.parent_ids.filter(p => p !== id) : [...prev.parent_ids, id],
    }))
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'name_fr' && !editing ? { slug: slugify(value) } : {}),
    }))
  }

  const handleImageFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNewImagePreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
    setNewImage(file)
    setUploadError('')
  }

  const handleRemoveImage = () => {
    resetImageState()
    setForm(prev => ({ ...prev, image_url: '' }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setUploadError('')

    let imageUrl = form.image_url || null

    if (newImage) {
      const ext = newImage.name.split('.').pop()
      const path = `${form.slug || 'categorie'}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('category-images')
        .upload(path, newImage, { upsert: true })
      if (upErr) {
        setUploadError(`Erreur upload : ${upErr.message}`)
        setSaving(false)
        return
      }
      const { data: urlData } = supabase.storage.from('category-images').getPublicUrl(path)
      imageUrl = urlData.publicUrl
    }

    const { parent_ids, ...fields } = form
    const payload = { ...fields, image_url: imageUrl, show_at_root: parent_ids.length > 0 && form.show_at_root }

    let categoryId = editing?.id
    if (editing) {
      const { error: saveErr } = await supabase.from('categories').update(payload).eq('id', editing.id)
      if (saveErr) {
        setFormError(saveErr.message)
        setSaving(false)
        return
      }
    } else {
      const { data: created, error: saveErr } = await supabase
        .from('categories')
        .insert({ ...payload, display_order: getTopLevel(categories).length })
        .select('id')
        .single()
      if (saveErr || !created) {
        setFormError(saveErr?.message ?? '')
        setSaving(false)
        return
      }
      categoryId = created.id as string
    }

    // Synchronise les liens de parenté : retire les décochés, ajoute les nouveaux en fin de liste.
    const current = editing ? parentIdsOf(editing) : []
    const toRemove = current.filter(p => !parent_ids.includes(p))
    const toAdd = parent_ids.filter(p => !current.includes(p))
    if (toRemove.length > 0) {
      const { error: delErr } = await supabase.from('category_parents').delete().eq('category_id', categoryId!).in('parent_id', toRemove)
      if (delErr) {
        setFormError(delErr.message)
        setSaving(false)
        return
      }
    }
    if (toAdd.length > 0) {
      const { error: linkErr } = await supabase.from('category_parents').insert(
        toAdd.map(p => ({ category_id: categoryId!, parent_id: p, display_order: getChildren(categories, p).length }))
      )
      if (linkErr) {
        setFormError(linkErr.message)
        setSaving(false)
        fetchCategories()
        return
      }
    }
    setSaving(false)
    setShowForm(false)
    resetImageState()
    fetchCategories()
  }

  const openDelete = (id: string) => { setDeleteError(''); setDeleteId(id) }

  const handleDelete = async (id: string) => {
    const { error: delErr } = await supabase.from('categories').delete().eq('id', id)
    if (delErr) {
      setDeleteError(delErr.message)
      return
    }
    setCategories(prev => prev.filter(c => c.id !== id))
    setDeleteId(null)
  }

  const deleteHasChildren = deleteId ? getChildren(categories, deleteId).length > 0 : false
  const tree = flattenCategoryTree(categories)

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.categories')}</h1>
        <button onClick={() => openNew()}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">
          <PlusCircle className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden transition-colors duration-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-4 py-3 text-left">Ordre</th>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-left">Slug</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
              {tree.map(cat => {
                // Parent sous lequel cette ligne est affichée (null = premier niveau).
                const keys = cat.treeKey.split('>')
                const rowParentId = keys.length > 1 ? keys[keys.length - 2] : null
                const siblings = siblingsUnder(rowParentId)
                const pos = siblings.findIndex(c => c.id === cat.id)
                const indent = { paddingLeft: `${cat.depth * 20}px` }
                return (
                <tr key={cat.treeKey} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${cat.depth > 0 ? 'bg-gray-50/50 dark:bg-gray-800/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" style={indent}>
                      <button
                        type="button"
                        onClick={() => moveCategory(cat.id, rowParentId, 'up')}
                        disabled={pos === 0 || reordering}
                        title="Monter"
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCategory(cat.id, rowParentId, 'down')}
                        disabled={pos === siblings.length - 1 || reordering}
                        title="Descendre"
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5" style={indent}>
                      {cat.depth > 0 && <CornerDownRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />}
                      {cat.image_url ? (
                        <img src={cat.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                          <ImageOff className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{lang === 'ar' ? cat.name_ar : cat.name_fr}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{lang === 'ar' ? cat.name_fr : cat.name_ar}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{cat.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cat.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                      {cat.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openNew(cat.id)} title={t('forms.add_subcategory')}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(cat)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => openDelete(cat.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          {categories.length === 0 && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">{t('common.no_categories')}</div>
          )}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl transition-colors duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">{editing ? t('forms.edit') : form.parent_ids.length > 0 ? t('forms.new_subcategory') : 'Nouvelle catégorie'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.parent_category')}</label>
                <div className="max-h-44 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                  {parentOptions.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <input
                        type="checkbox"
                        checked={form.parent_ids.includes(p.id)}
                        onChange={() => toggleParent(p.id)}
                        className="w-4 h-4 text-blue-600 rounded shrink-0"
                      />
                      <span className="truncate">{categoryOptionLabel(p, 'both')}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('forms.parent_hint')}</p>
                {form.parent_ids.length > 0 && (
                  <label className="flex items-center gap-2 mt-2">
                    <input type="checkbox" checked={form.show_at_root}
                      onChange={e => setForm(prev => ({ ...prev, show_at_root: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t('forms.show_at_root')}</span>
                  </label>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.name_fr')}</label>
                <input name="name_fr" value={form.name_fr} onChange={handleChange} required
                  className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
              </div>
              <div dir="rtl">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.name_ar')}</label>
                <input name="name_ar" value={form.name_ar} onChange={handleChange} required
                  className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.slug')}</label>
                <input name="slug" value={form.slug} onChange={handleChange} required
                  className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('forms.category_image')}</label>
                <div className="flex items-center gap-3">
                  {newImagePreview || form.image_url ? (
                    <img
                      src={newImagePreview || form.image_url}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-300 dark:text-gray-600 shrink-0">
                      <ImageOff className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      {t('forms.category_image_upload')}
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />
                    </label>
                    {(newImagePreview || form.image_url) && (
                      <button type="button" onClick={handleRemoveImage}
                        className="text-xs text-red-500 hover:underline">
                        {t('forms.category_image_remove')}
                      </button>
                    )}
                  </div>
                </div>
                {uploadError && <p className="text-xs text-red-500 mt-1.5">{uploadError}</p>}
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('forms.is_active')}</span>
              </label>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">{t('forms.cancel')}</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 dark:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors">{saving ? '...' : t('forms.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl p-6 max-w-sm w-full shadow-xl transition-colors duration-200">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t('forms.confirm_delete')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              {deleteHasChildren ? t('forms.delete_has_subcategories') : t('forms.confirm_delete_msg')}
            </p>
            {deleteError && <p className="text-xs text-red-500 mb-4">{deleteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">{t('forms.cancel')}</button>
              <button onClick={() => handleDelete(deleteId)} disabled={deleteHasChildren} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:pointer-events-none">{t('forms.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

import * as XLSX from 'xlsx'
import type { Order, OrderStatus } from '../types'
import type { ConversationHistoryItem } from '../types/chat'

const STATUS_LABELS: Record<string, Partial<Record<OrderStatus, string>>> = {
  fr: {
    new: 'Nouvelle', assigned: 'Assignée', contacted: 'Contactée', unreachable: 'Injoignable',
    callback: 'Rappel', confirmed: 'Confirmée', processing: 'En préparation', shipped: 'Expédiée',
    delivered: 'Livrée', returned: 'Retournée', cancelled: 'Annulée', on_hold: 'En attente',
  },
  ar: {
    new: 'جديدة', assigned: 'معينة', contacted: 'تم التواصل', unreachable: 'غير متاح',
    callback: 'معاودة', confirmed: 'مؤكدة', processing: 'قيد التحضير', shipped: 'تم الشحن',
    delivered: 'تم التوصيل', returned: 'مرجعة', cancelled: 'ملغاة', on_hold: 'في الانتظار',
  },
}

function statusLabel(status: OrderStatus, lang: string): string {
  return STATUS_LABELS[lang]?.[status] ?? status
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export interface ExportHeaders {
  id: string
  date: string
  product: string
  price: string
  firstname: string
  lastname: string
  phone: string
  email: string
  city: string
  address: string
  status: string
}

export function exportOrdersToExcel(
  orders: Order[],
  headers: ExportHeaders,
  lang: string,
  filename: string
): void {
  const headerRow = [
    headers.id,
    headers.date,
    headers.product,
    headers.price,
    headers.firstname,
    headers.lastname,
    headers.phone,
    headers.email,
    headers.city,
    headers.address,
    headers.status,
  ]

  const dataRows = orders.map(o => [
    o.id,
    formatDate(o.created_at),
    o.product_name,
    o.product_price,
    o.customer_first_name,
    o.customer_last_name,
    o.customer_phone,
    o.customer_email ?? '',
    o.delivery_city ?? '',
    o.delivery_address ?? '',
    statusLabel(o.status, lang),
  ])

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])

  // Column widths
  ws['!cols'] = [
    { wch: 38 }, // ID
    { wch: 12 }, // Date
    { wch: 30 }, // Product
    { wch: 10 }, // Price
    { wch: 15 }, // Firstname
    { wch: 15 }, // Lastname
    { wch: 16 }, // Phone
    { wch: 22 }, // Email
    { wch: 18 }, // City
    { wch: 30 }, // Address
    { wch: 15 }, // Status
  ]

  // Auto-filter on header row
  if (ws['!ref']) {
    ws['!autofilter'] = { ref: ws['!ref'] }
  }

  // Freeze first row
  if (!ws['!views']) ws['!views'] = []
  ws['!views'].push({ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2', sqref: 'A2' })

  // Force phone column (col 6, index G) as text to prevent Excel auto-converting
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
  if (range) {
    for (let r = 1; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 6 })
      const cell = ws[addr]
      if (cell) {
        cell.t = 's'
        cell.z = '@'
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Commandes')

  // Browser download
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export interface ConvExportHeaders {
  date: string
  client: string
  phone: string
  status: string
  agent: string
  disposition: string
  wait_seconds: string
  duration_seconds: string
  notes: string
}

function fmtSeconds(s: number | null | undefined): string {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export function exportConversationsToExcel(
  rows: ConversationHistoryItem[],
  headers: ConvExportHeaders,
  filename: string
): void {
  const headerRow = [
    headers.date,
    headers.client,
    headers.phone,
    headers.status,
    headers.agent,
    headers.disposition,
    headers.wait_seconds,
    headers.duration_seconds,
    headers.notes,
  ]

  const dataRows = rows.map(r => {
    const waitSecs = r.assigned_at && r.created_at
      ? Math.round((new Date(r.assigned_at).getTime() - new Date(r.created_at).getTime()) / 1000)
      : null
    return [
      formatDate(r.created_at),
      `${r.customer_first_name} ${r.customer_last_name}`.trim(),
      r.customer_phone,
      r.status,
      r.agent_first_name ? `${r.agent_first_name} ${r.agent_last_name ?? ''}`.trim() : '',
      r.disposition_code ?? '',
      fmtSeconds(waitSecs),
      fmtSeconds(r.wrap_up_seconds),
      r.internal_notes ?? '',
    ]
  })

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
  ws['!cols'] = [
    { wch: 12 }, // date
    { wch: 22 }, // client
    { wch: 16 }, // phone
    { wch: 12 }, // status
    { wch: 22 }, // agent
    { wch: 16 }, // disposition
    { wch: 12 }, // wait
    { wch: 12 }, // duration
    { wch: 40 }, // notes
  ]
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] }
  if (!ws['!views']) ws['!views'] = []
  ws['!views'].push({ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2', sqref: 'A2' })

  // Phone column (col 2) as text
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
  if (range) {
    for (let row = 1; row <= range.e.r; row++) {
      const addr = XLSX.utils.encode_cell({ r: row, c: 2 })
      const cell = ws[addr]
      if (cell) { cell.t = 's'; cell.z = '@' }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Conversations')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

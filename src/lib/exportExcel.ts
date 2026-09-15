import * as XLSX from 'xlsx'
import type { Order, OrderStatus } from '../types'

const STATUS_LABELS: Record<string, Record<OrderStatus, string>> = {
  fr: { new: 'Nouvelle', contacted: 'Contactée', confirmed: 'Confirmée', cancelled: 'Annulée', completed: 'Terminée' },
  ar: { new: 'جديدة', contacted: 'تم التواصل', confirmed: 'مؤكدة', cancelled: 'ملغاة', completed: 'مكتملة' },
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

import { api } from "../../shared/api/client"

export type InvoiceBucket = "issued" | "overdue" | "paid" | "deleted"

export type InvoiceRow = {
  id: string
  conversation_id: string
  message_id: string
  client_id: string
  client_name: string
  amount: string
  currency: string
  period: string | null
  description: string
  status: "pending" | "succeeded" | "canceled"
  pay_url: string | null
  test: boolean
  expires_at: string | null
  created_at: string
  paid_at: string | null
  deleted_at: string | null
  bucket: InvoiceBucket
  orphan?: boolean
}

export type InvoiceTemplate = {
  id: string
  title: string
  body: string
  created_at: string
  updated_at: string
}

export type InvoiceListDump = {
  http_status: number
  ok: boolean
  items: InvoiceRow[]
  raw: unknown
}

function invoiceItems(raw: unknown): InvoiceRow[] {
  if (Array.isArray(raw)) return raw as InvoiceRow[]
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: InvoiceRow[] }).items
  }
  return []
}

export async function loadInvoices(bucket: InvoiceBucket): Promise<InvoiceListDump> {
  const response = await fetch(`/api/invoices?bucket=${encodeURIComponent(bucket)}`, { credentials: "include" })
  if (response.status === 401) {
    window.dispatchEvent(new Event("bchat:unauthorized"))
  }
  const text = await response.text()
  let raw: unknown = text
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    raw = text
  }
  return {
    http_status: response.status,
    ok: response.ok,
    items: response.ok ? invoiceItems(raw) : [],
    raw,
  }
}

export function createInvoice(payload: {
  conversation_id: string
  amount: string
  period?: string
  template_id?: string
  days?: number
}) {
  return api("/api/invoices", { method: "POST", json: payload })
}

export function hideInvoice(id: string) {
  return api<InvoiceRow>(`/api/invoices/${id}`, { method: "DELETE" })
}

export function loadTemplates() {
  return api<InvoiceTemplate[]>("/api/invoice-templates")
}

export function createTemplate(title: string, body: string) {
  return api<InvoiceTemplate>("/api/invoice-templates", { method: "POST", json: { title, body } })
}

export function updateTemplate(id: string, payload: { title?: string; body?: string }) {
  return api<InvoiceTemplate>(`/api/invoice-templates/${id}`, { method: "PATCH", json: payload })
}

export function deleteTemplate(id: string) {
  return api(`/api/invoice-templates/${id}`, { method: "DELETE" })
}

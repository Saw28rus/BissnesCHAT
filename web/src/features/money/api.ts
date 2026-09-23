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
}

export type InvoiceTemplate = {
  id: string
  title: string
  body: string
  created_at: string
  updated_at: string
}

export function loadInvoices(bucket: InvoiceBucket) {
  return api<InvoiceRow[]>(`/api/invoices?bucket=${bucket}`)
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

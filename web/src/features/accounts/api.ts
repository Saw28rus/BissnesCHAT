import { api } from "../../shared/api/client"

export type AccountCard = {
  id: string
  login: string
  display_name: string
  phone: string | null
  inn: string | null
  edo_id: string | null
  status: "active" | "blocked"
  note: string | null
  created_at: string
  conversation_id: string | null
  last_seen_at: string | null
  last_message_at: string | null
  preview: string | null
}

type AccountPayload = {
  display_name: string
  login: string
  phone?: string
  inn?: string
  edo_id?: string
  note?: string
}

export function loadAccounts(query: string) {
  return api<AccountCard[]>(`/api/accounts?q=${encodeURIComponent(query)}`)
}

export function createAccount(payload: AccountPayload & { password: string }) {
  return api<{ id: string; conversation_id: string }>("/api/accounts", { method: "POST", json: payload })
}

export function updateAccount(id: string, payload: Partial<AccountPayload>) {
  return api(`/api/accounts/${id}`, { method: "PATCH", json: payload })
}

export function changeClientPassword(id: string, password: string) {
  return api(`/api/accounts/${id}/password`, { method: "POST", json: { password } })
}

export function revokeSessions(id: string) {
  return api(`/api/accounts/${id}/sessions/revoke`, { method: "POST" })
}

export function blockAccount(id: string) {
  return api(`/api/accounts/${id}/block`, { method: "POST" })
}

export function unblockAccount(id: string) {
  return api(`/api/accounts/${id}/unblock`, { method: "POST" })
}

export function deleteAccount(id: string) {
  return api(`/api/accounts/${id}`, { method: "DELETE" })
}

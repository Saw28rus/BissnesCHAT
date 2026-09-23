import { api } from "../../shared/api/client"
import type { ChatMessage } from "./useSocket"

export async function loadMessages(conversationId: string, cursor?: string | null) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
  return api<{ messages: ChatMessage[]; next_cursor: string | null }>(
    `/api/conversations/${conversationId}/messages${query}`,
  )
}

export async function syncMessages(conversationId: string, since: string) {
  return api<{ messages: ChatMessage[] }>(
    `/api/conversations/${conversationId}/sync?since=${encodeURIComponent(since)}`,
  )
}

export async function sendText(conversationId: string, body: string, clientNonce: string, replyToId?: string | null) {
  return api<ChatMessage>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    json: { body, client_nonce: clientNonce, reply_to_id: replyToId ?? null },
  })
}

export async function sendFile(conversationId: string, kind: "file" | "voice", file: File, clientNonce: string, replyToId?: string | null, durationSec?: number) {
  const body = new FormData()
  body.set("kind", kind)
  body.set("client_nonce", clientNonce)
  if (replyToId) body.set("reply_to_id", replyToId)
  if (durationSec !== undefined) body.set("duration_sec", String(durationSec))
  body.set("upload", file)
  return api<ChatMessage>(`/api/conversations/${conversationId}/files`, { method: "POST", body })
}

export async function editText(messageId: string, body: string) {
  return api<ChatMessage>(`/api/messages/${messageId}`, { method: "PATCH", json: { body } })
}

export async function removeMessage(messageId: string) {
  return api<ChatMessage>(`/api/messages/${messageId}`, { method: "DELETE" })
}

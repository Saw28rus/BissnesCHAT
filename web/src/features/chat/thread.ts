import type { QueryClient } from "@tanstack/react-query"
import { keys } from "../../shared/query/keys"
import type { ChatMessage } from "./useSocket"

export type Thread = {
  messages: ChatMessage[]
  older: string | null
  fromServer?: boolean
}

const OPEN_DAYS = 2
const OPEN_MIN = 40
const OPEN_CAP = 80

export function sortMessages(items: ChatMessage[]) {
  return items.slice().sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
}

export function openingSlice(messages: ChatMessage[]) {
  const pending = messages.filter((item) => item.pending)
  const saved = messages.filter((item) => !item.pending)
  if (saved.length === 0) return messages
  const cutoff = Date.now() - OPEN_DAYS * 24 * 60 * 60 * 1000
  const recent = saved.filter((item) => Date.parse(item.created_at) >= cutoff)
  const windowed = recent.length >= OPEN_MIN ? recent.slice(-OPEN_CAP) : saved.slice(-Math.min(OPEN_MIN, saved.length))
  const kept = new Set(windowed.map((item) => item.id))
  return sortMessages([...windowed, ...pending.filter((item) => !kept.has(item.id))])
}

export function merge(items: ChatMessage[], incoming: ChatMessage) {
  const index = items.findIndex(
    (item) => item.id === incoming.id || Boolean(incoming.client_nonce && item.client_nonce === incoming.client_nonce),
  )
  const next = items.slice()
  const pending = Boolean(incoming.pending)
  const failed = Boolean(incoming.failed)
  if (index === -1) next.push({ ...incoming, pending, failed })
  else {
    next[index] = {
      ...incoming,
      pending,
      failed,
      client_nonce: incoming.client_nonce ?? next[index].client_nonce,
    }
  }
  const seen = new Set<string>()
  return sortMessages(
    next.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }),
  )
}

export function previewOf(message: ChatMessage) {
  if (message.deleted_at) return "Сообщение удалено"
  if (message.type === "file") return "Файл"
  if (message.type === "voice") return "Голосовое"
  if (message.type === "invoice") return "Счёт"
  return message.body.trim().slice(0, 80)
}

export function latestUpdated(messages: ChatMessage[]) {
  return messages.reduce((max, item) => (item.updated_at > max ? item.updated_at : max), "")
}

export function applyMessageToThread(thread: Thread, incoming: ChatMessage): Thread {
  return { ...thread, messages: merge(thread.messages, incoming) }
}

export function patchThread(client: QueryClient, conversationId: string, incoming: ChatMessage) {
  const key = keys.messages(conversationId)
  if (!client.getQueryData<Thread>(key)) return
  client.setQueryData<Thread>(key, (current) => (current ? applyMessageToThread(current, incoming) : current))
}

export function writeThread(client: QueryClient, conversationId: string, updater: (thread: Thread) => Thread) {
  const key = keys.messages(conversationId)
  client.setQueryData<Thread>(key, (current) => updater(current ?? { messages: [], older: null }))
}

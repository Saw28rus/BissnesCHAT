import type { QueryClient } from "@tanstack/react-query"
import { keys } from "../../shared/query/keys"
import { previewOf } from "../chat/thread"
import type { ChatMessage } from "../chat/useSocket"
import type { AccountCard } from "./api"

export function sortClients(items: AccountCard[]) {
  return items.slice().sort((left, right) => left.display_name.localeCompare(right.display_name, "ru"))
}

export function sortChats(items: AccountCard[]) {
  return items.slice().sort((left, right) => {
    const emptyLeft = left.last_message_at ? 0 : 1
    const emptyRight = right.last_message_at ? 0 : 1
    if (emptyLeft !== emptyRight) return emptyLeft - emptyRight
    return (right.last_message_at || "").localeCompare(left.last_message_at || "")
  })
}

export function matchAccount(item: AccountCard, query: string) {
  const needle = query.trim().toLocaleLowerCase("ru")
  if (!needle) return true
  const hay = [item.display_name, item.login, item.phone ?? "", item.inn ?? "", item.edo_id ?? ""]
  return hay.some((value) => value.toLocaleLowerCase("ru").includes(needle))
}

export function applyMessageToAccounts(items: AccountCard[], message: ChatMessage) {
  let changed = false
  const next = items.map((card) => {
    if (card.conversation_id !== message.conversation_id) return card
    const last = card.last_message_at
    if (last && message.created_at < last) return card
    changed = true
    return {
      ...card,
      last_message_at: message.created_at,
      preview: previewOf(message),
    }
  })
  return changed ? sortChats(next) : items
}

export function upsertAccount(items: AccountCard[], card: AccountCard) {
  const index = items.findIndex((item) => item.id === card.id)
  if (index === -1) return [...items, card]
  const next = items.slice()
  next[index] = { ...items[index], ...card }
  return next
}

export function patchAccountsFromMessage(client: QueryClient, message: ChatMessage) {
  client.setQueryData<AccountCard[]>(keys.accounts, (items) => (items ? applyMessageToAccounts(items, message) : items))
}

export function putAccount(client: QueryClient, card: AccountCard) {
  client.setQueryData<AccountCard[]>(keys.accounts, (items) => (items ? upsertAccount(items, card) : [card]))
  client.setQueryData(keys.account(card.id), card)
}

export function dropAccount(client: QueryClient, accountId: string) {
  const items = client.getQueryData<AccountCard[]>(keys.accounts)
  const card = items?.find((item) => item.id === accountId)
  client.setQueryData<AccountCard[]>(keys.accounts, (rows) => rows?.filter((item) => item.id !== accountId))
  client.removeQueries({ queryKey: keys.account(accountId) })
  if (card?.conversation_id) client.removeQueries({ queryKey: keys.messages(card.conversation_id) })
}

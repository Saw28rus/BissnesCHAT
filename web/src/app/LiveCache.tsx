import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "../shared/api/client"
import { keys } from "../shared/query/keys"
import { loadAccount, type AccountCard } from "../features/accounts/api"
import { dropAccount, patchAccountsFromMessage, putAccount } from "../features/accounts/filter"
import { patchThread } from "../features/chat/thread"
import { syncCachedThreads } from "../features/chat/sync"
import { useSession } from "./session"

let hadSocket = false

export function LiveCache() {
  const client = useQueryClient()
  const { profile, ready, subscribe } = useSession()
  const syncing = useRef(false)
  const hiddenAt = useRef(0)

  useEffect(() => {
    if (ready && !profile) {
      hadSocket = false
      client.clear()
    }
  }, [ready, profile, client])

  useEffect(() => {
    if (!profile) return
    const me = profile

    async function recover() {
      if (syncing.current) return
      syncing.current = true
      try {
        if (me.role === "admin") {
          await client.invalidateQueries({ queryKey: keys.accounts })
          await client.invalidateQueries({ queryKey: keys.invoicesRoot })
        }
        await syncCachedThreads(client)
      } finally {
        syncing.current = false
      }
    }

    async function onClientChanged(accountId: string) {
      if (me.role !== "admin") return
      try {
        putAccount(client, await loadAccount(accountId))
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 404) dropAccount(client, accountId)
      }
    }

    function notify(conversationId: string, senderId: string, type: string) {
      if (!me.notifications_enabled || !document.hidden) return
      if (senderId === me.id || Notification.permission !== "granted") return
      const kind = type === "file" ? "файл" : type === "voice" ? "голосовое" : type === "invoice" ? "счёт" : "сообщение"
      const accounts = client.getQueryData<AccountCard[]>(keys.accounts)
      const name =
        me.role === "admin"
          ? accounts?.find((item) => item.conversation_id === conversationId)?.display_name || "Клиент"
          : "Админ"
      new Notification("Бизнес ЧАТ", { body: `${name}: ${kind}` })
    }

    const stop = subscribe((event) => {
      if (event.type === "socket.open") {
        if (hadSocket) void recover()
        hadSocket = true
        return
      }
      if (event.type === "client.updated" && event.account_id) {
        void onClientChanged(event.account_id)
        return
      }
      const message = event.message
      if (!message) return
      if (event.type !== "message.created" && event.type !== "message.updated" && event.type !== "message.deleted") return
      patchThread(client, message.conversation_id, message)
      if (me.role === "admin") patchAccountsFromMessage(client, message)
      if (message.type === "invoice" || message.invoice) {
        void client.invalidateQueries({ queryKey: keys.invoicesRoot })
      }
      if (event.type === "message.created") notify(message.conversation_id, message.sender_id, message.type)
    })

    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now()
        return
      }
      if (hadSocket && hiddenAt.current && Date.now() - hiddenAt.current > 8000) {
        void syncCachedThreads(client)
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [client, profile, subscribe])

  return null
}

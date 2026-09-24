import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { keys } from "../../shared/query/keys"
import { loadMessages } from "./api"
import { merge, openingSlice, sortMessages, writeThread, type Thread } from "./thread"
import type { ChatMessage } from "./useSocket"

export function useThread(conversationId: string) {
  const client = useQueryClient()
  const olderLock = useRef(false)
  const query = useQuery({
    queryKey: keys.messages(conversationId),
    queryFn: async () => {
      const page = await loadMessages(conversationId)
      const current = client.getQueryData<Thread>(keys.messages(conversationId))
      const pending = current?.messages.filter((item) => item.pending) ?? []
      let messages = sortMessages(page.messages)
      for (const item of pending) {
        const saved = messages.some((row) => row.id === item.id || Boolean(item.client_nonce && row.client_nonce === item.client_nonce))
        if (saved) continue
        messages = merge(messages, { ...item, pending: true })
      }
      return { messages, older: page.next_cursor, fromServer: true } satisfies Thread
    },
    enabled: Boolean(conversationId),
    staleTime: (query) => ((query.state.data as Thread | undefined)?.fromServer ? Number.POSITIVE_INFINITY : 0),
    refetchOnMount: "always",
  })

  useEffect(() => {
    return () => {
      const current = client.getQueryData<Thread>(keys.messages(conversationId))
      if (!current?.messages.length) return
      const messages = openingSlice(current.messages)
      if (messages.length === current.messages.length) return
      client.setQueryData<Thread>(keys.messages(conversationId), { ...current, messages, older: null })
    }
  }, [client, conversationId])

  async function loadOlder() {
    if (olderLock.current) return
    const current = client.getQueryData<Thread>(keys.messages(conversationId))
    if (!current?.older) return
    olderLock.current = true
    try {
      const page = await loadMessages(conversationId, current.older)
      writeThread(client, conversationId, (thread) => {
        let messages = thread.messages
        for (const item of page.messages) messages = merge(messages, item)
        return { ...thread, messages, older: page.next_cursor, fromServer: true }
      })
    } finally {
      olderLock.current = false
    }
  }

  function put(message: ChatMessage) {
    writeThread(client, conversationId, (thread) => ({
      ...thread,
      messages: merge(thread.messages, message),
    }))
  }

  function failNonce(clientNonce: string) {
    writeThread(client, conversationId, (thread) => ({
      ...thread,
      messages: thread.messages.map((item) => (item.client_nonce === clientNonce ? { ...item, pending: false, failed: true } : item)),
    }))
  }

  return {
    messages: query.data?.messages ?? [],
    older: query.data?.older ?? null,
    loading: query.isPending && !query.data,
    error: query.isError,
    loadOlder,
    put,
    failNonce,
  }
}

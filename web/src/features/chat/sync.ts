import type { QueryClient } from "@tanstack/react-query"
import { ApiError } from "../../shared/api/client"
import { syncMessages } from "./api"
import { latestUpdated, patchThread, type Thread } from "./thread"

export async function syncCachedThreads(client: QueryClient) {
  const threads = client.getQueriesData<Thread>({ queryKey: ["messages"] })
  await Promise.all(
    threads.map(async ([key, thread]) => {
      const conversationId = key[1]
      if (typeof conversationId !== "string" || !thread?.fromServer || !thread.messages.length) return
      const since = latestUpdated(thread.messages)
      if (!since) return
      try {
        const page = await syncMessages(conversationId, since)
        for (const message of page.messages) patchThread(client, conversationId, message)
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 404) client.removeQueries({ queryKey: key })
      }
    }),
  )
}

import { useEffect, useRef, useState } from "react"

export type SocketEvent = {
  v: number
  type: string
  message?: ChatMessage
  account_id?: string
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  type: "text" | "file" | "voice" | "invoice"
  body: string
  reply_to_id: string | null
  reply_quote: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  updated_at: string
  attachment: null | {
    id: string
    name: string
    content_type: string
    size: number
    duration_sec: number | null
  }
  invoice: null | {
    amount: string
    currency: string
    description: string
    period: string | null
    status: "pending" | "succeeded" | "canceled"
    pay_url: string | null
    test: boolean
    expires_at: string | null
  }
  pending?: boolean
  failed?: boolean
  client_nonce?: string
}

type Handler = (event: SocketEvent) => void

export function useChatSocket(enabled: boolean, onEvent: Handler) {
  const [status, setStatus] = useState<"offline" | "live" | "connecting">("offline")
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!enabled) {
      setStatus("offline")
      return
    }
    let socket: WebSocket | null = null
    let timer = 0
    let delay = 500
    let stopped = false
    const connect = () => {
      if (stopped) return
      setStatus("connecting")
      const protocol = location.protocol === "https:" ? "wss" : "ws"
      socket = new WebSocket(`${protocol}://${location.host}/ws`)
      socket.onopen = () => {
        delay = 500
        setStatus("live")
        handler.current({ v: 1, type: "socket.open" })
      }
      socket.onmessage = (event) => {
        try {
          handler.current(JSON.parse(String(event.data)) as SocketEvent)
        } catch {
          return
        }
      }
      socket.onclose = () => {
        setStatus("offline")
        if (!stopped) {
          timer = window.setTimeout(connect, delay)
          delay = Math.min(delay * 2, 15000)
        }
      }
    }
    connect()
    const ping = window.setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send("ping")
    }, 25000)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.clearInterval(ping)
      socket?.close()
    }
  }, [enabled])

  return status
}

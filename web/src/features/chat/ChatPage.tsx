import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useSession } from "../../app/session"
import { editText, loadMessages, removeMessage, sendFile, sendText, syncMessages } from "./api"
import { Composer } from "./Composer"
import { MessageList } from "./MessageList"
import type { ChatMessage } from "./useSocket"
import { Confirm } from "../../shared/ui/confirm/Confirm"
import "./chat.css"

function sortMessages(items: ChatMessage[]) {
  return items.slice().sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
}

function merge(items: ChatMessage[], incoming: ChatMessage) {
  const index = items.findIndex(
    (item) => item.id === incoming.id || Boolean(incoming.client_nonce && item.client_nonce === incoming.client_nonce),
  )
  const next = items.slice()
  if (index === -1) next.push({ ...incoming, pending: false, failed: false })
  else next[index] = { ...incoming, pending: false, failed: false, client_nonce: incoming.client_nonce ?? next[index].client_nonce }
  const seen = new Set<string>()
  return sortMessages(next.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  }))
}

type Props = {
  conversationId: string
  title: string
  backTo?: string
}

export function ChatPage({ conversationId, title, backTo }: Props) {
  const { profile, link, subscribe } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [older, setOlder] = useState<string | null>(null)
  const [reply, setReply] = useState<ChatMessage | null>(null)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    let ignore = false
    setMessages([])
    void loadMessages(conversationId).then((page) => {
      if (ignore) return
      setMessages(sortMessages(page.messages))
      setOlder(page.next_cursor)
    }).catch(() => setError("Не удалось открыть переписку"))
    return () => {
      ignore = true
    }
  }, [conversationId])

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "socket.open") {
        const since = messagesRef.current.reduce((max, item) => (item.updated_at > max ? item.updated_at : max), "")
        if (!since) return
        void syncMessages(conversationId, since).then((page) => {
          setMessages((current) => page.messages.reduce(merge, current))
        })
        return
      }
      if (!event.message || event.message.conversation_id !== conversationId) return
      if (event.type === "message.created" || event.type === "message.updated" || event.type === "message.deleted") {
        setMessages((current) => merge(current, event.message as ChatMessage))
        const message = event.message
        if (
          event.type === "message.created" &&
          profile?.notifications_enabled &&
          document.hidden &&
          message.sender_id !== profile.id &&
          Notification.permission === "granted"
        ) {
          const kind = message.type === "file" ? "файл" : message.type === "voice" ? "голосовое" : "сообщение"
          new Notification("Бизнес ЧАТ", { body: `${title}: ${kind}` })
        }
      }
    })
  }, [conversationId, profile, subscribe, title])

  async function onOlder() {
    if (!older) return
    const page = await loadMessages(conversationId, older)
    setMessages((current) => sortMessages([...page.messages, ...current]))
    setOlder(page.next_cursor)
  }

  async function onSendText(body: string) {
    const clientNonce = crypto.randomUUID()
    const optimistic: ChatMessage = {
      id: clientNonce,
      conversation_id: conversationId,
      sender_id: profile?.id ?? "",
      type: "text",
      body,
      reply_to_id: reply?.id ?? null,
      reply_quote: reply ? (reply.body || reply.reply_quote || "сообщение") : null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      updated_at: new Date().toISOString(),
      attachment: null,
      pending: true,
      client_nonce: clientNonce,
    }
    setMessages((current) => [...current, optimistic])
    setReply(null)
    try {
      const saved = await sendText(conversationId, body, clientNonce, reply?.id)
      setMessages((current) => merge(current, { ...saved, client_nonce: clientNonce }))
    } catch (reason) {
      setMessages((current) => current.map((item) => item.client_nonce === clientNonce ? { ...item, pending: false, failed: true } : item))
      throw reason
    }
  }

  async function onSendFile(file: File) {
    const saved = await sendFile(conversationId, "file", file, crypto.randomUUID(), reply?.id)
    setReply(null)
    setMessages((current) => merge(current, saved))
  }

  async function onSendVoice(file: File, durationSec: number) {
    const saved = await sendFile(conversationId, "voice", file, crypto.randomUUID(), reply?.id, durationSec)
    setReply(null)
    setMessages((current) => merge(current, saved))
  }

  async function onEdit(body: string) {
    if (!editing) return
    const saved = await editText(editing.id, body)
    setEditing(null)
    setMessages((current) => merge(current, saved))
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    setError("")
    try {
      const saved = await removeMessage(toDelete.id)
      setMessages((current) => merge(current, saved))
      setToDelete(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить")
    } finally {
      setDeleting(false)
    }
  }

  const online = link === "live"

  return (
    <section className="chat">
      <header className="chat-head">
        <div className="chat-who">
          {backTo ? <Link className="back-link" to={backTo}>К списку</Link> : null}
          <div className="chat-who-text">
            <h1>{title}</h1>
            <span className={`presence ${online ? "on" : ""}`}>{online ? "В сети" : "Не в сети"}</span>
          </div>
        </div>
        {backTo ? null : (
          <Link className="gear-link" to="/settings" aria-label="Настройки">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"
              />
            </svg>
          </Link>
        )}
      </header>
      {error ? <p className="fail composer-error">{error}</p> : null}
      <MessageList
        messages={messages}
        selfId={profile?.id ?? ""}
        selfRole={profile?.role === "admin" ? "admin" : "client"}
        older={older}
        onOlder={() => void onOlder()}
        onReply={(message) => { setEditing(null); setReply(message) }}
        onEdit={(message) => { setReply(null); setEditing(message) }}
        onDelete={(message) => setToDelete(message)}
      />
      <Composer
        reply={reply}
        editing={editing}
        onCancelReply={() => setReply(null)}
        onCancelEdit={() => setEditing(null)}
        onSendText={onSendText}
        onSendFile={onSendFile}
        onSendVoice={onSendVoice}
        onEdit={onEdit}
      />
      <Confirm
        open={Boolean(toDelete)}
        title="Удалить сообщение?"
        text="Оно исчезнет у вас и у собеседника. Вернуть нельзя."
        confirmLabel="Удалить"
        busy={deleting}
        onCancel={() => { if (!deleting) setToDelete(null) }}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

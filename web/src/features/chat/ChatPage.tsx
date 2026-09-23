import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useSession } from "../../app/session"
import { editText, loadMessages, removeMessage, sendFile, sendText, syncMessages } from "./api"
import { Composer } from "./Composer"
import { MessageList } from "./MessageList"
import type { ChatMessage } from "./useSocket"
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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
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

  async function onDelete(message: ChatMessage) {
    if (pendingDelete !== message.id) {
      setPendingDelete(message.id)
      return
    }
    const saved = await removeMessage(message.id)
    setPendingDelete(null)
    setMessages((current) => merge(current, saved))
  }

  const linkLabel = link === "live" ? "на связи" : link === "connecting" ? "соединение" : "нет связи"

  return (
    <section className="chat">
      <header className="chat-head">
        <div>
          {backTo ? <Link className="back-link" to={backTo}>К списку</Link> : null}
          <h1>{title}</h1>
        </div>
        <div className="chat-tools">
          {backTo ? null : <Link to="/settings">Настройки</Link>}
          <span className={`link ${link === "live" ? "live" : ""}`}>{linkLabel}</span>
        </div>
      </header>
      {error ? <p className="fail composer-error">{error}</p> : null}
      {pendingDelete ? <p className="hint composer-error">Нажмите «Удалить» ещё раз, чтобы подтвердить.</p> : null}
      <MessageList
        messages={messages}
        selfId={profile?.id ?? ""}
        older={older}
        onOlder={() => void onOlder()}
        onReply={(message) => { setEditing(null); setReply(message) }}
        onEdit={(message) => { setReply(null); setEditing(message) }}
        onDelete={(message) => void onDelete(message)}
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
    </section>
  )
}

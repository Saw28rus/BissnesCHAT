import { useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useSession } from "../../app/session"
import { keys } from "../../shared/query/keys"
import { editText, removeMessage, sendFile, sendInvoice, sendText } from "./api"
import { Composer } from "./Composer"
import { InvoiceForm } from "./InvoiceForm"
import { MessageList } from "./MessageList"
import type { ChatMessage } from "./useSocket"
import { useThread } from "./useThread"
import { Confirm } from "../../shared/ui/confirm/Confirm"
import { CopyButton } from "../../shared/ui/copy/CopyButton"
import { useYookassa } from "../yookassa/useYookassa"
import { edoValue } from "../accounts/fields"
import "./chat.css"

type Props = {
  conversationId: string
  title: string
  backTo?: string
  client?: { id?: string; edo_id?: string | null; fields?: { label: string; value: string }[] }
}

export function ChatPage({ conversationId, title, backTo, client }: Props) {
  const { profile, link } = useSession()
  const queryClient = useQueryClient()
  const thread = useThread(conversationId)
  const yookassa = useYookassa(profile?.role === "admin")
  const [reply, setReply] = useState<ChatMessage | null>(null)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [invoiceError, setInvoiceError] = useState("")
  const [error, setError] = useState("")
  const dock = useRef<HTMLDivElement>(null)
  const [dockSpace, setDockSpace] = useState(80)
  const [followSent, setFollowSent] = useState(0)

  function followOwn() {
    setFollowSent((value) => value + 1)
  }

  useLayoutEffect(() => {
    const node = dock.current
    if (!node) return
    const sync = () => setDockSpace(Math.ceil(node.getBoundingClientRect().height))
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  async function onSendInvoice(payload: { amount: string; period: string; template_id?: string; days: number }) {
    setInvoiceBusy(true)
    setInvoiceError("")
    try {
      thread.put(await sendInvoice(conversationId, payload, crypto.randomUUID()))
      await queryClient.invalidateQueries({ queryKey: keys.invoicesRoot })
      followOwn()
      setInvoiceOpen(false)
    } catch (reason) {
      setInvoiceError(reason instanceof Error ? reason.message : "Счёт не выставлен")
    } finally {
      setInvoiceBusy(false)
    }
  }

  async function onSendText(body: string) {
    const clientNonce = crypto.randomUUID()
    const replyId = reply?.id
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
      invoice: null,
      pending: true,
      client_nonce: clientNonce,
    }
    thread.put(optimistic)
    followOwn()
    setReply(null)
    try {
      thread.put({ ...(await sendText(conversationId, body, clientNonce, replyId)), client_nonce: clientNonce })
    } catch (reason) {
      thread.failNonce(clientNonce)
      throw reason
    }
  }

  async function onSendFile(file: File) {
    thread.put(await sendFile(conversationId, "file", file, crypto.randomUUID(), reply?.id))
    followOwn()
    setReply(null)
  }

  async function onSendVoice(file: File, durationSec: number) {
    thread.put(await sendFile(conversationId, "voice", file, crypto.randomUUID(), reply?.id, durationSec))
    followOwn()
    setReply(null)
  }

  async function onEdit(body: string) {
    if (!editing) return
    thread.put(await editText(editing.id, body))
    setEditing(null)
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    setError("")
    try {
      thread.put(await removeMessage(toDelete.id))
      setToDelete(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить")
    } finally {
      setDeleting(false)
    }
  }

  const online = link === "live"
  const edo = edoValue(client)

  return (
    <section className="chat" style={{ "--chat-dock": `${dockSpace}px` } as CSSProperties}>
      <header className="chat-head">
        <div className="chat-who">
          {backTo ? <Link className="back-link" to={backTo}>К списку</Link> : null}
          <div className="chat-who-text">
            <h1>{title}</h1>
            <span className={`presence ${online ? "on" : ""}`}>{online ? "В сети" : "Не в сети"}</span>
          </div>
          {backTo && edo ? (
            <div className="chat-edo">
              <CopyButton label="ЭДО" value={edo} />
            </div>
          ) : null}
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
      {thread.error ? <p className="fail composer-error">Не удалось открыть переписку</p> : null}
      <MessageList
        key={conversationId}
        messages={thread.messages}
        loading={thread.loading}
        selfId={profile?.id ?? ""}
        selfRole={profile?.role === "admin" ? "admin" : "client"}
        older={thread.older}
        dockSpace={dockSpace}
        followSent={followSent}
        onOlder={() => thread.loadOlder()}
        onReply={(message) => { setEditing(null); setReply(message) }}
        onEdit={(message) => { setReply(null); setEditing(message) }}
        onDelete={(message) => setToDelete(message)}
      />
      <div className="chat-dock" ref={dock}>
        {invoiceOpen && profile?.role === "admin" ? (
          <InvoiceForm
            connected={Boolean(yookassa.data?.connected)}
            busy={invoiceBusy}
            error={invoiceError}
            clientName={title}
            onCancel={() => { setInvoiceOpen(false); setInvoiceError("") }}
            onSend={onSendInvoice}
          />
        ) : null}
        <Composer
          reply={reply}
          editing={editing}
          onCancelReply={() => setReply(null)}
          onCancelEdit={() => setEditing(null)}
          onSendText={onSendText}
          onSendFile={onSendFile}
          onSendVoice={onSendVoice}
          onEdit={onEdit}
          onInvoice={profile?.role === "admin" ? () => { setEditing(null); setReply(null); setInvoiceOpen(true) } : undefined}
        />
      </div>
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

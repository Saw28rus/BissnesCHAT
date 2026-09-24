import { useEffect, useRef } from "react"
import { Button } from "../../shared/ui/button/Button"
import type { ChatMessage } from "./useSocket"

function stamp(value: string) {
  return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" }).format(new Date(value))
}

function money(amount: string, currency: string) {
  const value = Number(amount)
  if (Number.isNaN(value)) return `${amount} ${currency}`
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value)
}

type Props = {
  messages: ChatMessage[]
  loading?: boolean
  selfId: string
  selfRole: "admin" | "client"
  older: string | null
  onOlder: () => void
  onReply: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onDelete: (message: ChatMessage) => void
}

export function MessageList({
  messages,
  loading = false,
  selfId,
  selfRole,
  older,
  onOlder,
  onReply,
  onEdit,
  onDelete,
}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const node = box.current
    if (!node || !stick.current) return
    node.scrollTop = node.scrollHeight
  }, [messages])

  function onScroll() {
    const node = box.current
    if (!node) return
    stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }

  let previousDay = ""
  return (
    <div className="thread" ref={box} onScroll={onScroll}>
      {older ? <Button type="button" tone="quiet" onClick={onOlder}>Более ранние</Button> : null}
      {loading ? <p className="hint">Открываем переписку</p> : null}
      {!loading && messages.length === 0 ? <p className="hint">Переписка ещё пустая.</p> : null}
      {messages.map((message) => {
        const day = dayLabel(message.created_at)
        const showDay = day !== previousDay
        previousDay = day
        const mine = message.sender_id === selfId
        const fromClient = selfRole === "client" ? mine : !mine
        const deleted = Boolean(message.deleted_at)
        return (
          <article key={message.client_nonce ?? message.id} className="post">
            {showDay ? <div className="day">{day}</div> : null}
            <div className={`bubble ${fromClient ? "from-client" : "from-admin"}`}>
              <div className="bubble-body">
                {message.reply_quote ? <div className="quote">{message.reply_quote}</div> : null}
                {deleted ? <p className="deleted">Сообщение удалено</p> : null}
                {!deleted && message.type === "text" ? <p>{message.body}</p> : null}
                {!deleted && message.type === "invoice" ? (
                  <>
                    {message.body ? <p className="invoice-letter">{message.body}</p> : null}
                    {message.invoice ? (
                      <div className="invoice-card">
                        <p className="invoice-kicker">{message.invoice.period ? `Счёт · ${message.invoice.period}` : "Счёт"}</p>
                        <p className="invoice-sum">{money(message.invoice.amount, message.invoice.currency)}</p>
                        {message.invoice.status === "pending" && message.invoice.pay_url ? (
                          <a className="invoice-pay" href={message.invoice.pay_url} target="_blank" rel="noopener noreferrer">Оплатить</a>
                        ) : null}
                        {message.invoice.status === "succeeded" ? <p className="invoice-paid">Оплачен</p> : null}
                        {message.invoice.status === "canceled" ? <p className="invoice-dead">Недействителен</p> : null}
                        {message.invoice.test ? <p className="invoice-test">Тестовый платёж</p> : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {!deleted && message.type === "file" && message.attachment ? (
                  <a className="file-link" href={`/api/attachments/${message.attachment.id}`}>{message.attachment.name}</a>
                ) : null}
                {!deleted && message.type === "voice" && message.attachment ? (
                  <audio controls preload="none" src={`/api/attachments/${message.attachment.id}`} />
                ) : null}
                <div className="meta">
                  {stamp(message.created_at)}
                  {message.edited_at ? " · изм." : ""}
                  {message.pending ? " · отправка" : ""}
                  {message.failed ? " · не ушло" : ""}
                </div>
              </div>
              {!deleted && !message.pending ? (
                <div className="bubble-tools">
                  <button type="button" className="bubble-tool" aria-label="Ответить" onClick={() => onReply(message)}>
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M5 3 1 7l4 4M1 7h7.5A3.5 3.5 0 0 1 12 10.5V12" fill="none" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                  </button>
                  {mine && message.type === "text" ? (
                    <button type="button" className="bubble-tool" aria-label="Изменить" onClick={() => onEdit(message)}>
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M8.5 2.5 11.5 5.5 5 12H2v-3zM7.5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.3" />
                      </svg>
                    </button>
                  ) : null}
                  {mine ? (
                    <button type="button" className="bubble-tool" aria-label="Удалить" onClick={() => onDelete(message)}>
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.3" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

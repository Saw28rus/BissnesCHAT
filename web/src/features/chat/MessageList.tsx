import { useEffect, useRef } from "react"
import { Button } from "../../shared/ui/button/Button"
import type { ChatMessage } from "./useSocket"

function stamp(value: string) {
  return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" }).format(new Date(value))
}

type Props = {
  messages: ChatMessage[]
  selfId: string
  older: string | null
  onOlder: () => void
  onReply: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onDelete: (message: ChatMessage) => void
}

export function MessageList({ messages, selfId, older, onOlder, onReply, onEdit, onDelete }: Props) {
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
      {messages.length === 0 ? <p className="hint">Переписка ещё пустая.</p> : null}
      {messages.map((message) => {
        const day = dayLabel(message.created_at)
        const showDay = day !== previousDay
        previousDay = day
        const mine = message.sender_id === selfId
        const deleted = Boolean(message.deleted_at)
        return (
          <article key={message.client_nonce ?? message.id}>
            {showDay ? <div className="day">{day}</div> : null}
            <div className={`bubble ${mine ? "mine" : "theirs"}`}>
              {message.reply_quote ? <div className="quote">{message.reply_quote}</div> : null}
              {deleted ? <p className="deleted">Сообщение удалено</p> : null}
              {!deleted && message.type === "text" ? <p>{message.body}</p> : null}
              {!deleted && message.type === "file" && message.attachment ? (
                <a className="file-link" href={`/api/attachments/${message.attachment.id}`}>{message.attachment.name}</a>
              ) : null}
              {!deleted && message.type === "voice" && message.attachment ? (
                <audio controls preload="none" src={`/api/attachments/${message.attachment.id}`} />
              ) : null}
              <div className="meta">
                {stamp(message.created_at)}
                {message.edited_at ? " · изменено" : ""}
                {message.pending ? " · отправка" : ""}
                {message.failed ? " · не ушло" : ""}
              </div>
              {!deleted && !message.pending ? (
                <div className="actions">
                  <Button type="button" tone="quiet" onClick={() => onReply(message)}>Ответить</Button>
                  {mine && message.type === "text" ? <Button type="button" tone="quiet" onClick={() => onEdit(message)}>Изменить</Button> : null}
                  {mine ? <Button type="button" tone="quiet" onClick={() => onDelete(message)}>Удалить</Button> : null}
                </div>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

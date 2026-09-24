import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { Field } from "../../shared/ui/field/Field"
import { filterAccounts, useAccounts } from "../accounts/useAccounts"
import { sortChats } from "../accounts/filter"

function stamp(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function ChatList() {
  const { conversationId } = useParams()
  const { data, isError, isPending } = useAccounts()
  const [query, setQuery] = useState("")
  const items = sortChats(filterAccounts(data, query))

  return (
    <aside className="chat-list">
      <header>
        <Field
          compact
          label="Поиск"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя, телефон, ЭДО, ИНН"
        />
        {isError ? <p className="fail">Список не открылся</p> : null}
      </header>
      {items.map((item) => {
        const empty = !item.last_message_at
        return (
          <Link
            key={item.id}
            className={`chat-row ${item.conversation_id === conversationId ? "current" : ""} ${empty ? "empty" : ""}`}
            to={`/admin/chats/${item.conversation_id}`}
          >
            <span className="chat-row-top">
              <strong>{item.display_name}</strong>
              <time>{stamp(item.last_message_at)}</time>
            </span>
            <small>{item.preview || "Пустой диалог"}</small>
          </Link>
        )
      })}
      {isPending ? null : items.length === 0 ? <p className="hint chat-row">Диалогов пока нет.</p> : null}
    </aside>
  )
}

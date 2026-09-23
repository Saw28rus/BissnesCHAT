import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useSession } from "../../app/session"
import { Field } from "../../shared/ui/field/Field"
import { loadAccounts, type AccountCard } from "../accounts/api"

function sortChats(items: AccountCard[]) {
  return items.slice().sort((left, right) => {
    const emptyLeft = left.last_message_at ? 0 : 1
    const emptyRight = right.last_message_at ? 0 : 1
    if (emptyLeft !== emptyRight) return emptyLeft - emptyRight
    return (right.last_message_at || "").localeCompare(left.last_message_at || "")
  })
}

function stamp(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function ChatList() {
  const { conversationId } = useParams()
  const { subscribe } = useSession()
  const [query, setQuery] = useState("")
  const queryRef = useRef(query)
  queryRef.current = query
  const [items, setItems] = useState<AccountCard[]>([])
  const [error, setError] = useState("")

  async function reload(next = queryRef.current) {
    try {
      setItems(sortChats(await loadAccounts(next)))
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Список не открылся")
    }
  }

  useEffect(() => {
    void reload("")
    return subscribe((event) => {
      if (
        event.type === "client.updated" ||
        event.type === "message.created" ||
        event.type === "message.updated" ||
        event.type === "message.deleted"
      ) void reload()
    })
  }, [subscribe])

  return (
    <aside className="chat-list">
      <header>
        <form onSubmit={(event) => { event.preventDefault(); void reload() }}>
          <Field label="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, телефон, ЭДО, ИНН" />
        </form>
        <p><Link className="action-pill" to="/admin/chats/broadcast">Рассылка</Link></p>
        {error ? <p className="fail">{error}</p> : null}
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
      {items.length === 0 ? <p className="hint chat-row">Диалогов пока нет.</p> : null}
    </aside>
  )
}

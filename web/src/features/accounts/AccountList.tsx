import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useSession } from "../../app/session"
import { loadAccounts, type AccountCard } from "./api"

export function AccountList() {
  const { conversationId } = useParams()
  const { subscribe } = useSession()
  const [query, setQuery] = useState("")
  const queryRef = useRef(query)
  queryRef.current = query
  const [items, setItems] = useState<AccountCard[]>([])
  const [error, setError] = useState("")

  async function reload(next = queryRef.current) {
    try {
      setItems(await loadAccounts(next))
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
    <aside className="client-list">
      <header>
        <form onSubmit={(event) => { event.preventDefault(); void reload() }}>
          <label className="field">
            <span>Поиск</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя или логин" />
          </label>
        </form>
        <p><Link to="/admin/accounts/new">Новый кабинет</Link></p>
        {error ? <p className="fail">{error}</p> : null}
      </header>
      {items.map((item) => (
        <div key={item.id} className={`client-row ${item.conversation_id === conversationId ? "current" : ""}`}>
          <Link to={`/admin/chat/${item.conversation_id}`}>
            <strong>{item.display_name}</strong>
            <small>{item.login} · {item.status === "blocked" ? "заблокирован" : "активен"}</small>
            <small className="muted">{item.preview || "Нет сообщений"}</small>
          </Link>
          <Link to={`/admin/accounts/${item.id}`}>Править</Link>
        </div>
      ))}
      {items.length === 0 ? <p className="hint client-row">Кабинетов пока нет.</p> : null}
    </aside>
  )
}

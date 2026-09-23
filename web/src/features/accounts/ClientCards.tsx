import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useSession } from "../../app/session"
import { Field } from "../../shared/ui/field/Field"
import { CopyButton } from "../../shared/ui/copy/CopyButton"
import { loadAccounts, type AccountCard } from "./api"
import "./accounts.css"

export function ClientCards() {
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
      if (event.type === "client.updated") void reload()
    })
  }, [subscribe])

  return (
    <section className="clients-page">
      <header className="clients-head">
        <h1>Клиенты</h1>
        <Link className="action-pill" to="/admin/clients/new">Новый кабинет</Link>
        <form onSubmit={(event) => { event.preventDefault(); void reload() }}>
          <Field label="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ФИО, телефон, ЭДО, ИНН" />
        </form>
        {error ? <p className="fail">{error}</p> : null}
      </header>
      {items.map((item) => (
        <article key={item.id} className="client-card">
          <div className="client-card-title">
            <h2>{item.display_name}</h2>
            <small>{item.status === "blocked" ? "заблокирован" : item.login}</small>
          </div>
          <div className="copy-row">
            <CopyButton label="ЭДО" value={item.edo_id} />
            <CopyButton label="Телефон" value={item.phone} />
            <CopyButton label="ИНН" value={item.inn} />
          </div>
          <div className="row-actions">
            {item.conversation_id ? <Link className="action-pill" to={`/admin/chats/${item.conversation_id}`}>Чат</Link> : null}
            <Link className="action-pill quiet" to={`/admin/clients/${item.id}`}>Карточка</Link>
          </div>
        </article>
      ))}
      {items.length === 0 ? <p className="hint client-card">Кабинетов пока нет.</p> : null}
    </section>
  )
}

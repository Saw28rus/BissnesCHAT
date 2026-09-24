import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useSession } from "../../app/session"
import { Field } from "../../shared/ui/field/Field"
import { loadAccounts, type AccountCard } from "./api"
import "./accounts.css"

function line(item: AccountCard) {
  const bits = [item.status === "blocked" ? "заблокирован" : item.login]
  if (item.phone) bits.push(item.phone)
  return bits.join(" · ")
}

export function ClientCards() {
  const { subscribe } = useSession()
  const [query, setQuery] = useState("")
  const queryRef = useRef(query)
  queryRef.current = query
  const [items, setItems] = useState<AccountCard[]>([])
  const [error, setError] = useState("")

  async function reload(next = queryRef.current) {
    try {
      const rows = await loadAccounts(next)
      setItems(Array.isArray(rows) ? rows : [])
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

  useEffect(() => {
    if (!query) {
      void reload("")
      return
    }
    const timer = window.setTimeout(() => void reload(query), 180)
    return () => window.clearTimeout(timer)
  }, [query])

  return (
    <section className="clients-page">
      <header className="clients-head">
        <div className="page-head">
          <h1>Клиенты</h1>
          <Link to="/admin/clients/new">Новый</Link>
        </div>
        <Field
          compact
          label="Поиск"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя, телефон, ЭДО, ИНН"
        />
        {error ? <p className="fail">{error}</p> : null}
      </header>
      {items.map((item) => (
        <Link key={item.id} className="client-row" to={`/admin/clients/${item.id}`}>
          <strong>{item.display_name}</strong>
          <small>{line(item)}</small>
        </Link>
      ))}
      {items.length === 0 ? <p className="hint client-row">Кабинетов пока нет.</p> : null}
    </section>
  )
}

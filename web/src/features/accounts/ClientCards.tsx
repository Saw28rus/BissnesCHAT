import { useState } from "react"
import { Link } from "react-router-dom"
import { Field } from "../../shared/ui/field/Field"
import { filterAccounts, useAccounts } from "./useAccounts"
import { sortClients } from "./filter"
import "./accounts.css"

function line(item: { status: string; login: string; phone: string | null }) {
  const bits = [item.status === "blocked" ? "заблокирован" : item.login]
  if (item.phone) bits.push(item.phone)
  return bits.join(" · ")
}

export function ClientCards() {
  const { data, isError, isPending } = useAccounts()
  const [query, setQuery] = useState("")
  const items = sortClients(filterAccounts(data, query))

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
        {isError ? <p className="fail">Список не открылся</p> : null}
      </header>
      {items.map((item) => (
        <Link key={item.id} className="client-row" to={`/admin/clients/${item.id}`}>
          <strong>{item.display_name}</strong>
          <small>{line(item)}</small>
        </Link>
      ))}
      {isPending ? null : items.length === 0 ? <p className="hint client-row">Кабинетов пока нет.</p> : null}
    </section>
  )
}

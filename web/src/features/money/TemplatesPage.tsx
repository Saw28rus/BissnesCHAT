import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "../../shared/api/client"
import { keys } from "../../shared/query/keys"
import { Button } from "../../shared/ui/button/Button"
import { Area, Field } from "../../shared/ui/field/Field"
import { createTemplate, deleteTemplate, updateTemplate, type InvoiceTemplate } from "./api"
import { useTemplates } from "./useMoney"
import "./money.css"

const HINT = "В тексте можно вставить {name}, {period}, {amount}, {url} и {expires}."

export function TemplatesPage() {
  const queryClient = useQueryClient()
  const query = useTemplates()
  const items = query.data ?? []
  const [title, setTitle] = useState("Ежемесячный счёт")
  const [body, setBody] = useState("")
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (currentId || !items[0]) return
    setCurrentId(items[0].id)
    setTitle(items[0].title)
    setBody(items[0].body)
  }, [items, currentId])

  function write(rows: InvoiceTemplate[]) {
    queryClient.setQueryData(keys.templates, rows)
  }

  function pick(item: InvoiceTemplate) {
    setCurrentId(item.id)
    setTitle(item.title)
    setBody(item.body)
    setMessage("")
    setError("")
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setError("")
    setMessage("")
    try {
      if (currentId) {
        const saved = await updateTemplate(currentId, { title, body })
        write(items.map((item) => (item.id === saved.id ? saved : item)))
        setMessage("Шаблон сохранён")
        return
      }
      const created = await createTemplate(title, body)
      write([...items, created])
      setCurrentId(created.id)
      setMessage("Шаблон создан")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не сохранилось")
    }
  }

  async function add() {
    setCurrentId(null)
    setTitle("Новый шаблон")
    setBody(items[0]?.body ?? "")
    setMessage("")
  }

  async function remove() {
    if (!currentId || items.length <= 1) return
    setError("")
    try {
      await deleteTemplate(currentId)
      const rows = items.filter((item) => item.id !== currentId)
      write(rows)
      if (rows[0]) pick(rows[0])
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Нельзя удалить последний шаблон")
    }
  }

  return (
    <section className="plain-page">
      <Link to="/admin/money">К счетам</Link>
      <h1>Шаблоны счетов</h1>
      <p className="hint">{HINT}</p>
      {query.isError ? <p className="fail">Шаблоны не открылись</p> : null}
      <div className="template-picks">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === currentId ? "active" : ""}
            onClick={() => pick(item)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <form onSubmit={(event) => void save(event)}>
        <Field label="Название" value={title} onChange={(event) => setTitle(event.target.value)} required />
        <Area label="Текст письма" value={body} onChange={(event) => setBody(event.target.value)} required maxLength={4000} />
        {error ? <p className="fail">{error}</p> : null}
        {message ? <p className="hint">{message}</p> : null}
        <div className="row-actions">
          <Button type="submit" tone="solid">Сохранить</Button>
          <Button type="button" onClick={() => void add()}>Ещё шаблон</Button>
          <Button type="button" tone="quiet" disabled={!currentId || items.length <= 1} onClick={() => void remove()}>Удалить</Button>
        </div>
      </form>
    </section>
  )
}

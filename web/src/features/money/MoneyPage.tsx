import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Confirm } from "../../shared/ui/confirm/Confirm"
import { loadYookassa } from "../yookassa/api"
import { hideInvoice, loadInvoices, type InvoiceBucket, type InvoiceRow } from "./api"
import { formatRub } from "./letter"
import "./money.css"

const TABS: { id: InvoiceBucket; label: string }[] = [
  { id: "issued", label: "Выставленные" },
  { id: "overdue", label: "Просроченные" },
  { id: "paid", label: "Оплаченные" },
  { id: "deleted", label: "Удалённые" },
]

function moneyStamp(value: string | null) {
  if (!value) return ""
  return new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function MoneyPage() {
  const [bucket, setBucket] = useState<InvoiceBucket>("issued")
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [connected, setConnected] = useState(true)
  const [error, setError] = useState("")
  const [toHide, setToHide] = useState<InvoiceRow | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload(next = bucket) {
    try {
      setRows(await loadInvoices(next))
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Список счетов не открылся")
    }
  }

  useEffect(() => {
    void loadYookassa().then((status) => setConnected(status.connected)).catch(() => setConnected(false))
  }, [])

  useEffect(() => {
    void reload(bucket)
  }, [bucket])

  async function confirmHide() {
    if (!toHide) return
    setBusy(true)
    try {
      await hideInvoice(toHide.id)
      setToHide(null)
      await reload()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось убрать счёт")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="money-page">
      <header className="money-head">
        <h1>Деньги</h1>
        <div className="row-actions">
          <Link className="money-create" to="/admin/money/new">Выставить счёт</Link>
          <Link to="/admin/money/templates">Шаблоны</Link>
        </div>
        {connected ? null : (
          <p className="fail">ЮKassa не подключена. <Link to="/admin/settings/yookassa">Подключить</Link></p>
        )}
      </header>
      <div className="money-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={bucket === tab.id}
            className={bucket === tab.id ? "active" : ""}
            onClick={() => setBucket(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {error ? <p className="fail money-pad">{error}</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="money-row">
          <div className="money-row-top">
            <strong>{row.client_name}</strong>
            <span>{formatRub(row.amount)}</span>
          </div>
          <small>{row.period || row.description}</small>
          <small>{row.status === "succeeded" ? `оплачен ${moneyStamp(row.paid_at)}` : `до ${moneyStamp(row.expires_at)}`}</small>
          <div className="row-actions">
            <Link to={`/admin/chats/${row.conversation_id}`}>В чат</Link>
            {bucket !== "deleted" ? (
              <Button type="button" tone="quiet" onClick={() => setToHide(row)}>В удалённые</Button>
            ) : null}
          </div>
        </article>
      ))}
      {rows.length === 0 ? <p className="hint money-pad">В этом списке пусто.</p> : null}
      <Confirm
        open={Boolean(toHide)}
        title="Убрать счёт?"
        text="Он перейдёт в «Удалённые». Письмо в чате останется, кнопка оплаты скроется."
        confirmLabel="Убрать"
        busy={busy}
        onCancel={() => { if (!busy) setToHide(null) }}
        onConfirm={() => void confirmHide()}
      />
    </section>
  )
}

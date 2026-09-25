import { useState } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "../../shared/api/client"
import { keys } from "../../shared/query/keys"
import { Confirm } from "../../shared/ui/confirm/Confirm"
import { useYookassa } from "../yookassa/useYookassa"
import { hideInvoice, type InvoiceBucket, type InvoiceRow } from "./api"
import { useInvoices } from "./useMoney"
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
  return new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short" })
}

function rowMeta(row: InvoiceRow, bucket: InvoiceBucket) {
  const period = row.period || row.description
  if (row.status === "succeeded") return [period, `оплачен ${moneyStamp(row.paid_at)}`].filter(Boolean).join(" · ")
  const until = moneyStamp(row.expires_at)
  if (!until) return period
  return [period, bucket === "overdue" ? `срок ${until}` : `до ${until}`].filter(Boolean).join(" · ")
}

export function MoneyPage() {
  const queryClient = useQueryClient()
  const [bucket, setBucket] = useState<InvoiceBucket>("issued")
  const invoices = useInvoices(bucket)
  const yookassa = useYookassa()
    const dump = invoices.data
  const rows = dump?.items ?? []
  const connected = yookassa.data?.connected !== false
  const [error, setError] = useState("")
  const [toHide, setToHide] = useState<InvoiceRow | null>(null)
  const [busy, setBusy] = useState(false)
  const hint = typeof dump?.raw === "object" && dump.raw && "hint" in dump.raw
    ? String((dump.raw as { hint?: string | null }).hint || "")
    : ""

  async function confirmHide() {
    if (!toHide) return
    setBusy(true)
    try {
      await hideInvoice(toHide.id)
      setToHide(null)
      await queryClient.invalidateQueries({ queryKey: keys.invoicesRoot })
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось убрать счёт")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="money-page">
      <header className="money-head">
        <div className="money-title">
          <h1>Деньги</h1>
          <Link className="money-sub" to="/admin/money/templates">Шаблоны писем</Link>
        </div>
        <Link className="money-new" to="/admin/money/new">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2.5v9M2.5 7h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Новый счёт
        </Link>
      </header>
      {connected ? null : (
        <p className="money-warn">ЮKassa не подключена. <Link to="/admin/settings/yookassa">Подключить</Link></p>
      )}
      <nav className="money-tabs" role="tablist" aria-label="Счета">
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
      </nav>
      {error ? <p className="fail money-note">{error}</p> : null}
      {invoices.isError || dump?.ok === false ? <p className="fail money-note">Список счетов не открылся</p> : null}
      <div className="money-list">
        {rows.map((row) => (
          <article
            key={row.id}
            className={`money-row${bucket === "overdue" ? " is-overdue" : ""}${row.status === "succeeded" ? " is-paid" : ""}`}
          >
            <div className="money-line">
              <strong>{row.client_name}</strong>
              <span className="money-amount">{formatRub(row.amount)}</span>
            </div>
            <div className="money-subline">
              <small>{rowMeta(row, bucket)}</small>
              <div className="money-row-acts">
                {row.conversation_id ? (
                  <Link className="money-link" to={`/admin/chats/${row.conversation_id}`}>В чат</Link>
                ) : null}
                {bucket !== "deleted" && !row.orphan ? (
                  <button type="button" className="money-quiet" onClick={() => setToHide(row)}>Убрать</button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      {invoices.isPending || (invoices.isFetching && rows.length === 0) ? (
        <p className="hint money-note">Загружаем счета</p>
      ) : null}
      {rows.length === 0 && !invoices.isPending && !invoices.isFetching ? (
        <p className="hint money-note">{hint || "В этом списке пусто."}</p>
      ) : null}
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

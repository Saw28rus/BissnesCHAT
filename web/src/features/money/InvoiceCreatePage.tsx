import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Field, Select } from "../../shared/ui/field/Field"
import { loadAccounts, type AccountCard } from "../accounts/api"
import { loadYookassa } from "../yookassa/api"
import { createInvoice, loadTemplates, type InvoiceTemplate } from "./api"
import { expiresPreview, fillLetter, formatRub, periodCaption, previousMonthValue } from "./letter"
import "./money.css"

export function InvoiceCreatePage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<AccountCard[]>([])
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([])
  const [conversationId, setConversationId] = useState("")
  const [amount, setAmount] = useState("1800")
  const [period, setPeriod] = useState(previousMonthValue())
  const [templateId, setTemplateId] = useState("")
  const [days, setDays] = useState("7")
  const [connected, setConnected] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadAccounts("").then((rows) => {
      const active = rows.filter((item) => item.status === "active" && item.conversation_id)
      setClients(active)
      if (active[0]?.conversation_id) setConversationId(active[0].conversation_id)
    }).catch(() => setError("Список клиентов не открылся"))
    void loadTemplates().then((rows) => {
      setTemplates(rows)
      if (rows[0]) setTemplateId(rows[0].id)
    }).catch(() => undefined)
    void loadYookassa().then((status) => setConnected(status.connected)).catch(() => setConnected(false))
  }, [])

  const client = clients.find((item) => item.conversation_id === conversationId)
  const template = templates.find((item) => item.id === templateId)
  const preview = useMemo(() => {
    if (!template) return ""
    return fillLetter(template.body, {
      name: client?.display_name || "клиент",
      period: periodCaption(period),
      amount: formatRub(amount),
      url: "https://yookassa.ru/my/i/…",
      expires: expiresPreview(Number(days) || 7),
    })
  }, [template, client, period, amount, days])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!conversationId || !amount.trim()) return
    setBusy(true)
    setError("")
    try {
      await createInvoice({
        conversation_id: conversationId,
        amount: amount.trim(),
        period,
        template_id: templateId || undefined,
        days: Number(days) || 7,
      })
      navigate("/admin/money")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Счёт не выставлен")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-page" onSubmit={(event) => void submit(event)}>
      <Link to="/admin/money">К счетам</Link>
      <h1>Выставить счёт</h1>
      {connected ? null : (
        <p className="fail">Сначала подключите ЮKassa в настройках. <Link to="/admin/settings/yookassa">Открыть</Link></p>
      )}
      <Select label="Клиент" value={conversationId} onChange={(event) => setConversationId(event.target.value)} required>
        {clients.map((item) => (
          <option key={item.id} value={item.conversation_id ?? ""}>{item.display_name}</option>
        ))}
      </Select>
      <Field label="Период" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required />
      <Field label="Сумма, ₽" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      <Select label="Шаблон письма" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
        {templates.map((item) => (
          <option key={item.id} value={item.id}>{item.title}</option>
        ))}
      </Select>
      <Field label="Срок, дней" inputMode="numeric" min={1} max={30} value={days} onChange={(event) => setDays(event.target.value)} required />
      {preview ? <pre className="letter-preview">{preview}</pre> : null}
      {error ? <p className="fail">{error}</p> : null}
      <Button type="submit" tone="solid" disabled={busy || !connected || !conversationId}>
        {busy ? "Выставляем" : "Отправить в чат"}
      </Button>
    </form>
  )
}

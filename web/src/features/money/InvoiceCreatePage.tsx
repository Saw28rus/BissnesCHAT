import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "../../shared/api/client"
import { keys } from "../../shared/query/keys"
import { Button } from "../../shared/ui/button/Button"
import { Field, Select } from "../../shared/ui/field/Field"
import { useAccounts } from "../accounts/useAccounts"
import { useYookassa } from "../yookassa/useYookassa"
import { createInvoice } from "./api"
import { useTemplates } from "./useMoney"
import { expiresPreview, fillLetter, formatRub, periodCaption, previousMonthValue } from "./letter"
import "./money.css"

export function InvoiceCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accounts = useAccounts()
  const templatesQuery = useTemplates()
  const yookassa = useYookassa()
  const clients = (accounts.data ?? []).filter((item) => item.status === "active" && item.conversation_id)
  const templates = templatesQuery.data ?? []
  const [conversationId, setConversationId] = useState("")
  const [amount, setAmount] = useState("1800")
  const [period, setPeriod] = useState(previousMonthValue())
  const [templateId, setTemplateId] = useState("")
  const [days, setDays] = useState("7")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const connected = yookassa.data?.connected !== false

  useEffect(() => {
    if (!conversationId && clients[0]?.conversation_id) setConversationId(clients[0].conversation_id)
  }, [clients, conversationId])

  useEffect(() => {
    if (!templateId && templates[0]) setTemplateId(templates[0].id)
  }, [templates, templateId])

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
      await queryClient.invalidateQueries({ queryKey: keys.invoicesRoot })
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
      {accounts.isError ? <p className="fail">Список клиентов не открылся</p> : null}
      <Button type="submit" tone="solid" disabled={busy || !connected || !conversationId}>
        {busy ? "Выставляем" : "Отправить в чат"}
      </Button>
    </form>
  )
}

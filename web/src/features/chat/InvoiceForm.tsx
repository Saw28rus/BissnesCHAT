import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router-dom"
import { Button } from "../../shared/ui/button/Button"
import { Field, Select } from "../../shared/ui/field/Field"
import { useTemplates } from "../money/useMoney"
import { expiresPreview, fillLetter, formatRub, periodCaption, previousMonthValue } from "../money/letter"

type Props = {
  connected: boolean
  busy: boolean
  error: string
  clientName: string
  onCancel: () => void
  onSend: (payload: { amount: string; period: string; template_id?: string; days: number }) => Promise<void>
}

export function InvoiceForm({ connected, busy, error, clientName, onCancel, onSend }: Props) {
  const [amount, setAmount] = useState("1800")
  const [period, setPeriod] = useState(previousMonthValue())
  const [days, setDays] = useState("7")
  const templatesQuery = useTemplates()
  const templates = templatesQuery.data ?? []
  const [templateId, setTemplateId] = useState("")

  useEffect(() => {
    if (!templateId && templates[0]) setTemplateId(templates[0].id)
  }, [templates, templateId])

  const template = templates.find((item) => item.id === templateId)
  const preview = useMemo(() => {
    if (!template) return ""
    return fillLetter(template.body, {
      name: clientName || "клиент",
      period: periodCaption(period),
      amount: formatRub(amount),
      url: "https://yookassa.ru/my/i/…",
      expires: expiresPreview(Number(days) || 7),
    })
  }, [template, clientName, period, amount, days])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!amount.trim()) return
    await onSend({
      amount: amount.trim(),
      period,
      template_id: templateId || undefined,
      days: Number(days) || 7,
    })
    setAmount("1800")
  }

  return (
    <form className="invoice-form" onSubmit={(event) => void submit(event)}>
      <p className="invoice-form-title">Счёт</p>
      {connected ? (
        <>
          <Field label="Период" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required />
          <Field label="Сумма, ₽" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          <Select label="Шаблон" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </Select>
          <Field label="Срок, дней" inputMode="numeric" min={1} max={30} value={days} onChange={(event) => setDays(event.target.value)} required />
          {preview ? <pre className="letter-preview">{preview}</pre> : null}
          {error ? <p className="fail">{error}</p> : null}
          <div className="row-actions">
            <Button type="submit" tone="solid" disabled={busy || !amount.trim()}>
              {busy ? "Выставляем" : "Отправить"}
            </Button>
            <Button type="button" tone="quiet" onClick={onCancel}>Отмена</Button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">Сначала подключите ЮKassa в настройках.</p>
          <div className="row-actions">
            <Link to="/admin/settings/yookassa">Открыть ЮKassa</Link>
            <Button type="button" tone="quiet" onClick={onCancel}>Закрыть</Button>
          </div>
        </>
      )}
    </form>
  )
}

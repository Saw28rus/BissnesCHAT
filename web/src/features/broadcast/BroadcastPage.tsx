import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router-dom"
import { loadAccounts, type AccountCard } from "../accounts/api"
import { ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Area } from "../../shared/ui/field/Field"
import { sendBroadcast } from "./api"
import "./broadcast.css"

export function BroadcastPage() {
  const [items, setItems] = useState<AccountCard[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [body, setBody] = useState("")
  const [error, setError] = useState("")
  const [report, setReport] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadAccounts("").then((rows) => {
      setItems(rows.filter((item) => item.status === "active"))
    }).catch(() => setError("Список кабинетов не открылся"))
  }, [])

  const allIds = items.map((item) => item.id)
  const allOn = allIds.length > 0 && allIds.every((id) => picked.includes(id))

  function toggle(id: string) {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim() || picked.length === 0) return
    setBusy(true)
    setError("")
    setReport("")
    try {
      const result = await sendBroadcast(body.trim(), picked)
      setReport(`Отправлено в ${result.sent} ${cabinets(result.sent)}${result.skipped ? `, пропущено ${result.skipped}` : ""}`)
      setBody("")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Рассылка не ушла")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="plain-page">
      <Link to="/admin/chats">К диалогам</Link>
      <h1>Рассылка</h1>
      <p className="hint">Сообщение придёт выбранным клиентам в их диалог с вами. Чужие кабинеты его не увидят.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="pick-all">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() => setPicked(allOn ? [] : allIds)}
          />
          Все активные кабинеты
        </label>
        <ul className="pick-list">
          {items.map((item) => (
            <li key={item.id}>
              <label className="pick-row">
                <input
                  type="checkbox"
                  checked={picked.includes(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span>
                  <strong>{item.display_name}</strong>
                  <small>{item.login}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {items.length === 0 ? <p className="hint">Активных кабинетов нет.</p> : null}
        <Area label="Сообщение" value={body} onChange={(event) => setBody(event.target.value)} required maxLength={4000} />
        {error ? <p className="fail">{error}</p> : null}
        {report ? <p className="hint">{report}</p> : null}
        <Button type="submit" tone="solid" disabled={busy || picked.length === 0 || !body.trim()}>
          {busy ? "Отправляем" : "Отправить"}
        </Button>
      </form>
    </section>
  )
}

function cabinets(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return "кабинет"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "кабинета"
  return "кабинетов"
}

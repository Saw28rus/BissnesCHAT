import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Field } from "../../shared/ui/field/Field"
import { connectYookassa, disconnectYookassa, loadYookassa, type YookassaStatus } from "./api"
import "./yookassa.css"

export function YookassaPage() {
  const [status, setStatus] = useState<YookassaStatus | null>(null)
  const [shopId, setShopId] = useState("")
  const [secret, setSecret] = useState("")
  const [replace, setReplace] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadYookassa().then(setStatus).catch(() => setError("Не удалось открыть ЮKassa"))
  }, [])

  async function connect(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const next = await connectYookassa(shopId.trim(), secret)
      setStatus(next)
      setSecret("")
      setReplace(false)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось подключить")
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError("")
    try {
      setStatus(await disconnectYookassa())
      setShopId("")
      setSecret("")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось отключить")
    } finally {
      setBusy(false)
    }
  }

  const connected = Boolean(status?.connected)
  const showForm = !connected || replace

  return (
    <section className="plain-page">
      <h1>ЮKassa</h1>
      <p className="hint">
        Номер магазина и секретный ключ берутся в личном кабинете ЮKassa, раздел «Интеграция».
        После подключения ключ больше не показывается.
      </p>
      {connected ? (
        <p className="ok">
          ЮKassa подключена
          {status?.shop_name ? ` · ${status.shop_name}` : ""}
          {status?.shop_id ? ` · магазин ${status.shop_id}` : ""}
          {status?.test ? " · тестовый режим" : ""}
          {status?.secret_hint ? ` · ключ ${status.secret_hint}` : ""}
        </p>
      ) : (
        <p className="hint">Магазин ещё не подключён. Счета клиентам отправить нельзя.</p>
      )}
      {status?.webhook_url ? (
        <p className="hint">
          В ЮKassa укажите HTTP-уведомления на адрес: {status.webhook_url}
        </p>
      ) : null}
      {showForm ? (
        <form onSubmit={(event) => void connect(event)} className="form-page">
          <Field
            label="Номер магазина"
            name="shop_id"
            value={shopId}
            onChange={(event) => setShopId(event.target.value)}
            autoComplete="off"
            required
          />
          <Field
            label="Секретный ключ"
            name="secret_key"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            autoComplete="new-password"
            required
            minLength={16}
          />
          {error ? <p className="fail">{error}</p> : null}
          <div className="row-actions">
            <Button type="submit" tone="solid" disabled={busy}>{busy ? "Проверяем" : "Подключить"}</Button>
            {connected ? (
              <Button type="button" tone="quiet" onClick={() => { setReplace(false); setSecret("") }}>Отмена</Button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="row-actions">
          <Button type="button" onClick={() => { setReplace(true); setShopId(status?.shop_id ?? "") }}>Заменить ключ</Button>
          <Button type="button" tone="quiet" disabled={busy} onClick={() => void disconnect()}>Отключить</Button>
        </div>
      )}
      {error && !showForm ? <p className="fail">{error}</p> : null}
      <p className="hint">
        Счёт выставляется в разделе «Деньги» или прямо в диалоге с клиентом. Письмо берётся из шаблона.
      </p>
    </section>
  )
}

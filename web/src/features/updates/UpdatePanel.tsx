import { useEffect, useState } from "react"
import { ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Confirm } from "../../shared/ui/confirm/Confirm"
import { applyUpdate, loadUpdate, type UpdateStatus } from "./api"
import { beginUpdate } from "./progress"
import "./updates.css"

function shortSha(value: string | null | undefined) {
  if (!value || value === "unknown") return "локальная сборка"
  return value.slice(0, 7)
}

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function refresh() {
    setError("")
    try {
      setStatus(await loadUpdate())
    } catch {
      setError("Не удалось проверить обновление")
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function apply() {
    setConfirm(false)
    setBusy(true)
    setError("")
    const previous = status?.current || "unknown"
    try {
      await applyUpdate()
      beginUpdate(previous)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось обновить")
    } finally {
      setBusy(false)
    }
  }

  const available = Boolean(status?.available)
  const canApply = Boolean(status?.can_apply)

  return (
    <div className="update-panel">
      <h2>Обновление</h2>
      {status ? (
        <p className="stat">
          {shortSha(status.current)}
          {status.github_ok && status.latest ? ` → ${shortSha(status.latest)}` : ""}
          {status.github_ok && !available ? " · актуальная" : ""}
          {available ? " · есть новая" : ""}
        </p>
      ) : error ? null : (
        <p className="hint">Спрашиваю GitHub…</p>
      )}
      {status && !status.github_ok ? <p className="hint">GitHub сейчас не ответил.</p> : null}
      {available && !canApply ? (
        <p className="hint">Один раз вставьте на сервере команду установки — дальше кнопка заработает.</p>
      ) : null}
      {error ? <p className="fail">{error}</p> : null}
      <div className="row-actions">
        <Button type="button" tone="quiet" disabled={busy} onClick={() => void refresh()}>
          Проверить
        </Button>
        {available && canApply ? (
          <Button type="button" tone="solid" disabled={busy} onClick={() => setConfirm(true)}>
            Обновить
          </Button>
        ) : null}
      </div>
      <Confirm
        open={confirm}
        title="Обновить кабинет?"
        text="Скачаю код с GitHub и пересоберу контейнеры. Переписка на месте. Обычно 1–2 минуты."
        confirmLabel="Обновить"
        busyLabel="Обновляю"
        busy={busy}
        onCancel={() => { if (!busy) setConfirm(false) }}
        onConfirm={() => void apply()}
      />
    </div>
  )
}

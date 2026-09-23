import { useEffect, useState } from "react"
import { ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Confirm } from "../../shared/ui/confirm/Confirm"
import { applyUpdate, loadUpdate, type UpdateStatus } from "./api"
import "./updates.css"

function shortSha(value: string | null | undefined) {
  if (!value || value === "unknown") return "локальная сборка"
  return value.slice(0, 7)
}

function when(iso: string) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForRestart(previous: string) {
  let sawDown = false
  const started = Date.now()
  while (Date.now() - started < 240000) {
    await sleep(2000)
    try {
      const response = await fetch("/api/health", { cache: "no-store" })
      if (!response.ok) {
        sawDown = true
        continue
      }
      const body = (await response.json()) as { ok?: boolean; sha?: string }
      if (!body.ok) {
        sawDown = true
        continue
      }
      if (sawDown) return true
      if (body.sha && previous && previous !== "unknown" && body.sha !== previous) return true
    } catch {
      sawDown = true
    }
  }
  return false
}

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
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
      setApplying(true)
      const restarted = await waitForRestart(previous)
      if (restarted) {
        window.location.reload()
        return
      }
      setError("Запрос ушёл, но кабинет ещё не перезапустился. Обновите страницу через минуту или снова вставьте команду установки на сервере.")
      setApplying(false)
      await refresh()
    } catch (reason) {
      setApplying(false)
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
        <>
          <p className="stat">Сейчас {shortSha(status.current)}</p>
          {status.github_ok && status.latest ? (
            <p className="stat">
              На GitHub {shortSha(status.latest)}
              {status.message ? ` · ${status.message}` : ""}
              {status.date ? ` · ${when(status.date)}` : ""}
            </p>
          ) : (
            <p className="hint">GitHub сейчас не ответил. Проверьте позже.</p>
          )}
          {status.github_ok && !available ? <p className="ok">Уже последняя версия с GitHub.</p> : null}
          {available && canApply ? (
            <p className="hint">Есть новая версия. Кабинет на минуту перестанет открываться, переписка останется.</p>
          ) : null}
          {available && !canApply ? (
            <p className="hint">
              На GitHub есть обновление. Один раз вставьте на сервере ту же команду установки — дальше кнопка заработает.
            </p>
          ) : null}
        </>
      ) : error ? null : (
        <p className="hint">Спрашиваю GitHub…</p>
      )}
      {applying ? <p className="hint">Перезапуск кабинета…</p> : null}
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
        text="Скачаю код с GitHub и пересоберу контейнеры. Переписка и кабинеты на месте. Минуту сайт может не открываться."
        confirmLabel="Обновить"
        busyLabel="Обновляю"
        busy={busy}
        onCancel={() => { if (!busy) setConfirm(false) }}
        onConfirm={() => void apply()}
      />
    </div>
  )
}

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ApiError } from "../../shared/api/client"
import { keys } from "../../shared/query/keys"
import { Button } from "../../shared/ui/button/Button"
import { Confirm } from "../../shared/ui/confirm/Confirm"
import { applyUpdate, loadUpdate } from "./api"
import { beginUpdate } from "./progress"
import "./updates.css"

function shortSha(value: string | null | undefined) {
  if (!value || value === "unknown") return "локальная сборка"
  return value.slice(0, 7)
}

export function UpdatePanel() {
  const query = useQuery({
    queryKey: keys.updates,
    queryFn: loadUpdate,
    staleTime: 60 * 1000,
  })
  const status = query.data
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [applyError, setApplyError] = useState("")

  async function apply() {
    setConfirm(false)
    setBusy(true)
    setApplyError("")
    const previous = status?.current || "unknown"
    try {
      await applyUpdate()
      beginUpdate(previous)
    } catch (reason) {
      setApplyError(reason instanceof ApiError ? reason.message : "Не удалось обновить")
    } finally {
      setBusy(false)
    }
  }

  const available = Boolean(status?.available)
  const canApply = Boolean(status?.can_apply)
  const error = applyError || (query.isError ? "Не удалось проверить обновление" : "")

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
        <Button type="button" tone="quiet" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>
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

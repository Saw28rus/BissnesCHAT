import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { api, apiBlob, ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Field } from "../../shared/ui/field/Field"
import "./backup.css"

type Status = {
  free_bytes: number
  upload_bytes: number
  uploads_blocked: boolean
  last_export_at: string | null
  reminder: boolean
}

type Preview = {
  preview_id: string
  exported_at: string
  clients: number
  messages: number
  passwords_replaced: number
  logins_skipped: number
}

function megabytes(value: number) {
  return `${Math.round(value / (1024 * 1024))} МБ`
}

export function BackupPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [password, setPassword] = useState("")
  const [includeMessages, setIncludeMessages] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [restorePassword, setRestorePassword] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [report, setReport] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    void api<Status>("/api/backup/status").then(setStatus).catch(() => setError("Статус копии не загрузился"))
  }, [])

  async function download(event: FormEvent) {
    event.preventDefault()
    setError("")
    const body = new FormData()
    body.set("password", password)
    body.set("include_messages", includeMessages ? "true" : "false")
    try {
      const blob = await apiBlob("/api/backup/export", body)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "bchat-backup.bin"
      link.click()
      URL.revokeObjectURL(url)
      setStatus(await api<Status>("/api/backup/status"))
      setReport("Файл скачан. Пароль шифрования храните отдельно: сервер его не помнит.")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось скачать копию")
    }
  }

  async function makePreview(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setError("")
    const body = new FormData()
    body.set("password", restorePassword)
    body.set("upload", file)
    try {
      setPreview(await api<Preview>("/api/backup/preview", { method: "POST", body }))
    } catch (reason) {
      setPreview(null)
      setError(reason instanceof ApiError ? reason.message : "Копия не открылась")
    }
  }

  async function restore() {
    if (!preview) return
    setError("")
    try {
      const result = await api<{ created: number; updated: number; skipped: number; messages: number }>(
        "/api/backup/restore",
        { method: "POST", json: { preview_id: preview.preview_id } },
      )
      setReport(`Создано ${result.created}, обновлено ${result.updated}, пропущено ${result.skipped}, писем ${result.messages}.`)
      setPreview(null)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Восстановление не выполнено")
    }
  }

  return (
    <section className="plain-page backup-grid">
      <h1>Резервная копия</h1>
      <p className="hint">В файле кабинеты, настройки и, если включено, текст за последние сутки. Голосовых и документов там нет.</p>
      {status ? (
        <p className="stat">
          Файлы занимают {megabytes(status.upload_bytes)}. Свободно {megabytes(status.free_bytes)}.
          {status.uploads_blocked ? " Загрузка остановлена." : ""}
        </p>
      ) : null}
      <form onSubmit={download} className="backup-grid">
        <Field label="Пароль файла, от 12 символов" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} />
        <label className="hint">
          <input type="checkbox" checked={includeMessages} onChange={(event) => setIncludeMessages(event.target.checked)} />
          {" "}включить текстовые сообщения за последние сутки
        </label>
        <Button tone="solid" type="submit">Скачать копию</Button>
      </form>
      <form onSubmit={makePreview} className="backup-grid">
        <h2>Восстановление</h2>
        <Field label="Пароль файла" type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} required />
        <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <Button type="submit">Показать состав</Button>
      </form>
      {preview ? (
        <div>
          <p>Кабинетов: {preview.clients}. Текстовых писем: {preview.messages}. Пропусков логина: {preview.logins_skipped}.</p>
          {preview.passwords_replaced > 0 ? <p className="fail">Пароли {preview.passwords_replaced} существующих кабинетов будут заменены данными из файла.</p> : null}
          <Button tone="solid" type="button" onClick={() => void restore()}>Восстановить</Button>
        </div>
      ) : null}
      {report ? <p className="hint">{report}</p> : null}
      {error ? <p className="fail">{error}</p> : null}
    </section>
  )
}

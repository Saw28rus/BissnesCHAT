import { useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router-dom"
import { useSession } from "../../app/session"
import { api, ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Field } from "../../shared/ui/field/Field"
import { applyThemeColor } from "../../shared/theme/color"
import { persistNotifications, requestBrowserPermission } from "../pwa/notify"
import "./settings.css"

export function SettingsPage({ nested = false }: { nested?: boolean }) {
  const { profile, refresh } = useSession()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState("")

  async function setTheme(theme: "light" | "dark") {
    await api("/api/auth/settings", { method: "PATCH", json: { theme } })
    document.documentElement.dataset.theme = theme
    localStorage.setItem("bchat-theme", theme)
    applyThemeColor(theme)
    await refresh()
  }

  async function setNotifications(enabled: boolean) {
    if (enabled) {
      const granted = await requestBrowserPermission(true)
      if (!granted) {
        setError("Браузер не разрешил уведомления")
        return
      }
    }
    await persistNotifications(enabled)
    await refresh()
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setError("")
    try {
      await api("/api/auth/password", { method: "POST", json: { current_password: current, new_password: next } })
      window.location.href = "/login"
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Пароль не изменён")
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  if (!profile) return null

  return (
    <section className={nested ? "settings-block" : "plain-page"}>
      {nested ? null : <Link to={profile.role === "admin" ? "/admin/settings" : "/"}>Назад</Link>}
      {nested ? <h2>Кабинет</h2> : <h1>Настройки</h1>}
      <p>{profile.display_name}</p>
      <div className="row-actions">
        <Button type="button" tone={profile.theme === "light" ? "solid" : "line"} onClick={() => void setTheme("light")}>Светлая</Button>
        <Button type="button" tone={profile.theme === "dark" ? "solid" : "line"} onClick={() => void setTheme("dark")}>Тёмная</Button>
      </div>
      <label className="switch">
        <input
          type="checkbox"
          checked={profile.notifications_enabled}
          onChange={(event) => void setNotifications(event.target.checked)}
        />
        Локальные уведомления, пока приложение открыто
      </label>
      <p className="hint">На iPhone уведомление из вкладки ненадёжно.</p>
      {profile.role === "admin" ? (
        <form onSubmit={changePassword} className="form-page">
          <h2>Пароль администратора</h2>
          <Field label="Текущий пароль" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
          <Field label="Новый пароль" type="password" value={next} onChange={(event) => setNext(event.target.value)} required minLength={10} />
          <Button type="submit">Сменить пароль</Button>
        </form>
      ) : null}
      {error ? <p className="fail">{error}</p> : null}
      <Button type="button" onClick={() => void logout()}>Выход</Button>
    </section>
  )
}

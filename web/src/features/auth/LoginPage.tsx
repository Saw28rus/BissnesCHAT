import { useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { api, ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Field } from "../../shared/ui/field/Field"
import type { Profile } from "../../app/session"
import { canAskNotifications, requestBrowserPermission } from "../pwa/notify"
import "./login.css"

export function LoginPage() {
  const navigate = useNavigate()
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    const notify = canAskNotifications() ? requestBrowserPermission() : Promise.resolve(true)
    try {
      const profile = await api<Profile>("/api/auth/login", { method: "POST", json: { login, password } })
      await notify
      localStorage.setItem("bchat-theme", profile.theme)
      document.documentElement.dataset.theme = profile.theme
      navigate(profile.role === "admin" ? "/admin" : "/", { replace: true })
      window.location.reload()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось войти")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="gate">
      <section className="gate-brand">
        <p className="eyebrow">Закрытая переписка</p>
        <h1>Бизнес<br />ЧАТ</h1>
        <p>Кабинет выдаёт администратор. Самостоятельной регистрации нет.</p>
      </section>
      <form onSubmit={onSubmit}>
        <Field label="Логин" name="login" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} required />
        <Field label="Пароль" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error ? <p className="fail">{error}</p> : null}
        <Button tone="solid" type="submit" disabled={pending}>{pending ? "Входим" : "Войти"}</Button>
      </form>
    </main>
  )
}

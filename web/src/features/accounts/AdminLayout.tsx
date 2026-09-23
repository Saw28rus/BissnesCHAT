import { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import { api } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { AccountList } from "./AccountList"
import "./accounts.css"

export function AdminLayout() {
  const location = useLocation()
  const chatOpen = location.pathname.startsWith("/admin/chat/")
  const desk = location.pathname === "/admin" || chatOpen
  const [reminder, setReminder] = useState(false)

  useEffect(() => {
    void api<{ reminder: boolean }>("/api/backup/status").then((status) => setReminder(status.reminder)).catch(() => setReminder(false))
  }, [])

  async function logout() {
    await api("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/admin">Бизнес ЧАТ</Link>
        <nav className="nav">
          <NavLink to="/admin" end>Клиенты</NavLink>
          <NavLink to="/admin/backup">Копия</NavLink>
          <NavLink to="/admin/audit">Журнал</NavLink>
          <NavLink to="/settings">Настройки</NavLink>
          <Button type="button" tone="quiet" onClick={() => void logout()}>Выход</Button>
        </nav>
      </header>
      {reminder ? <p className="banner">Резервную копию не скачивали больше 7 дней.</p> : null}
      {desk ? (
        <div className={`workspace ${chatOpen ? "chat-open" : ""}`}>
          <AccountList />
          <div className="desk">
            <Outlet />
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  )
}

import { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import { api } from "../../shared/api/client"
import "./admin-shell.css"

const ITEMS = [
  { to: "/admin/chats", label: "Чаты", icon: IconChats },
  { to: "/admin/clients", label: "Клиенты", icon: IconClients },
  { to: "/admin/money", label: "Деньги", icon: IconMoney },
  { to: "/admin/settings", label: "Настройки", icon: IconSettings },
]

function chatOpenPath(pathname: string) {
  const match = pathname.match(/^\/admin\/chats\/([^/]+)$/)
  return Boolean(match && match[1] !== "broadcast")
}

export function AdminLayout() {
  const location = useLocation()
  const chatOpen = chatOpenPath(location.pathname)
  const desk = location.pathname.startsWith("/admin/chats") && !location.pathname.startsWith("/admin/chats/broadcast")
  const [reminder, setReminder] = useState(false)
  const [pressed, setPressed] = useState<string | null>(null)

  useEffect(() => {
    void api<{ reminder: boolean }>("/api/backup/status")
      .then((status) => setReminder(status.reminder))
      .catch(() => setReminder(false))
  }, [])

  return (
    <div className={`shell ${chatOpen ? "chat-open" : ""} ${desk ? "desk-mode" : ""}`}>
      <header className="topbar">
        <Link className="brand" to="/admin/chats">Бизнес ЧАТ</Link>
      </header>
      {reminder ? <p className="banner">Резервную копию не скачивали больше 7 дней.</p> : null}
      <div className="shell-body">
        <Outlet />
      </div>
      <nav className="dock" aria-label="Разделы кабинета">
        {ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `dock-item${isActive ? " active" : ""}${pressed === item.to ? " pressed" : ""}`}
              onPointerDown={() => setPressed(item.to)}
              onPointerUp={() => setPressed(null)}
              onPointerCancel={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
            >
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}

function IconChats() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        d="M5 16.2V8.2A2.2 2.2 0 0 1 7.2 6h9.6A2.2 2.2 0 0 1 19 8.2v6.1a2.2 2.2 0 0 1-2.2 2.2H9.2L5 19.5v-3.3z"
      />
    </svg>
  )
}

function IconClients() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M6 19c.9-3.1 3.2-4.7 6-4.7s5.1 1.6 6 4.7" />
    </svg>
  )
}

function IconMoney() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6.5" width="17" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"
      />
    </svg>
  )
}

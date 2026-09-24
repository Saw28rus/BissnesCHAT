import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api } from "../../shared/api/client"
import { SettingsPage } from "./SettingsPage"
import { UpdatePanel } from "../updates/UpdatePanel"
import "./settings.css"

export function SettingsHub() {
  const [reminder, setReminder] = useState(false)

  useEffect(() => {
    void api<{ reminder: boolean }>("/api/backup/status")
      .then((status) => setReminder(status.reminder))
      .catch(() => setReminder(false))
  }, [])

  return (
    <section className="settings-hub">
      <h1>Настройки</h1>
      <UpdatePanel />
      <div className="hub-grid">
        <Link className="hub-card" to="/admin/settings/yookassa">
          <strong>ЮKassa</strong>
          <small>Магазин и счета</small>
        </Link>
        <Link className="hub-card" to="/admin/settings/backup">
          <strong>Копия</strong>
          <small>{reminder ? "Пора скачать недельную копию" : "Недельная копия и восстановление"}</small>
        </Link>
        <Link className="hub-card" to="/admin/settings/audit">
          <strong>Журнал</strong>
          <small>Действия в кабинете</small>
        </Link>
      </div>
      <SettingsPage nested />
    </section>
  )
}

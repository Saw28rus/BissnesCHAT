import { Link } from "react-router-dom"
import { SettingsPage } from "./SettingsPage"
import { UpdatePanel } from "../updates/UpdatePanel"
import { useBackupStatus } from "../backup/useBackupStatus"
import "./settings.css"

export function SettingsHub() {
  const { data } = useBackupStatus()
  const reminder = Boolean(data?.reminder)

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

import { Link } from "react-router-dom"
import { SettingsPage } from "./SettingsPage"
import "./settings.css"

export function SettingsHub() {
  return (
    <section className="settings-hub">
      <h1>Настройки</h1>
      <div className="hub-grid">
        <Link className="hub-card" to="/admin/settings/yookassa">
          <strong>ЮKassa</strong>
          <small>Магазин, секретный ключ, уведомления об оплате</small>
        </Link>
        <Link className="hub-card" to="/admin/settings/backup">
          <strong>Копия</strong>
          <small>Скачать недельную копию или восстановить кабинеты</small>
        </Link>
        <Link className="hub-card" to="/admin/settings/audit">
          <strong>Журнал</strong>
          <small>Кто создал кабинет, выставил счёт, скачал копию</small>
        </Link>
      </div>
      <SettingsPage nested />
    </section>
  )
}

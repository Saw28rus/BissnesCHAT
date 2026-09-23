import { useEffect, useState } from "react"
import { api } from "../../shared/api/client"
import "./audit.css"

type Row = { id: string; action: string; target_id: string | null; created_at: string }

const LABEL: Record<string, string> = {
  "account.create": "Создан кабинет",
  "account.update": "Изменён кабинет",
  "account.password": "Сменён пароль клиента",
  "account.revoke_sessions": "Завершены сеансы",
  "account.block": "Кабинет заблокирован",
  "account.unblock": "Кабинет открыт",
  "account.delete": "Кабинет удалён",
  "backup.export": "Скачана копия",
  "backup.restore": "Восстановлена копия",
  "admin.password": "Сменён пароль администратора",
  "yookassa.connect": "Подключена ЮKassa",
  "yookassa.disconnect": "Отключена ЮKassa",
  "invoice.create": "Выставлен счёт",
  "invoice.template": "Изменён шаблон счёта",
  "invoice.delete": "Счёт убран",
  "broadcast.send": "Отправлена рассылка",
}

export function AuditPage() {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    void api<Row[]>("/api/audit").then(setRows)
  }, [])
  return (
    <section className="plain-page">
      <h1>Журнал</h1>
      <ul className="audit-list">
        {rows.map((row) => (
          <li key={row.id}>
            {new Date(row.created_at).toLocaleString("ru")} — {LABEL[row.action] ?? row.action}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="hint">Записей пока нет.</p> : null}
    </section>
  )
}

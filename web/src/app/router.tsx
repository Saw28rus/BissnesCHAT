import { useEffect, useState, type ReactNode } from "react"
import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { useSession } from "./session"
import { LoginPage } from "../features/auth/LoginPage"
import { ChatPage } from "../features/chat/ChatPage"
import { AdminLayout } from "../features/accounts/AdminLayout"
import { loadAccounts } from "../features/accounts/api"
import { AccountForm } from "../features/accounts/AccountForm"
import { BackupPage } from "../features/backup/BackupPage"
import { AuditPage } from "../features/audit/AuditPage"
import { SettingsPage } from "../features/settings/SettingsPage"

function Gate({ children }: { children: ReactNode }) {
  const { profile, ready } = useSession()
  if (!ready) return <p className="hint gate-wait">Открываем кабинет</p>
  if (!profile) return <Navigate to="/login" replace />
  return children
}

function Home() {
  const { profile } = useSession()
  if (!profile) return null
  if (profile.role === "admin") return <Navigate to="/admin" replace />
  if (!profile.conversation_id) return <p className="fail">Диалог не найден</p>
  return <ChatPage conversationId={profile.conversation_id} title="Администратор" />
}

function AdminChat() {
  const { conversationId } = useParams()
  const [title, setTitle] = useState("Клиент")
  useEffect(() => {
    if (!conversationId) return
    void loadAccounts("").then((items) => {
      const found = items.find((item) => item.conversation_id === conversationId)
      if (found) setTitle(found.display_name)
    }).catch(() => undefined)
  }, [conversationId])
  if (!conversationId) return null
  return <ChatPage conversationId={conversationId} title={title} backTo="/admin" />
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { profile } = useSession()
  if (profile?.role !== "admin") return <Navigate to="/" replace />
  return children
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Gate><Home /></Gate>} />
      <Route path="/settings" element={<Gate><SettingsPage /></Gate>} />
      <Route path="/admin" element={<Gate><AdminOnly><AdminLayout /></AdminOnly></Gate>}>
        <Route index element={<p className="hint form-page">Выберите клиента слева или создайте кабинет.</p>} />
        <Route path="chat/:conversationId" element={<AdminChat />} />
        <Route path="accounts/new" element={<AccountForm />} />
        <Route path="accounts/:accountId" element={<AccountForm />} />
        <Route path="backup" element={<BackupPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
    </Routes>
  )
}

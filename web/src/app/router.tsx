import { type ReactNode } from "react"
import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { useSession } from "./session"
import { LoginPage } from "../features/auth/LoginPage"
import { ChatPage } from "../features/chat/ChatPage"
import { AdminLayout } from "../features/admin-shell/AdminLayout"
import { ChatDesk } from "../features/chats/ChatDesk"
import { useAccounts } from "../features/accounts/useAccounts"
import { AccountForm } from "../features/accounts/AccountForm"
import { ClientCards } from "../features/accounts/ClientCards"
import { BackupPage } from "../features/backup/BackupPage"
import { BroadcastPage } from "../features/broadcast/BroadcastPage"
import { AuditPage } from "../features/audit/AuditPage"
import { SettingsPage } from "../features/settings/SettingsPage"
import { SettingsHub } from "../features/settings/SettingsHub"
import { YookassaPage } from "../features/yookassa/YookassaPage"
import { MoneyPage } from "../features/money/MoneyPage"
import { InvoiceCreatePage } from "../features/money/InvoiceCreatePage"
import { TemplatesPage } from "../features/money/TemplatesPage"

function Gate({ children }: { children: ReactNode }) {
  const { profile, ready } = useSession()
  if (!ready) return <p className="hint gate-wait">Открываем кабинет</p>
  if (!profile) return <Navigate to="/login" replace />
  return children
}

function Home() {
  const { profile } = useSession()
  if (!profile) return null
  if (profile.role === "admin") return <Navigate to="/admin/chats" replace />
  if (!profile.conversation_id) return <p className="fail">Диалог не найден</p>
  return <ChatPage conversationId={profile.conversation_id} title="Админ" />
}

function AdminChat() {
  const { conversationId } = useParams()
  const { data } = useAccounts()
  const client = data?.find((item) => item.conversation_id === conversationId)
  if (!conversationId) return null
  return (
    <ChatPage
      key={conversationId}
      conversationId={conversationId}
      title={client?.display_name || "Клиент"}
      backTo="/admin/chats"
      client={client ? { id: client.id, edo_id: client.edo_id } : undefined}
    />
  )
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { profile } = useSession()
  if (profile?.role !== "admin") return <Navigate to="/" replace />
  return children
}

function RedirectChat() {
  const { conversationId } = useParams()
  return <Navigate to={`/admin/chats/${conversationId}`} replace />
}

function RedirectClient() {
  const { accountId } = useParams()
  return <Navigate to={`/admin/clients/${accountId}`} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Gate><Home /></Gate>} />
      <Route path="/settings" element={<Gate><SettingsPage /></Gate>} />
      <Route path="/admin" element={<Gate><AdminOnly><AdminLayout /></AdminOnly></Gate>}>
        <Route index element={<Navigate to="chats" replace />} />
        <Route path="chats" element={<ChatDesk />}>
          <Route index element={<p className="hint form-page">Выберите диалог.</p>} />
          <Route path="broadcast" element={<BroadcastPage />} />
          <Route path=":conversationId" element={<AdminChat />} />
        </Route>
        <Route path="clients" element={<ClientCards />} />
        <Route path="clients/new" element={<AccountForm />} />
        <Route path="clients/:accountId" element={<AccountForm />} />
        <Route path="money" element={<MoneyPage />} />
        <Route path="money/new" element={<InvoiceCreatePage />} />
        <Route path="money/templates" element={<TemplatesPage />} />
        <Route path="settings" element={<SettingsHub />} />
        <Route path="settings/yookassa" element={<YookassaPage />} />
        <Route path="settings/backup" element={<BackupPage />} />
        <Route path="settings/audit" element={<AuditPage />} />
        <Route path="chat/:conversationId" element={<RedirectChat />} />
        <Route path="accounts/new" element={<Navigate to="/admin/clients/new" replace />} />
        <Route path="accounts/:accountId" element={<RedirectClient />} />
        <Route path="backup" element={<Navigate to="/admin/settings/backup" replace />} />
        <Route path="yookassa" element={<Navigate to="/admin/settings/yookassa" replace />} />
        <Route path="broadcast" element={<Navigate to="/admin/chats/broadcast" replace />} />
        <Route path="audit" element={<Navigate to="/admin/settings/audit" replace />} />
      </Route>
    </Routes>
  )
}

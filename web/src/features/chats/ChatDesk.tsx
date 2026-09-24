import { NavLink, Outlet, useLocation, useParams } from "react-router-dom"
import { ChatList } from "./ChatList"
import "./chats.css"

export function ChatDesk() {
  const { conversationId } = useParams()
  const location = useLocation()
  const broadcast = location.pathname.startsWith("/admin/chats/broadcast")
  const chatOpen = Boolean(conversationId) && conversationId !== "broadcast"

  return (
    <div className="chat-desk">
      {chatOpen ? null : (
        <nav className="desk-tabs" aria-label="Чаты">
          <NavLink to="/admin/chats" end className={({ isActive }) => isActive ? "active" : ""}>Диалоги</NavLink>
          <NavLink to="/admin/chats/broadcast" className={({ isActive }) => isActive ? "active" : ""}>Рассылка</NavLink>
        </nav>
      )}
      {broadcast ? (
        <div className="chat-desk-body">
          <Outlet />
        </div>
      ) : (
        <div className={`workspace ${chatOpen ? "chat-open" : ""}`}>
          <ChatList />
          <div className="desk">
            <Outlet />
          </div>
        </div>
      )}
    </div>
  )
}

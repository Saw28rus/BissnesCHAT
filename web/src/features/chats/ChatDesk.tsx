import { Outlet, useParams } from "react-router-dom"
import { ChatList } from "./ChatList"
import "./chats.css"

export function ChatDesk() {
  const { conversationId } = useParams()
  return (
    <div className={`workspace ${conversationId ? "chat-open" : ""}`}>
      <ChatList />
      <div className="desk">
        <Outlet />
      </div>
    </div>
  )
}

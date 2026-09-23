import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { api } from "../shared/api/client"
import { applyThemeColor } from "../shared/theme/color"
import { useChatSocket, type SocketEvent } from "../features/chat/useSocket"

export type Profile = {
  id: string
  login: string
  role: "admin" | "client"
  display_name: string
  theme: "light" | "dark"
  notifications_enabled: boolean
  conversation_id: string | null
}

type Listener = (event: SocketEvent) => void

type SessionValue = {
  profile: Profile | null
  ready: boolean
  link: "offline" | "live" | "connecting"
  refresh: () => Promise<void>
  subscribe: (listener: Listener) => () => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const listeners = useRef(new Set<Listener>())

  async function refresh() {
    try {
      const next = await api<Profile>("/api/auth/me")
      setProfile(next)
      document.documentElement.dataset.theme = next.theme
      localStorage.setItem("bchat-theme", next.theme)
      applyThemeColor(next.theme)
    } catch {
      setProfile(null)
    } finally {
      setReady(true)
    }
  }

  useEffect(() => {
    void refresh()
    const onLost = () => setProfile(null)
    window.addEventListener("bchat:unauthorized", onLost)
    return () => window.removeEventListener("bchat:unauthorized", onLost)
  }, [])

  const link = useChatSocket(Boolean(profile), (event) => {
    listeners.current.forEach((listener) => listener(event))
  })

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      profile,
      ready,
      link,
      refresh,
      subscribe,
    }),
    [profile, ready, link, subscribe],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error("session")
  return value
}

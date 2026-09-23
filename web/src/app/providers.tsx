import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import type { ReactNode } from "react"
import { BrowserRouter } from "react-router-dom"
import { SessionProvider } from "./session"

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
}

import { QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import type { ReactNode } from "react"
import { BrowserRouter } from "react-router-dom"
import { makeQueryClient } from "../shared/query/client"
import { LiveCache } from "./LiveCache"
import { SessionProvider } from "./session"

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient)
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <LiveCache />
        <BrowserRouter>{children}</BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
}

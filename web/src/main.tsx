import "@fontsource/golos-text/400.css"
import "@fontsource/golos-text/500.css"
import "@fontsource/golos-text/600.css"
import "@fontsource/golos-text/700.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { registerSW } from "virtual:pwa-register"
import { Providers } from "./app/providers"
import { AppRouter } from "./app/router"
import { applyThemeColor } from "./shared/theme/color"
import { bindVisualViewport } from "./shared/viewport/fit"
import "./shared/styles/tokens.css"
import "./shared/styles/light.css"
import "./shared/styles/dark.css"
import "./shared/styles/base.css"
import "./features/accounts/accounts.css"

const stored = localStorage.getItem("bchat-theme")
if (stored === "light" || stored === "dark") {
  document.documentElement.dataset.theme = stored
  applyThemeColor(stored)
}
bindVisualViewport()

registerSW({ immediate: true })

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
)

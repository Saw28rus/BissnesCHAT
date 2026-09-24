import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Бизнес ЧАТ",
        short_name: "Бизнес ЧАТ",
        lang: "ru",
        start_url: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#f4f5f2",
        theme_color: "#f4f5f2",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        runtimeCaching: [],
        globPatterns: ["**/*.{js,css,html,svg,woff,woff2,png,webmanifest}"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8010",
      "/ws": { target: "ws://127.0.0.1:8010", ws: true },
    },
  },
})

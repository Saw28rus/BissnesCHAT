export function bindVisualViewport() {
  const root = document.documentElement
  const apply = () => {
    const viewport = window.visualViewport
    if (!viewport) return
    root.style.setProperty("--vv-height", `${viewport.height}px`)
    root.style.setProperty("--vv-top", `${viewport.offsetTop}px`)
  }
  apply()
  window.visualViewport?.addEventListener("resize", apply)
  window.visualViewport?.addEventListener("scroll", apply)
  window.addEventListener("orientationchange", apply)
}

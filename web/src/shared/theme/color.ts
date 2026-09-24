export function applyThemeColor(theme: string) {
  const color = theme === "dark" ? "#141716" : "#f4f5f2"
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color)
}

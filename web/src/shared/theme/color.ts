export function applyThemeColor(theme: string) {
  const color = theme === "dark" ? "#141311" : "#f3efe6"
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color)
}

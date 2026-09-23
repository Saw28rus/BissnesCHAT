const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]

export function previousMonthValue() {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export function periodCaption(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const month = Number(value.slice(5, 7))
    if (month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${value.slice(0, 4)}`
  }
  return value
}

export function formatRub(raw: string) {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".")
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return raw || "0 ₽"
  const [whole, frac] = value.toFixed(2).split(".")
  const grouped = Number(whole).toLocaleString("ru-RU")
  return frac === "00" ? `${grouped} ₽` : `${grouped},${frac} ₽`
}

export function fillLetter(body: string, values: Record<string, string>) {
  let result = body
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, value)
  }
  return result
}

export function expiresPreview(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

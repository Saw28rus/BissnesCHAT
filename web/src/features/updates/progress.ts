const KEY = "bchat-updating"
const EVENT = "bchat:updating"

export type UpdateRun = {
  started: number
  previous: string
}

export function beginUpdate(previous: string) {
  const run: UpdateRun = { started: Date.now(), previous }
  sessionStorage.setItem(KEY, JSON.stringify(run))
  window.dispatchEvent(new Event(EVENT))
}

export function endUpdate() {
  sessionStorage.removeItem(KEY)
  window.dispatchEvent(new Event(EVENT))
}

export function readUpdate(): UpdateRun | null {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as UpdateRun
    if (!parsed.started || !parsed.previous) return null
    return parsed
  } catch {
    return null
  }
}

export function onUpdateChange(handler: () => void) {
  window.addEventListener(EVENT, handler)
  window.addEventListener("storage", handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener("storage", handler)
  }
}

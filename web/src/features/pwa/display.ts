export type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone) return true
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches
}

export function isIos() {
  const agent = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(agent)) return true
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

export function isIosSafari() {
  if (!isIos()) return false
  return !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent)
}

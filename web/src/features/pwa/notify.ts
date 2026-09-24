import { api } from "../../shared/api/client"
import { isIos, isStandalone } from "./display"

export function notificationSupported() {
  return typeof Notification === "function"
}

export function canAskNotifications() {
  if (!notificationSupported()) return false
  if (isIos() && !isStandalone()) return false
  return true
}

export function notificationState() {
  if (!notificationSupported()) return "unsupported"
  return Notification.permission
}

export async function requestBrowserPermission(force = false) {
  if (!notificationSupported()) return false
  if (!force && !canAskNotifications()) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission !== "default") return false
  return (await Notification.requestPermission()) === "granted"
}

export async function persistNotifications(enabled: boolean) {
  await api("/api/auth/settings", { method: "PATCH", json: { notifications_enabled: enabled } })
}

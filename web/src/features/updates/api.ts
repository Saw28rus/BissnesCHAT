import { api } from "../../shared/api/client"

export type UpdateStatus = {
  current: string
  latest: string | null
  message: string
  date: string
  available: boolean
  can_apply: boolean
  github_ok: boolean
}

export function loadUpdate() {
  return api<UpdateStatus>("/api/updates")
}

export function applyUpdate() {
  return api<{ ok: boolean; current: string; latest: string | null }>("/api/updates/apply", {
    method: "POST",
  })
}

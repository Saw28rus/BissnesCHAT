import { api } from "../../shared/api/client"

export function sendBroadcast(body: string, accountIds: string[]) {
  return api<{ sent: number; skipped: number }>("/api/broadcast", {
    method: "POST",
    json: { body, account_ids: accountIds },
  })
}

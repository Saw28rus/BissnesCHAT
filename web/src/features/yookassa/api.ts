import { api } from "../../shared/api/client"

export type YookassaStatus = {
  connected: boolean
  webhook_url: string
  shop_id?: string
  shop_name?: string | null
  test?: boolean
  secret_hint?: string
}

export function loadYookassa() {
  return api<YookassaStatus>("/api/yookassa")
}

export function connectYookassa(shopId: string, secretKey: string) {
  return api<YookassaStatus>("/api/yookassa/connect", {
    method: "POST",
    json: { shop_id: shopId, secret_key: secretKey },
  })
}

export function disconnectYookassa() {
  return api<YookassaStatus>("/api/yookassa/disconnect", { method: "POST" })
}

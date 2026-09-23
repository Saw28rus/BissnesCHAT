import { errorText } from "./errors"

let csrfToken = ""

async function readToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { credentials: "include" })
  if (!response.ok) throw new Error("csrf")
  const body = (await response.json()) as { token: string }
  csrfToken = body.token
  return csrfToken
}

export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string) {
    super(errorText(code))
    this.status = status
    this.code = code
  }
}

type Options = {
  method?: string
  json?: unknown
  body?: FormData
}

export async function api<T>(path: string, options: Options = {}, retry = true): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase()
  const headers = new Headers()
  if (method !== "GET" && method !== "HEAD") {
    headers.set("X-CSRF-Token", csrfToken || (await readToken()))
  }
  let body: BodyInit | undefined
  if (options.body) {
    body = options.body
  } else if (options.json !== undefined) {
    headers.set("Content-Type", "application/json")
    body = JSON.stringify(options.json)
  }
  const response = await fetch(path, { method, headers, body, credentials: "include" })
  if (response.status === 403 && retry) {
    const payload = await response.clone().json().catch(() => ({}))
    if (payload.error === "csrf") {
      csrfToken = ""
      await readToken()
      return api<T>(path, options, false)
    }
  }
  if (response.status === 401) {
    csrfToken = ""
    window.dispatchEvent(new Event("bchat:unauthorized"))
  }
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, payload.error ?? "server_error")
  return payload as T
}

export async function apiBlob(path: string, body: FormData): Promise<Blob> {
  const headers = new Headers({ "X-CSRF-Token": csrfToken || (await readToken()) })
  const response = await fetch(path, { method: "POST", headers, body, credentials: "include" })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(response.status, payload.error ?? "server_error")
  }
  return response.blob()
}

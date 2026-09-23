import { useState } from "react"
import "./copy.css"

type Props = {
  label: string
  value: string | null | undefined
}

export function CopyButton({ label, value }: Props) {
  const [done, setDone] = useState(false)
  const empty = !value

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      window.setTimeout(() => setDone(false), 1400)
    } catch {
      setDone(false)
    }
  }

  return (
    <button type="button" className={`copy-chip ${done ? "done" : ""} ${empty ? "empty" : ""}`} onClick={() => void copy()} disabled={empty}>
      <small>{label}</small>
      <strong>{done ? "Скопировано" : value || "нет"}</strong>
    </button>
  )
}

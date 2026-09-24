import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"
import "./field.css"

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; compact?: boolean }

export function Field({ label, compact = false, ...props }: Props) {
  return (
    <label className={`field${compact ? " compact" : ""}`}>
      <span className={compact ? "sr-only" : undefined}>{label}</span>
      <input {...props} />
    </label>
  )
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }

export function Area({ label, ...props }: AreaProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea {...props} />
    </label>
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string }

export function Select({ label, children, ...props }: SelectProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>{children}</select>
    </label>
  )
}

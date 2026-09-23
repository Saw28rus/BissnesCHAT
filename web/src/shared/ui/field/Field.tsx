import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react"
import "./field.css"

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string }

export function Field({ label, ...props }: Props) {
  return (
    <label className="field">
      <span>{label}</span>
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

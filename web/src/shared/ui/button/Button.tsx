import type { ButtonHTMLAttributes } from "react"
import "./button.css"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "line" | "solid" | "quiet"
}

export function Button({ tone = "line", className = "", ...props }: Props) {
  const toneClass = tone === "solid" ? "solid" : tone === "quiet" ? "quiet" : ""
  return <button className={`btn ${toneClass} ${className}`.trim()} {...props} />
}

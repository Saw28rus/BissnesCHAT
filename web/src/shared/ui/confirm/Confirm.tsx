import { useEffect, useRef } from "react"
import { Button } from "../button/Button"
import "./confirm.css"

type Props = {
  open: boolean
  title: string
  text: string
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function Confirm({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel = "Отмена",
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const box = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const node = box.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  return (
    <dialog
      ref={box}
      className="confirm"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="confirm-actions">
        <Button type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
        <Button type="button" tone="solid" disabled={busy} onClick={onConfirm}>
          {busy ? "Удаляем" : confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}

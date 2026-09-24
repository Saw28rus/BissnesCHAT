import { useEffect, useRef, useState } from "react"
import type { FormEvent, PointerEvent } from "react"
import type { ChatMessage } from "./useSocket"
import { prepareUpload } from "./photo"

type Props = {
  reply: ChatMessage | null
  editing: ChatMessage | null
  onCancelReply: () => void
  onCancelEdit: () => void
  onSendText: (body: string) => Promise<void>
  onSendFile: (file: File) => Promise<void>
  onSendVoice: (file: File, durationSec: number) => Promise<void>
  onEdit: (body: string) => Promise<void>
  onInvoice?: () => void
}

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

function fitArea(node: HTMLTextAreaElement | null) {
  if (!node) return
  node.style.height = "auto"
  node.style.height = `${Math.min(node.scrollHeight, 140)}px`
}

export function Composer({ reply, editing, onCancelReply, onCancelEdit, onSendText, onSendFile, onSendVoice, onEdit, onInvoice }: Props) {
  const [text, setText] = useState("")
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const cancel = useRef(false)
  const holding = useRef(false)
  const startX = useRef(0)
  const willCancelRef = useRef(false)
  const lockTimer = useRef(0)
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [willCancel, setWillCancel] = useState(false)
  const canSend = Boolean(text.trim()) && !recording

  useEffect(() => {
    setText(editing ? editing.body : "")
  }, [editing])

  useEffect(() => {
    fitArea(areaRef.current)
  }, [text, recording])

  useEffect(() => {
    if (!recording) {
      setElapsed(0)
      return
    }
    const tick = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started.current) / 1000))
    }, 200)
    return () => window.clearInterval(tick)
  }, [recording])

  useEffect(() => () => {
    cancel.current = true
    holding.current = false
    window.clearTimeout(lockTimer.current)
    recorder.current?.stop()
  }, [])

  function focusField() {
    areaRef.current?.focus()
  }

  function keepKeyboard(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    focusField()
    event.currentTarget.form?.requestSubmit()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const body = text.trim()
    if (!body || recording || sending.current) return
    sending.current = true
    setBusy(true)
    setError("")
    setText("")
    focusField()
    try {
      if (editing) await onEdit(body)
      else await onSendText(body)
    } catch (reason) {
      setText(body)
      setError(reason instanceof Error ? reason.message : "Не отправилось")
    } finally {
      sending.current = false
      setBusy(false)
      const active = document.activeElement
      if (active === areaRef.current || (active instanceof HTMLElement && active.closest(".composer-shell"))) {
        focusField()
      }
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError("")
    try {
      await onSendFile(await prepareUpload(file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Файл не ушёл")
    }
  }

  function armCancel(next: boolean) {
    if (willCancelRef.current === next) return
    willCancelRef.current = next
    setWillCancel(next)
  }

  function finishHold(discard: boolean) {
    holding.current = false
    willCancelRef.current = false
    setWillCancel(false)
    const media = recorder.current
    if (!media || media.state === "inactive") return
    cancel.current = discard
    media.stop()
  }

  async function onRecDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || recording || holding.current || canSend || busy || editing) return
    event.preventDefault()
    holding.current = true
    startX.current = event.clientX
    willCancelRef.current = false
    setWillCancel(false)
    setError("")
    event.currentTarget.setPointerCapture(event.pointerId)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!holding.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4"
      const media = new MediaRecorder(stream, { mimeType: mime })
      chunks.current = []
      cancel.current = false
      started.current = Date.now()
      media.ondataavailable = (chunk) => {
        if (chunk.data.size) chunks.current.push(chunk.data)
      }
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        recorder.current = null
        setRecording(false)
        window.clearTimeout(lockTimer.current)
        const duration = Math.round((Date.now() - started.current) / 1000)
        if (cancel.current) return
        if (duration < 1) {
          setError("Удерживайте, чтобы записать")
          return
        }
        const type = media.mimeType.includes("mp4") ? "audio/mp4" : "audio/webm"
        const name = type === "audio/mp4" ? "voice.mp4" : "voice.webm"
        const file = new File(chunks.current, name, { type })
        void onSendVoice(file, Math.min(duration, 180)).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "Голосовое не ушло")
        })
      }
      media.start()
      recorder.current = media
      setRecording(true)
      window.clearTimeout(lockTimer.current)
      lockTimer.current = window.setTimeout(() => {
        if (recorder.current && recorder.current.state === "recording") {
          cancel.current = false
          recorder.current.stop()
        }
      }, 180000)
    } catch {
      holding.current = false
      setError("Нет доступа к микрофону")
    }
  }

  function onRecMove(event: PointerEvent<HTMLButtonElement>) {
    if (!holding.current) return
    armCancel(startX.current - event.clientX > 80)
  }

  function onRecUp(event: PointerEvent<HTMLButtonElement>) {
    if (!holding.current && !recording) return
    const discard = willCancelRef.current
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    finishHold(discard)
  }

  const quote = reply ? (reply.reply_quote || reply.body || "сообщение") : editing ? (editing.body || "сообщение") : ""

  return (
    <div className="composer-dock">
      <form className="composer-shell" onSubmit={submit}>
        {reply || editing ? (
          <div className="composer-quote">
            <span className="composer-quote-mark" aria-hidden="true" />
            <span className="composer-quote-text">
              <b>{editing ? "Правка" : "Ответ"}</b>
              <span>{quote}</span>
            </span>
            <button
              className="field-btn"
              type="button"
              aria-label="Снять"
              onClick={editing ? onCancelEdit : onCancelReply}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
          </div>
        ) : null}
        <div className={`composer-row ${recording ? "rec" : ""} ${willCancel ? "rec-cancel" : ""}`}>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(event) => {
              void onFile(event.target.files?.[0])
              event.currentTarget.value = ""
            }}
          />
          {recording ? (
            <span className="rec-label">{willCancel ? "Отмена" : "Влево — отмена"}</span>
          ) : (
            <>
              <button className="field-btn" type="button" aria-label="Файл" onClick={() => fileRef.current?.click()}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M7 9.2v5.1a3 3 0 0 0 6 0V6.6a2.2 2.2 0 1 0-4.4 0v7.2a1.2 1.2 0 1 0 2.4 0V8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
              {onInvoice && !editing ? (
                <button className="field-btn" type="button" aria-label="Счёт" onClick={onInvoice}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M5.5 3.5h9v13l-1.2-.7-1.3.7-1.3-.7-1.2.7-1.3-.7-1.3.7-1.4-.7z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M8 8h4.5M8 11h4.5M8 14h2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              ) : null}
            </>
          )}
          {recording ? (
            <>
              <span className="rec-mark" aria-hidden="true" />
              <span className="rec-time">{clock(elapsed)}</span>
            </>
          ) : (
            <textarea
              ref={areaRef}
              value={text}
              placeholder="Сообщение"
              rows={1}
              enterKeyHint="send"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                const phone = window.matchMedia("(pointer: coarse)").matches
                if (event.key === "Enter" && !event.shiftKey && !phone && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
          )}
          {editing ? (
            <button className="field-btn send send-ok" type="submit" aria-label="Сохранить" tabIndex={-1} disabled={!text.trim()} onPointerDown={keepKeyboard}>
              ОК
            </button>
          ) : canSend || busy ? (
            <button className="field-btn send" type="submit" aria-label="Отправить" tabIndex={-1} disabled={busy && !canSend} onPointerDown={keepKeyboard}>
              <svg className="send-plane" width="28" height="28" viewBox="0 0 22 22" aria-hidden="true">
                <path d="M3 11.1 19 4.2 13.1 18.4 11.4 12.3z" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              className={`field-btn mic ${recording ? "rec" : ""}`}
              type="button"
              aria-label={recording ? (willCancel ? "Отмена" : "Отпустите, чтобы отправить") : "Голосовое"}
              onPointerDown={(event) => void onRecDown(event)}
              onPointerMove={onRecMove}
              onPointerUp={onRecUp}
              onPointerCancel={onRecUp}
              onLostPointerCapture={onRecUp}
              onContextMenu={(event) => event.preventDefault()}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 3.2a2.4 2.4 0 0 0-2.4 2.4v4.2a2.4 2.4 0 1 0 4.8 0V5.6A2.4 2.4 0 0 0 10 3.2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.2 9.4a4.8 4.8 0 0 0 9.6 0M10 14.2V17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </form>
      {error ? <p className="fail composer-error">{error}</p> : null}
    </div>
  )
}

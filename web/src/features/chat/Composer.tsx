import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Button } from "../../shared/ui/button/Button"
import type { ChatMessage } from "./useSocket"

type Props = {
  reply: ChatMessage | null
  editing: ChatMessage | null
  onCancelReply: () => void
  onCancelEdit: () => void
  onSendText: (body: string) => Promise<void>
  onSendFile: (file: File) => Promise<void>
  onSendVoice: (file: File, durationSec: number) => Promise<void>
  onEdit: (body: string) => Promise<void>
}

export function Composer({ reply, editing, onCancelReply, onCancelEdit, onSendText, onSendFile, onSendVoice, onEdit }: Props) {
  const [text, setText] = useState("")
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const cancel = useRef(false)

  useEffect(() => {
    setText(editing ? editing.body : "")
  }, [editing])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const body = text.trim()
    if (!body) return
    setError("")
    try {
      if (editing) await onEdit(body)
      else await onSendText(body)
      setText("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не отправилось")
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError("")
    try {
      await onSendFile(file)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Файл не ушёл")
    }
  }

  async function toggleRecord() {
    if (recording && recorder.current) {
      cancel.current = false
      recorder.current.stop()
      return
    }
    setError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4"
      const media = new MediaRecorder(stream, { mimeType: mime })
      chunks.current = []
      cancel.current = false
      started.current = Date.now()
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data)
      }
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        const duration = Math.round((Date.now() - started.current) / 1000)
        if (cancel.current || duration < 1) return
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
      window.setTimeout(() => {
        if (recorder.current && recorder.current.state === "recording") recorder.current.stop()
      }, 180000)
    } catch {
      setError("Нет доступа к микрофону")
    }
  }

  function stopWithoutSend() {
    cancel.current = true
    recorder.current?.stop()
  }

  return (
    <>
      {reply ? (
        <div className="reply-bar">
          <span className="hint">Ответ: {reply.reply_quote || reply.body || "сообщение"}</span>
          <Button type="button" tone="quiet" onClick={onCancelReply}>Снять</Button>
        </div>
      ) : null}
      {editing ? (
        <div className="reply-bar">
          <span className="hint">Правка сообщения</span>
          <Button type="button" tone="quiet" onClick={onCancelEdit}>Снять</Button>
        </div>
      ) : null}
      <form className="composer" onSubmit={submit}>
        <input ref={fileRef} hidden type="file" onChange={(event) => void onFile(event.target.files?.[0])} />
        <button className="icon-btn" type="button" aria-label="Файл" onClick={() => fileRef.current?.click()}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 2.5h6l4 4V15.5H4z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M10 2.5V7h4" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <textarea
          value={text}
          placeholder="Сообщение"
          rows={1}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            const phone = window.matchMedia("(pointer: coarse)").matches
            if (event.key === "Enter" && !event.shiftKey && !phone && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <button className={`icon-btn ${recording ? "rec" : ""}`} type="button" aria-label="Голосовое" onClick={() => void toggleRecord()}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r={recording ? 4 : 5} fill={recording ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <Button className="send-btn" tone="solid" type="submit" aria-label="Отправить">
          <span className="send-label">Отправить</span>
          <svg className="send-icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 9h12M11 5l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </Button>
      </form>
      {recording ? <div className="reply-bar"><span className="hint">Идёт запись</span><Button type="button" tone="quiet" onClick={stopWithoutSend}>Отмена</Button></div> : null}
      {error ? <p className="fail composer-error">{error}</p> : null}
    </>
  )
}

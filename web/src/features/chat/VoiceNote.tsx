import { useEffect, useMemo, useRef, useState } from "react"

let active: HTMLAudioElement | null = null
let stolen: (() => void) | null = null

function take(node: HTMLAudioElement, onStolen: () => void) {
  if (active && active !== node) {
    active.pause()
    stolen?.()
  }
  active = node
  stolen = onStolen
}

function drop(node: HTMLAudioElement) {
  if (active !== node) return
  active.pause()
  active = null
  stolen = null
}

function wave(seed: string) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619)
  const bars: number[] = []
  for (let i = 0; i < 32; i++) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
    bars.push(0.22 + ((hash >>> 0) % 78) / 100)
  }
  return bars
}

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 60)}:${(value % 60).toString().padStart(2, "0")}`
}

type Props = {
  id: string
  src: string
  duration: number | null
}

export function VoiceNote({ id, src, duration }: Props) {
  const node = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(duration ?? 0)
  const bars = useMemo(() => wave(id), [id])

  useEffect(() => () => {
    if (node.current) drop(node.current)
  }, [])

  function ensure() {
    if (node.current) return node.current
    const audio = new Audio(src)
    audio.preload = "metadata"
    audio.addEventListener("timeupdate", () => setCurrent(audio.currentTime))
    audio.addEventListener("ended", () => {
      setPlaying(false)
      setCurrent(0)
      drop(audio)
    })
    audio.addEventListener("durationchange", () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration)
    })
    node.current = audio
    return audio
  }

  function toggle() {
    const audio = ensure()
    if (playing) {
      audio.pause()
      setPlaying(false)
      drop(audio)
      return
    }
    take(audio, () => setPlaying(false))
    void audio.play().then(() => setPlaying(true)).catch(() => {
      setPlaying(false)
      drop(audio)
    })
  }

  function seek(index: number) {
    const audio = ensure()
    const length = total || duration || 0
    if (!length) return
    audio.currentTime = (index / Math.max(bars.length - 1, 1)) * length
    setCurrent(audio.currentTime)
  }

  const length = total || duration || 0
  const progress = length > 0 ? current / length : 0
  const shown = playing || current > 0.05 ? current : length

  return (
    <div className="voice">
      <button type="button" className="voice-play" aria-label={playing ? "Пауза" : "Слушать"} onClick={toggle}>
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="2" width="3" height="8" fill="currentColor" />
            <rect x="7" y="2" width="3" height="8" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.2 1.6v8.8L10.4 6z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="voice-col">
        <div className="voice-wave" role="slider" aria-label="Позиция" aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(current)}>
          {bars.map((height, index) => (
            <button
              key={index}
              type="button"
              tabIndex={-1}
              className={index / bars.length <= progress ? "on" : ""}
              style={{ height: `${Math.round(4 + height * 16)}px` }}
              aria-label={`${clock((index / bars.length) * length)}`}
              onPointerDown={(event) => {
                event.preventDefault()
                seek(index)
              }}
            />
          ))}
        </div>
        <span className="voice-time">{clock(shown)}</span>
      </div>
    </div>
  )
}

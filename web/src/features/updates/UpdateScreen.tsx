import { useEffect, useState } from "react"
import { Button } from "../../shared/ui/button/Button"
import { endUpdate, onUpdateChange, readUpdate } from "./progress"
import "./updates.css"

const LIMIT_MS = 240000
const EXPECT_MS = 120000

function phase(elapsed: number) {
  if (elapsed < 15000) return "Скачиваю код с GitHub"
  if (elapsed < 50000) return "Собираю кабинет"
  return "Перезапускаю"
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}

function remain(elapsed: number) {
  if (elapsed < 20000) return "Обычно 1–2 минуты."
  if (elapsed < 70000) return "Ещё около минуты."
  return "Ещё немного, собираются контейнеры."
}

export function UpdateScreen() {
  const [run, setRun] = useState(readUpdate)
  const [elapsed, setElapsed] = useState(0)
  const [fail, setFail] = useState("")

  useEffect(() => onUpdateChange(() => setRun(readUpdate())), [])

  useEffect(() => {
    if (!run) {
      setElapsed(0)
      setFail("")
      return
    }
    const tick = () => setElapsed(Date.now() - run.started)
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [run])

  useEffect(() => {
    if (!run) return
    let stop = false
    async function poll() {
      let down = false
      while (!stop) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
        if (stop) return
        const current = readUpdate()
        if (!current) return
        const waited = Date.now() - current.started
        if (waited > LIMIT_MS) {
          setFail("Кабинет ещё не ответил. Обновите страницу через минуту или снова вставьте команду установки на сервере.")
          return
        }
        try {
          const response = await fetch("/api/health", { cache: "no-store" })
          if (!response.ok) {
            down = true
            continue
          }
          const body = (await response.json()) as { ok?: boolean; sha?: string }
          if (!body.ok) {
            down = true
            continue
          }
          const changed = Boolean(body.sha && current.previous !== "unknown" && body.sha !== current.previous)
          if (changed || down) {
            endUpdate()
            window.location.reload()
            return
          }
        } catch {
          down = true
        }
      }
    }
    void poll()
    return () => {
      stop = true
    }
  }, [run])

  if (!run) return null

  const percent = Math.min(95, Math.round((elapsed / EXPECT_MS) * 100))

  return (
    <div className="update-screen" role="status" aria-live="polite">
      <div className="update-spin" aria-hidden="true" />
      <h1>Обновление</h1>
      <p>{phase(elapsed)}</p>
      <div className="update-bar" style={{ ["--p" as string]: `${percent}%` }}>
        <i />
      </div>
      <p className="stat">Идёт {clock(elapsed)} · {remain(elapsed)}</p>
      <p className="hint">Переписка и кабинеты на месте. Не закрывайте вкладку.</p>
      {fail ? (
        <>
          <p className="fail">{fail}</p>
          <Button type="button" onClick={() => endUpdate()}>Закрыть</Button>
        </>
      ) : null}
    </div>
  )
}

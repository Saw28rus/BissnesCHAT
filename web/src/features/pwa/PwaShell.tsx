import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useSession } from "../../app/session"
import { Button } from "../../shared/ui/button/Button"
import { isIos, isIosSafari, isStandalone, type InstallPrompt } from "./display"
import { canAskNotifications, persistNotifications, requestBrowserPermission } from "./notify"
import "./pwa.css"

export function PwaShell({ children }: { children: ReactNode }) {
  const { profile, refresh } = useSession()
  const [standalone, setStandalone] = useState(isStandalone)
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [askNotify, setAskNotify] = useState(() => canAskNotifications() && Notification.permission === "default")
  const [guide, setGuide] = useState<"ios" | "browser" | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
    }
    const onInstalled = () => {
      setPrompt(null)
      setStandalone(true)
    }
    const media = window.matchMedia("(display-mode: standalone)")
    const onMode = () => setStandalone(isStandalone())
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    media.addEventListener("change", onMode)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
      media.removeEventListener("change", onMode)
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    if (!canAskNotifications()) return
    if (Notification.permission === "granted") {
      setAskNotify(false)
      if (!profile.notifications_enabled && !saving.current) {
        saving.current = true
        void persistNotifications(true)
          .then(() => refresh())
          .finally(() => {
            saving.current = false
          })
      }
      return
    }
    setAskNotify(Notification.permission === "default")
  }, [profile, refresh])

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (guide && !node.open) node.showModal()
    if (!guide && node.open) node.close()
  }, [guide])

  const showInstall = !standalone
  const showBar = showInstall || askNotify

  async function onInstall() {
    if (prompt) {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setPrompt(null)
      if (choice.outcome === "accepted") setStandalone(true)
      return
    }
    setGuide(isIos() ? "ios" : "browser")
  }

  async function onNotify() {
    const granted = await requestBrowserPermission()
    setAskNotify(!granted && Notification.permission === "default")
    if (!granted || !profile || saving.current) return
    saving.current = true
    try {
      await persistNotifications(true)
      await refresh()
    } finally {
      saving.current = false
    }
  }

  return (
    <div className="pwa-frame">
      {showBar ? (
        <div className="pwa-bar">
          {showInstall ? (
            <Button type="button" tone={askNotify ? "line" : "solid"} onClick={() => void onInstall()}>
              Установить
            </Button>
          ) : null}
          {askNotify ? (
            <Button type="button" tone="solid" onClick={() => void onNotify()}>
              Разрешить уведомления
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="pwa-main">{children}</div>
      <dialog
        ref={dialog}
        className="pwa-guide"
        onCancel={(event) => {
          event.preventDefault()
          setGuide(null)
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setGuide(null)
        }}
      >
        {guide === "ios" ? (
          isIosSafari() ? (
            <>
              <h2>На экран «Домой»</h2>
              <p>Safari на iPhone и iPad не ставит приложение одной кнопкой. Добавьте ярлык сами:</p>
              <ol>
                <li>Нажмите «Поделиться» внизу Safari — квадрат со стрелкой.</li>
                <li>Выберите «На экран „Домой“».</li>
                <li>Нажмите «Добавить» и откройте «Бизнес ЧАТ» с экрана.</li>
              </ol>
            </>
          ) : (
            <>
              <h2>На экран «Домой»</h2>
              <p>На iPhone ярлык ставит только Safari. Откройте этот адрес в Safari, нажмите «Поделиться», затем «На экран „Домой“».</p>
            </>
          )
        ) : (
          <>
            <h2>Установить</h2>
            <p>В меню браузера выберите «Установить приложение» или «Добавить на главный экран».</p>
          </>
        )}
        <div className="pwa-guide-actions">
          <Button type="button" tone="solid" onClick={() => setGuide(null)}>
            Понятно
          </Button>
        </div>
      </dialog>
    </div>
  )
}

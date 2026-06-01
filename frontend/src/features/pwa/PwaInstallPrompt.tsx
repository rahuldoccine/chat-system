import React, { useEffect, useMemo, useState } from 'react'
import styles from './PwaInstallPrompt.module.css'
import ChatSystemLogo from '../../components/brand/ChatSystemLogo'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const PwaInstallPrompt: React.FC = () => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const isStandalone = useMemo(
    () =>
      globalThis.matchMedia?.('(display-mode: standalone)').matches ||
      (globalThis.navigator as Navigator & { standalone?: boolean }).standalone === true,
    [],
  )

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onBeforeInstallPromptInstalled = () => {
      setInstallEvent(null)
      setDismissed(false)
    }

    globalThis.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    globalThis.addEventListener('appinstalled', onBeforeInstallPromptInstalled)
    return () => {
      globalThis.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      globalThis.removeEventListener('appinstalled', onBeforeInstallPromptInstalled)
    }
  }, [])

  if (isStandalone || !installEvent || dismissed) return null

  return (
    <div className={styles.prompt}>
      <ChatSystemLogo variant="mark" size="xs" />
      <span className={styles.label}>Install Chat System</span>
      <button
        type="button"
        className={styles.installBtn}
        onClick={async () => {
          await installEvent.prompt()
          const choice = await installEvent.userChoice
          if (choice.outcome !== 'accepted') {
            setDismissed(true)
          }
          setInstallEvent(null)
        }}
      >
        Install
      </button>
      <button type="button" className={styles.laterBtn} onClick={() => setDismissed(true)}>
        Later
      </button>
    </div>
  )
}

export default PwaInstallPrompt

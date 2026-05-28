import React, { useEffect, useMemo, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const PwaInstallPrompt: React.FC = () => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const isStandalone = useMemo(
    () =>
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    [],
  )

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      setDismissed(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isStandalone || !installEvent || dismissed) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 9999,
        border: '1px solid #dbeafe',
        background: '#ffffff',
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(15,23,42,0.14)',
        padding: '0.65rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>Install Chat App</span>
      <button
        type="button"
        style={{
          border: '1px solid #c7d2fe',
          background: '#eef2ff',
          color: '#3730a3',
          borderRadius: 8,
          padding: '0.25rem 0.55rem',
          fontSize: '0.74rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
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
      <button
        type="button"
        style={{
          border: 'none',
          background: 'transparent',
          color: '#64748b',
          fontSize: '0.72rem',
          cursor: 'pointer',
        }}
        onClick={() => setDismissed(true)}
      >
        Later
      </button>
    </div>
  )
}

export default PwaInstallPrompt

'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

export type ToastType = 'buy-yes' | 'buy-no' | 'resolve' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
  exiting?: boolean
}

interface ToastCtx {
  addToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastCtx>({ addToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const removeToast = useCallback((id: number) => {
    // Mark as exiting first (slide-out animation), then remove
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 350)
  }, [])

  const addToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId.current++
      setToasts((prev) => [...prev.slice(-4), { id, message, type }])
      const ttl = type === 'error' ? 5000 : 3500
      setTimeout(() => removeToast(id), ttl)
    },
    [removeToast]
  )

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  )
}

/* ── Toast Container rendered into a portal ──────────── */
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '28px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

const TOAST_CONFIG: Record<ToastType, { icon: string; accent: string; bg: string; border: string }> = {
  'buy-yes': { icon: '🚀', accent: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.35)' },
  'buy-no':  { icon: '🔴', accent: '#ff3366', bg: 'rgba(255,51,102,0.08)', border: 'rgba(255,51,102,0.35)' },
  'resolve': { icon: '🏆', accent: '#ffb800', bg: 'rgba(255,184,0,0.08)', border: 'rgba(255,184,0,0.35)' },
  'error':   { icon: '⚠️', accent: '#ff3366', bg: 'rgba(255,51,102,0.1)', border: 'rgba(255,51,102,0.4)' },
  'info':    { icon: 'ℹ️', accent: '#00ff88', bg: 'rgba(0,255,136,0.06)', border: 'rgba(0,255,136,0.2)' },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const cfg = TOAST_CONFIG[toast.type]
  return (
    <div
      onClick={() => onDismiss(toast.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'rgba(6, 5, 12, 0.97)',
        border: `1px solid ${cfg.border}`,
        borderRadius: '14px',
        padding: '12px 18px',
        minWidth: '260px',
        maxWidth: '360px',
        backdropFilter: 'blur(24px)',
        boxShadow: `0 8px 40px rgba(0,0,0,0.7), 0 0 20px ${cfg.accent}22`,
        pointerEvents: 'all',
        cursor: 'pointer',
        animation: toast.exiting
          ? 'slide-out-right 0.32s ease forwards'
          : 'slide-in-right 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>{cfg.icon}</span>
      <span
        style={{
          fontSize: '13px',
          fontWeight: 700,
          color: '#d4ffe2',
          lineHeight: 1.4,
          flex: 1,
        }}
      >
        {toast.message}
      </span>
      <span
        style={{
          fontSize: '16px',
          color: '#5a7a63',
          opacity: 0.6,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        ×
      </span>
    </div>
  )
}

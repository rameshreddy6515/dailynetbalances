import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export function AccessibleDialog({ title, children, onClose, className = '' }) {
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus()
    }
  }, [])

  return (
    <dialog ref={ref} className={`accessible-dialog no-print ${className}`} aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); e.stopPropagation(); onClose() }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key !== 'Tab') return
        const items = [...e.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter((el) => el.getClientRects().length)
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return
        const r = e.currentTarget.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose()
      }}>
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="secondary icon-button" aria-label={`Close ${title}`} onClick={onClose}><X size={20} /></button>
      </div>
      {children}
    </dialog>
  )
}

export default function ConfirmDialog({ message, confirmLabel = 'Confirm', danger = false, onAnswer }) {
  return (
    <AccessibleDialog title="Please confirm" onClose={() => onAnswer(false)}>
      <p className="modal-text">{message}</p>
      <div className="actions modal-actions">
        <button type="button" className="secondary" onClick={() => onAnswer(false)} autoFocus>Cancel</button>
        <button type="button" className={danger ? 'danger' : 'primary'} onClick={() => onAnswer(true)}>{confirmLabel}</button>
      </div>
    </AccessibleDialog>
  )
}

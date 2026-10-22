import { useEffect, useId, useRef } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'

export function AccessibleDialog({ title, children, onClose, className = '', persistent = false, ariaDescribedBy }) {
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
      aria-describedby={ariaDescribedBy}
      onCancel={(e) => { e.preventDefault(); e.stopPropagation(); if (!persistent) onClose() }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key !== 'Tab') return
        const items = [...e.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => el.getClientRects().length && el.tabIndex >= 0 && !el.closest('[inert], [aria-hidden="true"]'))
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }}
      onClick={(e) => {
        if (persistent || e.target !== e.currentTarget) return
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
  const descriptionId = useId()
  return (
    <AccessibleDialog title="Please confirm" onClose={() => onAnswer(false)} ariaDescribedBy={descriptionId}>
      <div className={`confirm-badge${danger ? ' danger' : ''}`} aria-hidden="true">
        {danger ? <AlertTriangle size={22} /> : <Info size={22} />}
      </div>
      <p id={descriptionId} className="modal-text">{message}</p>
      <div className="actions modal-actions">
        <button type="button" className="secondary" onClick={() => onAnswer(false)} autoFocus>Cancel</button>
        <button type="button" className={danger ? 'danger' : 'primary'} onClick={() => onAnswer(true)}>{confirmLabel}</button>
      </div>
    </AccessibleDialog>
  )
}

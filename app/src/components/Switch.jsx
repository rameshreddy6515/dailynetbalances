export default function Switch({ checked, onChange, label, ariaLabel }) {
  return (
    <label className="switch-wrap">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only switch-input"
        role="switch"
        aria-label={ariaLabel || label || 'Toggle setting'}
      />
      <span className={`switch ${checked ? 'on' : ''}`} aria-hidden="true">
        <span className="switch-dot" />
      </span>
      {label && <span className="switch-label">{label}</span>}
    </label>
  )
}

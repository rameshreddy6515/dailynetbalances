import { useEffect, useRef, useState } from 'react'

const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function CountUp({ value, format }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    const from = prev.current
    const to = value
    if (from === to) return
    if (REDUCED) {
      prev.current = to
      setDisplay(to)
      return
    }
    const t0 = performance.now()
    const dur = 600
    let raf
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (to - from) * eased)
      if (p < 1) {
        raf = requestAnimationFrame(step)
      } else {
        prev.current = to
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return format(display)
}

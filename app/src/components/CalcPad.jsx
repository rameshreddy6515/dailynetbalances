import { useEffect, useState } from 'react'
import { Delete } from 'lucide-react'

const OPS = {
  '+': (a, b) => a + b,
  '−': (a, b) => a - b,
  '×': (a, b) => a * b,
  '÷': (a, b) => (b === 0 ? NaN : a / b),
}

const trim = (n) => {
  if (!Number.isFinite(n)) return 'Error'
  const s = String(parseFloat(n.toFixed(10)))
  return s.length > 14 ? n.toExponential(8) : s
}

export default function CalcPad() {
  const [cur, setCur] = useState('0')
  const [acc, setAcc] = useState(null)
  const [op, setOp] = useState(null)
  const [fresh, setFresh] = useState(true)

  const inputDigit = (d) => {
    if (cur === 'Error' || fresh) {
      setCur(d === '.' ? '0.' : d)
      setFresh(false)
      return
    }
    if (d === '.' && cur.includes('.')) return
    if (cur.replace(/[-.]/g, '').length >= 12) return
    setCur(cur === '0' && d !== '.' ? d : cur + d)
  }

  const applyOp = (o) => {
    if (cur !== 'Error' && acc !== null && op && !fresh) {
      const res = trim(OPS[op](Number(acc), Number(cur)))
      setAcc(res === 'Error' ? null : res)
      setCur(res)
      if (res === 'Error') setOp(null)
    } else if (acc === null) {
      setAcc(cur)
    }
    if (cur !== 'Error') setOp(o)
    setFresh(true)
  }

  const equals = () => {
    if (acc === null || !op) return
    setCur(trim(OPS[op](Number(acc), Number(cur))))
    setAcc(null)
    setOp(null)
    setFresh(true)
  }

  const clear = () => {
    setCur('0')
    setAcc(null)
    setOp(null)
    setFresh(true)
  }
  const back = () => {
    if (!fresh && cur !== 'Error') setCur(cur.length > 1 ? cur.slice(0, -1) : '0')
  }
  const negate = () => {
    if (cur !== '0' && cur !== 'Error') setCur(cur.startsWith('-') ? cur.slice(1) : `-${cur}`)
  }
  const percent = () => {
    if (cur !== 'Error') setCur(trim(Number(cur) / 100))
  }

  useEffect(() => {
    const h = (e) => {
      if (/^[0-9.]$/.test(e.key)) inputDigit(e.key)
      else if (e.key === '+') applyOp('+')
      else if (e.key === '-') applyOp('−')
      else if (e.key === '*') applyOp('×')
      else if (e.key === '/') { e.preventDefault(); applyOp('÷') }
      else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals() }
      else if (e.key === 'Backspace') back()
      else if (e.key === '%') percent()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const opCls = (o) => `op${op === o && fresh ? ' on' : ''}`

  return (
    <div className="calc-pad-wrap">
      <div className="calc-display" aria-live="polite">
        <div className="calc-expr">{acc !== null && op ? `${acc} ${op}` : ' '}</div>
        <div className="calc-cur">{cur}</div>
      </div>
      <div className="calc-pad">
        <button type="button" className="fn" onClick={clear}>C</button>
        <button type="button" className="fn" aria-label="Backspace" onClick={back}><Delete size={18} /></button>
        <button type="button" className="fn" onClick={percent}>%</button>
        <button type="button" className={opCls('÷')} onClick={() => applyOp('÷')}>÷</button>
        {['7', '8', '9'].map((d) => <button type="button" key={d} onClick={() => inputDigit(d)}>{d}</button>)}
        <button type="button" className={opCls('×')} onClick={() => applyOp('×')}>×</button>
        {['4', '5', '6'].map((d) => <button type="button" key={d} onClick={() => inputDigit(d)}>{d}</button>)}
        <button type="button" className={opCls('−')} onClick={() => applyOp('−')}>−</button>
        {['1', '2', '3'].map((d) => <button type="button" key={d} onClick={() => inputDigit(d)}>{d}</button>)}
        <button type="button" className={opCls('+')} onClick={() => applyOp('+')}>+</button>
        <button type="button" onClick={negate}>±</button>
        <button type="button" onClick={() => inputDigit('0')}>0</button>
        <button type="button" onClick={() => inputDigit('.')}>.</button>
        <button type="button" className="eq" onClick={equals}>=</button>
      </div>
    </div>
  )
}

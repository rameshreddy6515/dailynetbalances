let registered = false

export function registerSW(onUpdate) {
  if (registered || !import.meta.env.PROD || !('serviceWorker' in navigator)) return
  registered = true

  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    location.reload()
  })

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      const prompt = (worker) => onUpdate?.(() => worker.postMessage('SKIP_WAITING'))
      if (reg.waiting) prompt(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w)
        })
      })
      setInterval(() => reg.update(), 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update()
      })
    })
    .catch(() => {})
}

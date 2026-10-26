import { useState } from 'react'
import { merchantColor, merchantInitial } from '../format'

export default function MerchantAvatar({ name, logoUrl }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const showLogo = logoUrl && failedUrl !== logoUrl

  return (
    <span className={`mavatar${showLogo ? ' has-logo' : ''}`} style={{ '--mc': merchantColor(name) }} aria-hidden="true">
      {showLogo
        ? <img src={logoUrl} alt="" onError={() => setFailedUrl(logoUrl)} />
        : merchantInitial(name)}
    </span>
  )
}

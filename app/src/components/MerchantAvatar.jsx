import { merchantColor, merchantInitial } from '../format'

export default function MerchantAvatar({ name }) {
  return (
    <span className="mavatar" style={{ '--mc': merchantColor(name) }} aria-hidden="true">
      {merchantInitial(name)}
    </span>
  )
}

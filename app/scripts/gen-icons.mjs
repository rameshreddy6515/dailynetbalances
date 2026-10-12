// Generates simple PNG icons (blue bg, white bar chart) without any deps.
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function png(size, draw) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4
      const [r, g, b, a] = draw(x, y, size)
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Blue rounded square with three white bars (balance chart)
const icon = (x, y, s) => {
  const r = s * 0.18
  if ((x < r && y < r && Math.hypot(x - r, y - r) > r) ||
      (x > s - r && y < r && Math.hypot(x - (s - r), y - r) > r) ||
      (x < r && y > s - r && Math.hypot(x - r, y - (s - r)) > r) ||
      (x > s - r && y > s - r && Math.hypot(x - (s - r), y - (s - r)) > r)) {
    return [0, 0, 0, 0]
  }
  const bx = [0.24, 0.44, 0.64]
  const bh = [0.22, 0.36, 0.5]
  const bw = 0.12
  for (let i = 0; i < 3; i++) {
    const left = s * bx[i]
    const right = left + s * bw
    const top = s * 0.76 - s * bh[i]
    if (x >= left && x <= right && y >= top && y <= s * 0.76) return [255, 255, 255, 255]
  }
  return [37, 99, 235, 255]
}

for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, png(size, icon))
  console.log(`icon-${size}.png written`)
}

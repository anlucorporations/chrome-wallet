#!/usr/bin/env node
/**
 * scripts/generate-icons.mjs — Genera los iconos PNG de la extensión.
 *
 * Chrome no admite SVG como icono de extensión (manifest `icons` y
 * `action.default_icon` requieren PNG), así que este script dibuja el símbolo
 * de CodeCrypto Wallet y lo exporta en 16, 48 y 128 px.
 *
 * Diseño: cuadrado redondeado con el degradado de marca de TrueKeate
 * (navy → teal, 135°) y un anillo hexagonal dorado, que es el motivo visual de
 * la plataforma y se lee bien incluso a 16 px.
 *
 * Uso:
 *   node scripts/generate-icons.mjs
 *
 * No usa dependencias externas: codifica el PNG con zlib (built-in).
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIZES = [16, 48, 128]
const SS = 4 // supersampling para bordes suaves (anti-aliasing)

// ── Paleta de TrueKeate (RNF-08.1) ──────────────────────────────────
const NAVY = [26, 43, 76]    // #1A2B4C
const TEAL = [42, 157, 143]  // #2A9D8F
const GOLD = [212, 175, 55]  // #D4AF37

// ── Codificación PNG (RGBA, 8 bits) ────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  // 10..12 = compression, filter, interlace = 0

  // Cada scanline lleva su byte de filtro (0 = None)
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Dibujo ─────────────────────────────────────────────────────────
/** @returns {{r:number,g:number,b:number,a:number}} color del píxel (0..1) */
function sample(u, v) {
  // u, v ∈ [0,1) dentro del icono
  const size = 1
  const radius = size * 0.22 // esquinas redondeadas
  const x = u - 0.5
  const y = v - 0.5
  const r = radius

  // Distancia al cuadrado redondeado (signed distance field simplificado)
  const qx = Math.abs(x) - (0.5 - r)
  const qy = Math.abs(y) - (0.5 - r)
  const dist =
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  if (dist > 0) return { r: 0, g: 0, b: 0, a: 0 } // fuera de la forma

  // Degradado de marca: navy → teal en diagonal (135°, como --gradient-cta)
  const t = (u + v) / 2
  const bg = {
    r: (NAVY[0] + (TEAL[0] - NAVY[0]) * t) / 255,
    g: (NAVY[1] + (TEAL[1] - NAVY[1]) * t) / 255,
    b: (NAVY[2] + (TEAL[2] - NAVY[2]) * t) / 255,
  }

  // Anillo hexagonal dorado (motivo de la marca)
  const cx = x
  const cy = y
  const R = 0.30
  const vertices = []
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 3 // vértice arriba
    vertices.push([R * Math.cos(ang), R * Math.sin(ang)])
  }

  let dentro = false
  for (let i = 0, j = 5; i < 6; j = i++) {
    const [xi, yi] = vertices[i]
    const [xj, yj] = vertices[j]
    if (yi > cy !== yj > cy && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) dentro = !dentro
  }

  if (dentro) {
    let dMin = Infinity
    for (let i = 0, j = 5; i < 6; j = i++) {
      const [xi, yi] = vertices[i]
      const [xj, yj] = vertices[j]
      const dx = xj - xi
      const dy = yj - yi
      const k = Math.max(0, Math.min(1, ((cx - xi) * dx + (cy - yi) * dy) / (dx * dx + dy * dy)))
      dMin = Math.min(dMin, Math.hypot(cx - (xi + k * dx), cy - (yi + k * dy)))
    }
    if (dMin >= R * 0.6) {
      return { r: GOLD[0] / 255, g: GOLD[1] / 255, b: GOLD[2] / 255, a: 1 }
    }
  }

  return { ...bg, a: 1 }
}

function renderIcon(size) {
  const big = size * SS
  const rgba = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      // Promedio de los SS×SS subpíxeles (anti-aliasing)
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x * SS + sx + 0.5) / big
          const v = (y * SS + sy + 0.5) / big
          const c = sample(u, v)
          r += c.r * (c.a ?? 1)
          g += c.g * (c.a ?? 1)
          b += c.b * (c.a ?? 1)
          a += c.a ?? 1
        }
      }
      const n = SS * SS
      const alpha = a / n
      const idx = (y * size + x) * 4
      if (alpha > 0) {
        rgba[idx] = Math.round((r / n / alpha) * 255)
        rgba[idx + 1] = Math.round((g / n / alpha) * 255)
        rgba[idx + 2] = Math.round((b / n / alpha) * 255)
        rgba[idx + 3] = Math.round(alpha * 255)
      }
    }
  }

  return encodePNG(size, size, rgba)
}

mkdirSync(resolve(ROOT, 'public'), { recursive: true })
for (const size of SIZES) {
  const file = resolve(ROOT, 'public', `icon-${size}.png`)
  writeFileSync(file, renderIcon(size))
  console.log(`✅ ${file}`)
}

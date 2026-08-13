/** @typedef {import('./logic.js').Trip} Trip */

/**
 * Compact snapshot for URL sharing (no payments — flags only).
 * @param {Trip} trip
 */
export function tripToSnapshot(trip) {
  return {
    v: 1,
    name: trip.name,
    updatedAt: trip.updatedAt,
    people: trip.people.map((p) => ({ id: p.id, name: p.name })),
    expenses: trip.expenses.map((e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      payerId: e.payerId,
      splitAmong: [...e.splitAmong],
    })),
    flags: { ...(trip.flags || {}) },
  }
}

/**
 * @param {any} snap
 * @returns {Trip | null}
 */
export function snapshotToTrip(snap) {
  if (!snap || snap.v !== 1 || !Array.isArray(snap.people)) return null
  return {
    id: 'view',
    name: String(snap.name || 'Поход'),
    createdAt: snap.updatedAt || new Date().toISOString(),
    updatedAt: snap.updatedAt || new Date().toISOString(),
    people: snap.people.map((p) => ({ id: String(p.id), name: String(p.name) })),
    expenses: (snap.expenses || []).map((e) => ({
      id: String(e.id),
      title: String(e.title || 'Трата'),
      amount: Number(e.amount) || 0,
      payerId: String(e.payerId),
      splitAmong: Array.isArray(e.splitAmong) ? e.splitAmong.map(String) : [],
    })),
    payments: [],
    flags: snap.flags && typeof snap.flags === 'object' ? { ...snap.flags } : {},
  }
}

function toBase64Url(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** @param {string} str */
async function compressText(str) {
  const raw = new TextEncoder().encode(str)
  if (typeof CompressionStream === 'undefined') {
    return `u${toBase64Url(raw)}`
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return `g${toBase64Url(new Uint8Array(buf))}`
}

/** @param {string} token */
async function decompressText(token) {
  const mode = token[0]
  const data = fromBase64Url(token.slice(1))
  if (mode === 'u') {
    return new TextDecoder().decode(data)
  }
  if (mode === 'g') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Браузер не умеет gzip')
    }
    const stream = new Blob([data])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
    const buf = await new Response(stream).arrayBuffer()
    return new TextDecoder().decode(buf)
  }
  throw new Error('Неизвестный формат ссылки')
}

/** @param {Trip} trip */
export async function encodeSharePayload(trip) {
  const json = JSON.stringify(tripToSnapshot(trip))
  return compressText(json)
}

/** @param {string} payload */
export async function decodeSharePayload(payload) {
  const json = await decompressText(payload)
  return snapshotToTrip(JSON.parse(json))
}

/** @param {string} payload */
export function buildShareUrl(payload) {
  const base = `${location.origin}${location.pathname}${location.search}`
  return `${base}#v/${payload}`
}

/**
 * @returns {string | null} raw payload from hash
 */
export function readShareHash() {
  const hash = location.hash || ''
  const m = hash.match(/^#v\/(.+)$/)
  return m ? m[1] : null
}

export function clearShareHash() {
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}

/** @typedef {{ id: string, name: string }} Person */
/** @typedef {{ id: string, title: string, amount: number, payerId: string, splitAmong: string[] }} Expense */
/** @typedef {{ id: string, personId: string, amount: number, note: string, kind?: string }} Payment */
/**
 * flags[personId] = true → с должником рассчитались (скинул) или кредитору вернули.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   people: Person[],
 *   expenses: Expense[],
 *   payments: Payment[],
 *   flags?: Record<string, boolean>,
 * }} Trip
 */

const STORAGE_KEY = 'alcounter.v1'
const CLEAR_PAYMENTS_FLAG = 'alcounter.clearedFakePayments.v1'

/** @param {Trip} trip */
export function normalizeTrip(trip) {
  if (!Array.isArray(trip.people)) trip.people = []
  if (!Array.isArray(trip.expenses)) trip.expenses = []
  if (!Array.isArray(trip.payments)) trip.payments = []
  if (!trip.flags || typeof trip.flags !== 'object') trip.flags = {}
  // Drop legacy payment-based marks — balances come from expenses only
  trip.payments = []
  // Keep flags only for existing people
  const ids = new Set(trip.people.map((p) => p.id))
  for (const key of Object.keys(trip.flags)) {
    if (!ids.has(key)) delete trip.flags[key]
  }
  return trip
}

/** @returns {{ trips: Trip[] }} */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { trips: [] }
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.trips)) return { trips: [] }
    parsed.trips.forEach(normalizeTrip)

    // One-time: wipe test "оплаты" so only общак expenses remain
    if (!localStorage.getItem(CLEAR_PAYMENTS_FLAG)) {
      for (const trip of parsed.trips) {
        trip.payments = []
        trip.flags = {}
      }
      localStorage.setItem(CLEAR_PAYMENTS_FLAG, '1')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
    }

    return parsed
  } catch {
    return { trips: [] }
  }
}

/** @param {{ trips: Trip[] }} state */
export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function nowIso() {
  return new Date().toISOString()
}

/** @param {Partial<Trip>} overrides */
export function createTrip(overrides = {}) {
  const t = nowIso()
  return {
    id: uid(),
    name: 'Поход',
    createdAt: t,
    updatedAt: t,
    people: [],
    expenses: [],
    payments: [],
    flags: {},
    ...overrides,
  }
}

/**
 * Net balance per person from expenses only:
 * positive = overpaid (should receive), negative = underpaid (should pay).
 * @param {Trip} trip
 * @returns {Record<string, number>}
 */
export function expenseBalances(trip) {
  /** @type {Record<string, number>} */
  const bal = {}
  for (const p of trip.people) bal[p.id] = 0

  for (const exp of trip.expenses) {
    const among = exp.splitAmong.filter((id) => bal[id] !== undefined)
    if (!among.length || !(exp.amount > 0)) continue
    const share = exp.amount / among.length
    if (bal[exp.payerId] !== undefined) bal[exp.payerId] += exp.amount
    for (const id of among) bal[id] -= share
  }
  return bal
}

/**
 * @param {Trip} trip
 * @returns {{
 *   rows: {
 *     person: Person,
 *     expenseNet: number,
 *     stillOwes: number,
 *     toRefund: number,
 *     done: boolean,
 *     role: 'debtor' | 'creditor' | 'even',
 *   }[],
 *   totalExpenses: number,
 *   fairShareHint: number,
 *   toCollect: number,
 *   toRefund: number,
 *   collectedCount: number,
 *   refundedCount: number,
 * }}
 */
export function settleThroughOrganizer(trip) {
  const bal = expenseBalances(trip)
  const flags = trip.flags || {}
  const totalExpenses = trip.expenses.reduce((s, e) => s + (e.amount || 0), 0)

  const rows = trip.people.map((person) => {
    const expenseNet = roundMoney(bal[person.id] || 0)
    const stillOwes = expenseNet < 0 ? roundMoney(-expenseNet) : 0
    const toRefund = expenseNet > 0 ? expenseNet : 0
    let role = 'even'
    if (stillOwes > 0) role = 'debtor'
    else if (toRefund > 0) role = 'creditor'
    const done = Boolean(flags[person.id]) && role !== 'even'
    return { person, expenseNet, stillOwes, toRefund, done, role }
  })

  const toCollect = roundMoney(
    rows
      .filter((r) => r.role === 'debtor' && !r.done)
      .reduce((s, r) => s + r.stillOwes, 0),
  )
  const toRefundTotal = roundMoney(
    rows
      .filter((r) => r.role === 'creditor' && !r.done)
      .reduce((s, r) => s + r.toRefund, 0),
  )

  return {
    rows,
    totalExpenses: roundMoney(totalExpenses),
    fairShareHint:
      trip.people.length > 0
        ? roundMoney(totalExpenses / trip.people.length)
        : 0,
    toCollect,
    toRefund: toRefundTotal,
    collectedCount: rows.filter((r) => r.role === 'debtor' && r.done).length,
    refundedCount: rows.filter((r) => r.role === 'creditor' && r.done).length,
  }
}

/** @param {number} n */
export function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** @param {number} n */
export function formatMoney(n) {
  const v = roundMoney(n)
  return v.toLocaleString('ru-RU', {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

/** @param {string} iso */
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

/** Export all data as downloadable JSON */
export function exportBackup(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `alcounter-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {File} file
 * @returns {Promise<{ trips: Trip[] }>}
 */
export function importBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!data || !Array.isArray(data.trips)) {
          reject(new Error('В файле нет поездок'))
          return
        }
        data.trips.forEach(normalizeTrip)
        resolve({ trips: data.trips })
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/** @param {ReturnType<typeof settleThroughOrganizer>} settlement */
export function buildReminderText(settlement, tripName) {
  const lines = [`🎣 ${tripName}`, `Особенности национального общака:`, '']
  const debtors = settlement.rows.filter(
    (r) => r.role === 'debtor' && !r.done,
  )
  const creditors = settlement.rows.filter(
    (r) => r.role === 'creditor' && !r.done,
  )

  if (debtors.length) {
    lines.push('Скинуть организатору:')
    for (const r of debtors) {
      lines.push(`• ${r.person.name} — ${formatMoney(r.stillOwes)} ₽`)
    }
    lines.push('')
  }
  if (creditors.length) {
    lines.push('Вернуть:')
    for (const r of creditors) {
      lines.push(`• ${r.person.name} — ${formatMoney(r.toRefund)} ₽`)
    }
    lines.push('')
  }
  if (!debtors.length && !creditors.length) {
    lines.push('Все в расчёте. Можно закидывать удочки.')
  } else {
    lines.push(
      `Итого собрать: ${formatMoney(settlement.toCollect)} ₽ · вернуть: ${formatMoney(settlement.toRefund)} ₽`,
    )
  }
  return lines.join('\n')
}

/** @param {ReturnType<typeof settleThroughOrganizer>['rows'][number]} row */
export function buildPersonNudge(row, tripName) {
  if (row.role === 'debtor' && !row.done) {
    return `Привет! По походу «${tripName}» тебе скинуть ${formatMoney(row.stillOwes)} ₽ в общак. Без этого рыба не клюёт 🎣`
  }
  if (row.role === 'creditor' && !row.done) {
    return `По походу «${tripName}» тебе вернуть ${formatMoney(row.toRefund)} ₽. Скоро будут на берегу.`
  }
  return `По походу «${tripName}» ты в полном расчёте. Красава.`
}

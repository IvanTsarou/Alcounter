import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/literata/500.css'
import '@fontsource/literata/700.css'
import './styles.css'
import {
  loadState,
  saveState,
  createTrip,
  uid,
  nowIso,
  settleThroughOrganizer,
  formatMoney,
  formatDate,
  exportBackup,
  importBackup,
  buildReminderText,
  buildPersonNudge,
  normalizeTrip,
} from './logic.js'
import {
  encodeSharePayload,
  decodeSharePayload,
  buildShareUrl,
  readShareHash,
  clearShareHash,
} from './share.js'

/** @typedef {import('./logic.js').Trip} Trip */
/** @typedef {import('./logic.js').Person} Person */

const QUOTES = [
  'Рыбалка без общака — как удочка без лески.',
  'Сначала посчитаем, потом уже про «ну ещё по одной».',
  'Кто платил за бензин — тот и капитан катера.',
  'Взаиморасчёт — тоже национальная традиция.',
  'Пока баланс не сойдётся — костёр не разводим.',
]

const app = document.querySelector('#app')

/** @type {{ trips: Trip[] }} */
let state = loadState()

/** @type {'home' | 'trip' | 'view'} */
let screen = 'home'
/** @type {string | null} */
let tripId = null
/** @type {Trip | null} */
let viewTrip = null
/** @type {'people' | 'expenses' | 'result'} */
let tab = 'people'
/** Expenses list expanded on the Траты tab */
let expensesExpanded = false
/** @type {null | { type: string, payload?: any }} */
let modal = null
let toastTimer = 0

function persist() {
  saveState(state)
}

function currentTrip() {
  return state.trips.find((t) => t.id === tripId) || null
}

function touchTrip(trip) {
  trip.updatedAt = nowIso()
}

function showToast(text) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200)
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('Скопировано. Можно слать в чат')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    showToast('Скопировано')
  }
}

function logoSvg() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#163528"/><path d="M12 36c8-10 20-14 32-10 4 1.5 7 4 10 7-6 1-12 1-18 0-8-1.5-16 0-24 3z" fill="#3d8f7a"/><path d="M14 38c10-2 22-2 34 2" stroke="#7ec8b3" stroke-width="1.5" stroke-linecap="round" opacity=".7"/><circle cx="44" cy="24" r="3" fill="#e8c547"/><path d="M28 44l2 8h4l2-8" stroke="#8bbf6a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="32" cy="42" rx="7" ry="3.5" fill="#8bbf6a"/></svg>`
}

function render() {
  const offline = !navigator.onLine
  if (screen === 'view' && viewTrip) {
    app.innerHTML = renderViewOnly(viewTrip, offline)
    bindGlobal()
    if (modal) openModalDom()
    return
  }
  if (screen === 'home') {
    app.innerHTML = renderHome(offline)
  } else {
    const trip = currentTrip()
    if (!trip) {
      screen = 'home'
      tripId = null
      app.innerHTML = renderHome(offline)
    } else {
      app.innerHTML = renderTrip(trip, offline)
    }
  }
  bindGlobal()
  if (modal) openModalDom()
}

function offlineBadge(show) {
  return `<div class="offline-badge ${show ? 'show' : ''}" aria-live="polite">🛶 Офлайн — всё на этом устройстве</div>`
}

function renderHome(offline) {
  const trips = [...state.trips].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )
  const quote = QUOTES[Math.floor(Date.now() / 60000) % QUOTES.length]

  return `
    ${offlineBadge(offline)}
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">${logoSvg()}<h1>Алкаунтер</h1></div>
        <p>Особенности национального общака</p>
      </div>
      <div class="top-actions">
        <button class="icon-btn" type="button" data-action="menu" aria-label="Меню">☰</button>
      </div>
    </header>
    <div class="ripple-water"></div>
    <p class="quote">${quote}</p>
    <div class="stack">
      ${
        trips.length
          ? trips.map((t) => tripCard(t)).join('')
          : `<div class="empty">
              <div class="hook">🎣</div>
              <h2>Пока тишина на озере</h2>
              <p class="muted">Заведи первый поход — и считай, кто сколько скинул в общак.</p>
            </div>`
      }
    </div>
    <div class="fab-row">
      <button class="btn btn-primary btn-block" type="button" data-action="new-trip">Новый поход</button>
    </div>
  `
}

function tripCard(trip) {
  const s = settleThroughOrganizer(trip)
  return `
    <button class="card clickable" type="button" data-action="open-trip" data-id="${trip.id}">
      <div class="card-title">${escapeHtml(trip.name)}</div>
      <div class="muted">${formatDate(trip.updatedAt)} · ${trip.people.length} уч.</div>
      <div class="meta-row">
        <span class="chip">траты ${formatMoney(s.totalExpenses)} ₽</span>
        ${
          s.toCollect > 0
            ? `<span class="chip accent">собрать ${formatMoney(s.toCollect)} ₽</span>`
            : `<span class="chip">в расчёте</span>`
        }
      </div>
    </button>
  `
}

function renderTrip(trip, offline) {
  return `
    ${offlineBadge(offline)}
    <button class="back-link" type="button" data-action="go-home">← Все походы</button>
    <header class="trip-head">
      <h1 contenteditable="true" spellcheck="false" data-action="rename-trip" data-id="${trip.id}">${escapeHtml(trip.name)}</h1>
      <p class="muted">Обновлено ${formatDate(trip.updatedAt)}</p>
    </header>
    <nav class="tabs" role="tablist">
      ${tabBtn('people', 'Люди')}
      ${tabBtn('expenses', 'Траты')}
      ${tabBtn('result', 'Итог')}
    </nav>
    <div class="stack">
      ${renderTab(trip)}
    </div>
  `
}

function tabBtn(id, label) {
  return `<button class="tab ${tab === id ? 'active' : ''}" type="button" data-action="tab" data-tab="${id}">${label}</button>`
}

function renderTab(trip) {
  if (tab === 'people') return renderPeople(trip)
  if (tab === 'expenses') return renderExpenses(trip)
  return renderResult(trip)
}

function renderPeople(trip) {
  if (!trip.people.length) {
    return `
      <div class="empty">
        <div class="hook">👥</div>
        <h2>Кто идёт на берег?</h2>
        <p class="muted">Добавь участников — хотя бы имена. Остальное приложится.</p>
      </div>
      <button class="btn btn-primary btn-block" type="button" data-action="add-person">Добавить человека</button>
    `
  }
  return `
    ${trip.people
      .map(
        (p) => `
      <div class="card person-row">
        <div class="row-main">
          <strong>${escapeHtml(p.name)}</strong>
          <div class="row-actions">
            <button class="mini-btn" type="button" data-action="edit-person" data-id="${p.id}">изм.</button>
            <button class="mini-btn" type="button" data-action="del-person" data-id="${p.id}">удалить</button>
          </div>
        </div>
      </div>`,
      )
      .join('')}
    <button class="btn btn-secondary btn-block" type="button" data-action="add-person">+ Ещё человек</button>
  `
}

function renderExpenses(trip) {
  if (!trip.people.length) {
    return `<div class="empty"><div class="hook">🧾</div><h2>Сначала люди</h2><p class="muted">Без участников траты делить не на кого.</p></div>`
  }
  const list = [...trip.expenses].reverse()
  const total = trip.expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const open = expensesExpanded

  return `
    <button
      class="card clickable expenses-total"
      type="button"
      data-action="toggle-expenses"
      aria-expanded="${open ? 'true' : 'false'}"
    >
      <div class="row-main">
        <div>
          <strong>Итого</strong>
          <div class="muted">${
            list.length
              ? `${list.length} ${pluralTraty(list.length)}${open ? '' : ' · нажми, чтобы раскрыть'}`
              : 'пока пусто'
          }</div>
        </div>
        <div class="total-side">
          <div class="amount">${formatMoney(total)} ₽</div>
          <span class="chevron ${open ? 'open' : ''}" aria-hidden="true">▾</span>
        </div>
      </div>
    </button>
    <div class="expenses-list ${open ? 'open' : ''}">
      <div class="expenses-list-inner">
      ${
        list.length
          ? list
              .map((e) => {
                const payer = trip.people.find((p) => p.id === e.payerId)
                const among =
                  e.splitAmong.length === trip.people.length
                    ? 'на всех'
                    : `на ${e.splitAmong.length}`
                return `
            <div class="card expense-row">
              <div class="row-main">
                <div>
                  <strong>${escapeHtml(e.title || 'Трата')}</strong>
                  <div class="muted">${escapeHtml(payer?.name || '?')} · ${among}</div>
                </div>
                <div class="amount">${formatMoney(e.amount)} ₽</div>
              </div>
              <div class="row-actions">
                <button class="mini-btn" type="button" data-action="edit-expense" data-id="${e.id}">изм.</button>
                <button class="mini-btn" type="button" data-action="del-expense" data-id="${e.id}">удалить</button>
              </div>
            </div>`
              })
              .join('')
          : `<div class="empty compact"><div class="hook">🛒</div><h2>Общак пуст</h2><p class="muted">Бензин, еда, баня — всё сюда.</p></div>`
      }
      </div>
    </div>
    <button class="btn btn-primary btn-block" type="button" data-action="add-expense">Добавить трату</button>
  `
}

function pluralTraty(n) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'трата'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'траты'
  return 'трат'
}

function renderResult(trip) {
  if (!trip.people.length) {
    return `<div class="empty"><div class="hook">⚖️</div><h2>Нечего сводить</h2><p class="muted">Добавь людей и траты — и магия национального расчёта случится.</p></div>`
  }
  if (!trip.expenses.length) {
    return `<div class="empty"><div class="hook">🧾</div><h2>Сначала траты</h2><p class="muted">Без общака считать пока нечего — только удочки сушить.</p></div>`
  }

  const s = settleThroughOrganizer(trip)
  const debtors = s.rows.filter((r) => r.role === 'debtor')
  const creditors = s.rows.filter((r) => r.role === 'creditor')
  const even = s.rows.filter((r) => r.role === 'even')

  return `
    <div class="card">
      <div class="hero-stat">
        <div class="muted">Всего в общаке</div>
        <div class="big">${formatMoney(s.totalExpenses)} ₽</div>
        <div class="muted" style="margin-top:6px">~${formatMoney(s.fairShareHint)} ₽ с носа</div>
      </div>
      <div class="stats-grid">
        <div class="stat"><div class="label">Ещё собрать</div><div class="value" style="color:var(--danger)">${formatMoney(s.toCollect)} ₽</div></div>
        <div class="stat"><div class="label">Ещё вернуть</div><div class="value" style="color:var(--ok)">${formatMoney(s.toRefund)} ₽</div></div>
      </div>
      <p class="muted" style="margin:8px 0 0;font-size:0.8rem">Отметки только здесь. Ссылка для друзей — снимок на момент отправки.</p>
    </div>

    ${
      debtors.length
        ? `<h3 class="section-title">Должны скинуть</h3>
           ${debtors.map((r) => personSettleCard(r)).join('')}`
        : ''
    }

    ${
      creditors.length
        ? `<h3 class="section-title">Вернуть закупщикам</h3>
           ${creditors.map((r) => personSettleCard(r)).join('')}`
        : ''
    }

    ${
      even.length
        ? `<h3 class="section-title">Уже ровно</h3>
           ${even.map((r) => personSettleCard(r)).join('')}`
        : ''
    }

    <button class="btn btn-primary btn-block" type="button" data-action="share-link">Ссылка для просмотра</button>
    <button class="btn btn-secondary btn-block" type="button" data-action="copy-all">Скопировать сводку</button>
    <button class="btn btn-ghost btn-block" type="button" data-action="delete-trip">Удалить поход</button>
  `
}

function renderViewOnly(trip, offline) {
  const s = settleThroughOrganizer(trip)
  const debtors = s.rows.filter((r) => r.role === 'debtor')
  const creditors = s.rows.filter((r) => r.role === 'creditor')
  const even = s.rows.filter((r) => r.role === 'even')
  const list = [...trip.expenses].reverse()
  const open = expensesExpanded

  return `
    ${offlineBadge(offline)}
    <div class="view-banner">👁 Только просмотр · снимок от ${formatDate(trip.updatedAt)}</div>
    <header class="trip-head">
      <div class="brand-mark" style="margin-bottom:8px">${logoSvg()}<span class="muted" style="font-size:0.85rem">Алкаунтер</span></div>
      <h1>${escapeHtml(trip.name)}</h1>
      <p class="muted">${trip.people.length} уч. · правки только у организатора</p>
    </header>
    <div class="ripple-water"></div>
    <div class="stack">
      <div class="card">
        <div class="hero-stat">
          <div class="muted">Всего в общаке</div>
          <div class="big">${formatMoney(s.totalExpenses)} ₽</div>
          <div class="muted" style="margin-top:6px">~${formatMoney(s.fairShareHint)} ₽ с носа</div>
        </div>
        <div class="stats-grid">
          <div class="stat"><div class="label">Ещё собрать</div><div class="value" style="color:var(--danger)">${formatMoney(s.toCollect)} ₽</div></div>
          <div class="stat"><div class="label">Ещё вернуть</div><div class="value" style="color:var(--ok)">${formatMoney(s.toRefund)} ₽</div></div>
        </div>
      </div>

      <button
        class="card clickable expenses-total"
        type="button"
        data-action="toggle-expenses"
        aria-expanded="${open ? 'true' : 'false'}"
      >
        <div class="row-main">
          <div>
            <strong>Траты</strong>
            <div class="muted">${list.length} ${pluralTraty(list.length)}${open ? '' : ' · раскрыть'}</div>
          </div>
          <div class="total-side">
            <div class="amount">${formatMoney(s.totalExpenses)} ₽</div>
            <span class="chevron ${open ? 'open' : ''}" aria-hidden="true">▾</span>
          </div>
        </div>
      </button>
      <div class="expenses-list ${open ? 'open' : ''}">
        <div class="expenses-list-inner">
          ${
            list.length
              ? list
                  .map((e) => {
                    const payer = trip.people.find((p) => p.id === e.payerId)
                    const among =
                      e.splitAmong.length === trip.people.length
                        ? 'на всех'
                        : `на ${e.splitAmong.length}`
                    return `
              <div class="card expense-row">
                <div class="row-main">
                  <div>
                    <strong>${escapeHtml(e.title || 'Трата')}</strong>
                    <div class="muted">${escapeHtml(payer?.name || '?')} · ${among}</div>
                  </div>
                  <div class="amount">${formatMoney(e.amount)} ₽</div>
                </div>
              </div>`
                  })
                  .join('')
              : `<div class="empty compact"><p class="muted">Трат нет</p></div>`
          }
        </div>
      </div>

      ${
        debtors.length
          ? `<h3 class="section-title">Должны скинуть</h3>
             ${debtors.map((r) => personSettleCard(r, true)).join('')}`
          : ''
      }
      ${
        creditors.length
          ? `<h3 class="section-title">Вернуть закупщикам</h3>
             ${creditors.map((r) => personSettleCard(r, true)).join('')}`
          : ''
      }
      ${
        even.length
          ? `<h3 class="section-title">Уже ровно</h3>
             ${even.map((r) => personSettleCard(r, true)).join('')}`
          : ''
      }

      <button class="btn btn-secondary btn-block" type="button" data-action="exit-view">Мой Алкаунтер</button>
    </div>
  `
}

/** @param {ReturnType<typeof settleThroughOrganizer>['rows'][number]} r */
function personSettleCard(r, readOnly = false) {
  if (r.role === 'debtor') {
    return `
      <div class="card balance-card ${r.done ? 'card-done' : 'card-debt'}">
        <div class="row-main">
          <div>
            <strong>${escapeHtml(r.person.name)}${
              r.done ? ' <span class="paid-tag">в кассе</span>' : ''
            }</strong>
            <div class="muted">${r.done ? 'скинул в общак' : 'ещё должен организатору'}</div>
          </div>
          <span class="amount ${r.done ? 'refund' : 'owed'}">${formatMoney(r.stillOwes)} ₽</span>
        </div>
        ${
          readOnly
            ? ''
            : `<div class="row-actions" style="margin-top:8px">
          ${
            r.done
              ? `<button class="mini-btn mini-btn-cancel" type="button" data-action="unflag" data-id="${r.person.id}">Галя, отмена!</button>`
              : `<button class="mini-btn" type="button" data-action="nudge" data-id="${r.person.id}">текст напоминания</button>
                 <button class="mini-btn mini-btn-mark" type="button" data-action="flag" data-id="${r.person.id}">отметить оплату</button>`
          }
        </div>`
        }
      </div>`
  }

  if (r.role === 'creditor') {
    return `
      <div class="card balance-card ${r.done ? 'card-done' : 'card-credit'}">
        <div class="row-main">
          <div>
            <strong>${escapeHtml(r.person.name)}${
              r.done ? ' <span class="paid-tag">закрыто</span>' : ''
            }</strong>
            <div class="muted">${r.done ? 'вернул(а) за переплату' : 'закупался — переплата'}</div>
          </div>
          <span class="amount refund">+${formatMoney(r.toRefund)} ₽</span>
        </div>
        ${
          readOnly
            ? ''
            : `<div class="row-actions" style="margin-top:8px">
          ${
            r.done
              ? `<button class="mini-btn mini-btn-cancel" type="button" data-action="unflag" data-id="${r.person.id}">Галя, отмена!</button>`
              : `<button class="mini-btn" type="button" data-action="nudge" data-id="${r.person.id}">текст</button>
                 <button class="mini-btn mini-btn-mark" type="button" data-action="flag" data-id="${r.person.id}">вернул у костра</button>`
          }
        </div>`
        }
      </div>`
  }

  return `
    <div class="card balance-card card-even">
      <div class="row-main">
        <strong>${escapeHtml(r.person.name)}</strong>
        <span class="muted">0 ₽</span>
      </div>
    </div>`
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function bindGlobal() {
  app.querySelectorAll('[data-action]').forEach((el) => {
    const action = el.getAttribute('data-action')
    if (action === 'rename-trip') {
      el.addEventListener('blur', () => {
        const trip = currentTrip()
        if (!trip) return
        const name = el.textContent.trim() || 'Поход'
        trip.name = name
        el.textContent = name
        touchTrip(trip)
        persist()
      })
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          el.blur()
        }
      })
      return
    }
    el.addEventListener('click', onAction)
  })
}

function onAction(e) {
  const el = e.currentTarget
  const action = el.getAttribute('data-action')
  const id = el.getAttribute('data-id')
  const trip = currentTrip()

  switch (action) {
    case 'menu':
      modal = { type: 'menu' }
      openModalDom()
      break
    case 'new-trip':
      modal = { type: 'new-trip' }
      openModalDom()
      break
    case 'open-trip':
      tripId = id
      screen = 'trip'
      tab = 'people'
      render()
      break
    case 'go-home':
      screen = 'home'
      tripId = null
      render()
      break
    case 'tab':
      tab = el.getAttribute('data-tab')
      render()
      break
    case 'toggle-expenses':
      expensesExpanded = !expensesExpanded
      render()
      break
    case 'add-person':
      modal = { type: 'person' }
      openModalDom()
      break
    case 'edit-person':
      modal = { type: 'person', payload: { id } }
      openModalDom()
      break
    case 'del-person':
      if (!trip || !confirm('Убрать участника? Его траты тоже почистятся.')) break
      trip.people = trip.people.filter((p) => p.id !== id)
      trip.expenses = trip.expenses
        .filter((ex) => ex.payerId !== id)
        .map((ex) => ({
          ...ex,
          splitAmong: ex.splitAmong.filter((x) => x !== id),
        }))
        .filter((ex) => ex.splitAmong.length)
      if (trip.flags) delete trip.flags[id]
      touchTrip(trip)
      persist()
      render()
      break
    case 'add-expense':
      modal = { type: 'expense' }
      openModalDom()
      break
    case 'edit-expense':
      modal = { type: 'expense', payload: { id } }
      openModalDom()
      break
    case 'del-expense':
      if (!trip || !confirm('Удалить трату?')) break
      trip.expenses = trip.expenses.filter((ex) => ex.id !== id)
      touchTrip(trip)
      persist()
      render()
      break
    case 'copy-all': {
      if (!trip) break
      const text = buildReminderText(settleThroughOrganizer(trip), trip.name)
      copyText(text)
      break
    }
    case 'share-link': {
      if (!trip) break
      shareTripLink(trip)
      break
    }
    case 'exit-view':
      clearShareHash()
      viewTrip = null
      screen = 'home'
      tripId = null
      render()
      break
    case 'nudge': {
      if (!trip) break
      const s = settleThroughOrganizer(trip)
      const row = s.rows.find((r) => r.person.id === id)
      if (row) copyText(buildPersonNudge(row, trip.name))
      break
    }
    case 'flag': {
      if (!trip || !id) break
      if (!trip.flags) trip.flags = {}
      trip.flags[id] = true
      touchTrip(trip)
      persist()
      showToast('Зафиксировали')
      render()
      break
    }
    case 'unflag': {
      if (!trip || !id) break
      if (trip.flags) delete trip.flags[id]
      touchTrip(trip)
      persist()
      showToast('Галя, отмена!')
      render()
      break
    }
    case 'delete-trip':
      if (!trip || !confirm(`Удалить поход «${trip.name}»?`)) break
      state.trips = state.trips.filter((t) => t.id !== trip.id)
      persist()
      screen = 'home'
      tripId = null
      render()
      break
  }
}

function closeModal() {
  modal = null
  document.querySelector('.modal-backdrop')?.remove()
}

function openModalDom() {
  document.querySelector('.modal-backdrop')?.remove()
  if (!modal) return

  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop'
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal()
  })

  if (modal.type === 'menu') {
    backdrop.innerHTML = `
      <div class="modal menu-sheet" role="dialog">
        <h2>Снаряжение</h2>
        <div class="stack">
          <button class="btn btn-secondary btn-block" type="button" data-m="export">Экспорт в файл</button>
          <button class="btn btn-secondary btn-block" type="button" data-m="import">Импорт из файла</button>
          <button class="btn btn-ghost btn-block" type="button" data-m="close">Закрыть</button>
        </div>
        <p class="muted" style="margin:14px 0 0;font-size:0.8rem">Данные живут в этом браузере. Для бэкапа — экспорт JSON. Интернет для счёта не нужен.</p>
        <input type="file" accept="application/json,.json" hidden data-import />
      </div>`
  } else if (modal.type === 'new-trip') {
    backdrop.innerHTML = `
      <div class="modal" role="dialog">
        <h2>Новый поход</h2>
        <label>Как назовём?<input name="name" placeholder="Карелия, июль" value="Поход" autofocus /></label>
        <div class="modal-actions">
          <button class="btn btn-primary btn-block" type="button" data-m="create-trip">Создать</button>
          <button class="btn btn-ghost btn-block" type="button" data-m="close">Отмена</button>
        </div>
      </div>`
  } else if (modal.type === 'person') {
    const trip = currentTrip()
    const existing = trip?.people.find((p) => p.id === modal.payload?.id)
    backdrop.innerHTML = `
      <div class="modal" role="dialog">
        <h2>${existing ? 'Участник' : 'Новый участник'}</h2>
        <label>Имя<input name="name" placeholder="Коля" value="${escapeHtml(existing?.name || '')}" autofocus /></label>
        <div class="modal-actions">
          <button class="btn btn-primary btn-block" type="button" data-m="save-person">Сохранить</button>
          <button class="btn btn-ghost btn-block" type="button" data-m="close">Отмена</button>
        </div>
      </div>`
  } else if (modal.type === 'expense') {
    const trip = currentTrip()
    const existing = trip?.expenses.find((ex) => ex.id === modal.payload?.id)
    const payerId = existing?.payerId || trip.people[0]?.id
    const selected = new Set(existing?.splitAmong || trip.people.map((p) => p.id))
    backdrop.innerHTML = `
      <div class="modal" role="dialog">
        <h2>${existing ? 'Трата' : 'Новая трата'}</h2>
        <div class="field-row">
          <label>За что<input name="title" placeholder="Продукты / бензин / баня" value="${escapeHtml(existing?.title || '')}" /></label>
          <div class="field-row two">
            <label>Сумма, ₽<input name="amount" type="number" inputmode="decimal" min="0" step="0.01" value="${existing?.amount ?? ''}" /></label>
            <label>Кто платил
              <select name="payer">
                ${trip.people.map((p) => `<option value="${p.id}" ${p.id === payerId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
              </select>
            </label>
          </div>
          <div>
            <div class="muted" style="margin-bottom:6px">На кого делим</div>
            <button class="check-all" type="button" data-m="toggle-all">все / снять</button>
            <div class="split-list">
              ${trip.people
                .map(
                  (p) => `
                <label class="split-item ${selected.has(p.id) ? 'on' : ''}">
                  <input type="checkbox" name="split" value="${p.id}" ${selected.has(p.id) ? 'checked' : ''} />
                  ${escapeHtml(p.name)}
                </label>`,
                )
                .join('')}
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary btn-block" type="button" data-m="save-expense">Сохранить</button>
          <button class="btn btn-ghost btn-block" type="button" data-m="close">Отмена</button>
        </div>
      </div>`
  }

  document.body.appendChild(backdrop)
  bindModal(backdrop)

  // split checkbox styling
  backdrop.querySelectorAll('.split-item input').forEach((input) => {
    input.addEventListener('change', () => {
      input.closest('.split-item')?.classList.toggle('on', input.checked)
    })
  })
}

function bindModal(backdrop) {
  backdrop.querySelectorAll('[data-m]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const m = btn.getAttribute('data-m')
      const trip = currentTrip()

      if (m === 'close') {
        closeModal()
        return
      }
      if (m === 'export') {
        exportBackup(state)
        showToast('Файл сохранён')
        closeModal()
        return
      }
      if (m === 'import') {
        backdrop.querySelector('[data-import]')?.click()
        return
      }
      if (m === 'create-trip') {
        const name =
          backdrop.querySelector('[name=name]')?.value.trim() || 'Поход'
        const tripNew = createTrip({ name })
        state.trips.unshift(tripNew)
        persist()
        closeModal()
        tripId = tripNew.id
        screen = 'trip'
        tab = 'people'
        render()
        return
      }
      if (m === 'save-person' && trip) {
        const name = backdrop.querySelector('[name=name]')?.value.trim()
        if (!name) {
          showToast('Имя-то напиши')
          return
        }
        if (modal.payload?.id) {
          const p = trip.people.find((x) => x.id === modal.payload.id)
          if (p) p.name = name
        } else {
          trip.people.push({ id: uid(), name })
        }
        touchTrip(trip)
        persist()
        closeModal()
        render()
        return
      }
      if (m === 'toggle-all') {
        const boxes = [...backdrop.querySelectorAll('[name=split]')]
        const allOn = boxes.every((b) => b.checked)
        boxes.forEach((b) => {
          b.checked = !allOn
          b.closest('.split-item')?.classList.toggle('on', b.checked)
        })
        return
      }
      if (m === 'save-expense' && trip) {
        const title =
          backdrop.querySelector('[name=title]')?.value.trim() || 'Трата'
        const amount = Number(backdrop.querySelector('[name=amount]')?.value)
        const payerId = backdrop.querySelector('[name=payer]')?.value
        const splitAmong = [...backdrop.querySelectorAll('[name=split]:checked')].map(
          (x) => x.value,
        )
        if (!(amount > 0)) {
          showToast('Сумма должна быть больше нуля')
          return
        }
        if (!splitAmong.length) {
          showToast('Выбери хотя бы одного')
          return
        }
        if (modal.payload?.id) {
          const ex = trip.expenses.find((x) => x.id === modal.payload.id)
          if (ex) Object.assign(ex, { title, amount, payerId, splitAmong })
        } else {
          trip.expenses.push({
            id: uid(),
            title,
            amount,
            payerId,
            splitAmong,
          })
          expensesExpanded = true
        }
        touchTrip(trip)
        persist()
        closeModal()
        render()
        return
      }
    })
  })

  const fileInput = backdrop.querySelector('[data-import]')
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      const data = await importBackup(file)
      data.trips.forEach(normalizeTrip)
      if (
        state.trips.length &&
        !confirm(
          `Заменить текущие ${state.trips.length} поход(ов) данными из файла (${data.trips.length})?`,
        )
      ) {
        return
      }
      state = data
      persist()
      closeModal()
      screen = 'home'
      tripId = null
      showToast('Импорт готов')
      render()
    } catch {
      showToast('Не удалось прочитать файл')
    }
  })
}

window.addEventListener('online', () => render())
window.addEventListener('offline', () => render())

async function shareTripLink(trip) {
  try {
    const payload = await encodeSharePayload(trip)
    const url = buildShareUrl(payload)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Алкаунтер: ${trip.name}`,
          text: `Снимок общака «${trip.name}» — только просмотр`,
          url,
        })
        showToast('Отправили ссылку')
        return
      } catch (err) {
        if (err && err.name === 'AbortError') return
      }
    }
    await copyText(url)
  } catch {
    showToast('Не удалось собрать ссылку')
  }
}

async function bootFromHash() {
  const payload = readShareHash()
  if (!payload) {
    render()
    return
  }
  try {
    const trip = await decodeSharePayload(payload)
    if (!trip) throw new Error('bad')
    viewTrip = trip
    screen = 'view'
    expensesExpanded = false
    render()
  } catch {
    clearShareHash()
    showToast('Ссылка битая или устарела')
    render()
  }
}

window.addEventListener('hashchange', () => {
  bootFromHash()
})

bootFromHash()

if ('serviceWorker' in navigator) {
  // vite-plugin-pwa injects registration via virtual module in build;
  // for reliability also try import
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
    .catch(() => {
      /* dev without plugin virtual ok */
    })
}

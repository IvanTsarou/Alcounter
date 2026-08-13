import {
  createTrip,
  settleThroughOrganizer,
  expenseBalances,
  roundMoney,
} from '../src/logic.js'

const trip = createTrip({ name: 'Test' })
trip.people = [
  { id: 'a', name: 'Аня' },
  { id: 'b', name: 'Боря' },
  { id: 'c', name: 'Вася' },
]
trip.expenses = [
  {
    id: 'e1',
    title: 'Еда',
    amount: 3000,
    payerId: 'a',
    splitAmong: ['a', 'b', 'c'],
  },
]

const bal = expenseBalances(trip)
console.assert(roundMoney(bal.a) === 2000, 'A overpaid 2000', bal.a)
console.assert(roundMoney(bal.b) === -1000, 'B owes 1000', bal.b)
console.assert(roundMoney(bal.c) === -1000, 'C owes 1000', bal.c)

const s = settleThroughOrganizer(trip)
const by = Object.fromEntries(s.rows.map((r) => [r.person.id, r]))
console.assert(by.a.toRefund === 2000, 'refund A', by.a)
console.assert(by.b.stillOwes === 1000, 'B owes', by.b)
console.assert(by.c.stillOwes === 1000, 'C owes', by.c)
console.assert(s.toCollect === 2000, 'collect', s.toCollect)

trip.flags = { b: true }
const s2 = settleThroughOrganizer(trip)
console.assert(s2.toCollect === 1000, 'after flag', s2.toCollect)
console.assert(s2.rows.find((r) => r.person.id === 'b').done === true)

console.log('logic ok', { toCollect: s.toCollect, toRefund: s.toRefund })

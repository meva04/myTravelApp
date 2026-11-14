import type { Expense, Trip } from './types';
import { summarizeExpenses } from './expenses';

const trip: Trip = {
  id: 't', name: '', city: '', startDate: '2027-03-01', endDate: '2027-03-03', baseCurrency: 'KRW', rates: { JPY: 9 },
};
const e = (p: Partial<Expense>): Expense => ({
  id: Math.random().toString(), tripId: 't', date: '2027-03-01', stopId: null, amount: 0, currency: 'KRW', category: 'etc', memo: '', ...p,
});

test('sums in base currency by date, category and stop', () => {
  const s = summarizeExpenses(
    [
      e({ amount: 1000, currency: 'JPY', category: 'food', date: '2027-03-01', stopId: 's1' }),
      e({ amount: 5000, currency: 'KRW', category: 'shopping', date: '2027-03-02' }),
      e({ amount: 20, currency: 'EUR', category: 'etc', date: '2027-03-02' }),
    ],
    trip,
  );
  expect(s.total).toBe(14000);
  expect(s.byDate['2027-03-01']).toBe(9000);
  expect(s.byDate['2027-03-02']).toBe(5000);
  expect(s.byCategory.shopping).toBe(5000);
  expect(s.byCategory.food).toBe(9000);
  expect(s.byStop).toEqual({ s1: 9000 });
});

test('expenses in a currency with no rate are kept apart, not dropped', () => {
  const s = summarizeExpenses([e({ amount: 20, currency: 'EUR' }), e({ amount: 5, currency: 'EUR' })], trip);
  expect(s.total).toBe(0);
  expect(s.unconverted).toEqual({ EUR: 25 });
});

test('empty list sums to zero', () => {
  const s = summarizeExpenses([], trip);
  expect(s.total).toBe(0);
  expect(s.byCategory.food).toBe(0);
  expect(s.unconverted).toEqual({});
});

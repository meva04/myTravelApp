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

test('unconverted amounts are also reported per stop and per date', () => {
  const s = summarizeExpenses([e({ amount: 20, currency: 'EUR', stopId: 's1', date: '2027-03-02' })], trip);
  expect(s.unconvertedByStop).toEqual({ s1: { EUR: 20 } });
  expect(s.unconvertedByDate).toEqual({ '2027-03-02': { EUR: 20 } });
});

describe('1/n split', () => {
  const { settle } = jest.requireActual('./expenses') as typeof import('./expenses');
  const trip = {
    id: 't', name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-03', baseCurrency: 'KRW', rates: { JPY: 9 },
    members: [{ id: 'a', name: '민수' }, { id: 'b', name: '지영' }],
  };
  const e = (amount: number, currency: string, paidBy: string | null, splitWith: string[] | null) => ({
    id: Math.random().toString(), tripId: 't', date: '2027-03-01', stopId: null, amount, currency, category: 'food' as const, memo: '', paidBy, splitWith,
  });

  test('each person pays their equal share of the expenses they are in; balances say who owes whom', () => {
    const s = settle([e(30000, 'KRW', null, null), e(2000, 'JPY', 'a', ['a', 'b']), e(500, 'EUR', 'b', null)], trip);
    // 3만원 셋이 1만원씩, 엔화 2000 = 18000원 민수·지영이 9000원씩. 유로는 환율이 없어 빠진다
    expect(s.people.map((p) => [p.name, p.paid, p.share, p.balance])).toEqual([
      ['나', 30000, 10000, 20000],
      ['민수', 18000, 19000, -1000],
      ['지영', 0, 19000, -19000],
    ]);
    expect(s.transfers).toEqual([
      { from: 'b', to: 'me', amount: 19000 },
      { from: 'a', to: 'me', amount: 1000 },
    ]);
    expect(s.unconverted).toEqual({ EUR: 500 });
  });

  test('with nobody else on the trip, there is nothing to settle', () => {
    const s = settle([e(10000, 'KRW', null, null)], { ...trip, members: [] });
    expect(s.transfers).toEqual([]);
    expect(s.people).toEqual([{ id: 'me', name: '나', paid: 10000, share: 10000, balance: 0 }]);
  });
});

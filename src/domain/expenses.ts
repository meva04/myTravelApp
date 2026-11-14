import { CATEGORIES, type Category, type Expense, type Id, type Trip } from './types';

export type Summary = {
  /** 기준 통화 합계 */
  total: number;
  byDate: Record<string, number>;
  byCategory: Record<Category, number>;
  byStop: Record<Id, number>;
  /** 환율이 없어 환산하지 못한 통화별 원금액 합 */
  unconverted: Record<string, number>;
  unconvertedByStop: Record<Id, Record<string, number>>;
  unconvertedByDate: Record<string, Record<string, number>>;
};

export function summarizeExpenses(expenses: Expense[], trip: Trip): Summary {
  const s: Summary = {
    total: 0,
    byDate: {},
    byCategory: Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>,
    byStop: {},
    unconverted: {},
    unconvertedByStop: {},
    unconvertedByDate: {},
  };
  for (const e of expenses) {
    const rate = e.currency === trip.baseCurrency ? 1 : trip.rates[e.currency];
    if (!rate) {
      s.unconverted[e.currency] = (s.unconverted[e.currency] ?? 0) + e.amount;
      const byDate = (s.unconvertedByDate[e.date] ??= {});
      byDate[e.currency] = (byDate[e.currency] ?? 0) + e.amount;
      if (e.stopId) {
        const byStop = (s.unconvertedByStop[e.stopId] ??= {});
        byStop[e.currency] = (byStop[e.currency] ?? 0) + e.amount;
      }
      continue;
    }
    const v = e.amount * rate;
    s.total += v;
    s.byDate[e.date] = (s.byDate[e.date] ?? 0) + v;
    s.byCategory[e.category] += v;
    if (e.stopId) s.byStop[e.stopId] = (s.byStop[e.stopId] ?? 0) + v;
  }
  return s;
}

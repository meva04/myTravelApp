import { CATEGORIES, ME, type Category, type Expense, type Id, type Trip } from './types';

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

/** 여행에 함께하는 모든 사람 (나 + 같이 가는 사람) */
export function peopleOf(trip: Trip): { id: Id; name: string }[] {
  return [{ id: ME, name: '나' }, ...(trip.members ?? [])];
}

/** 그 비용을 나눌 사람들. 정하지 않았거나 모두 빠졌으면 모든 사람. */
export function splitOf(e: Expense, trip: Trip): Id[] {
  const all = peopleOf(trip).map((p) => p.id);
  const chosen = (e.splitWith ?? []).filter((id) => all.includes(id));
  return chosen.length ? chosen : all;
}

export type PersonBalance = {
  id: Id;
  name: string;
  /** 직접 낸 돈 (기준 통화) */
  paid: number;
  /** 자기 몫 */
  share: number;
  /** 받을 돈(+) / 낼 돈(−) */
  balance: number;
};
export type Transfer = { from: Id; to: Id; amount: number };
export type Settlement = { people: PersonBalance[]; transfers: Transfer[]; unconverted: Record<string, number> };

/**
 * 1/n 정산: 비용마다 낸 사람이 다 내고, 나눌 사람들이 똑같이 나눠 진다.
 * 결과는 사람별 낸 돈·몫·차액과, 가장 적은 횟수로 갚는 송금 목록.
 * 환율이 없는 통화는 계산에서 빼고 따로 알려 준다.
 */
export function settle(expenses: Expense[], trip: Trip): Settlement {
  const people = peopleOf(trip);
  const by = new Map(people.map((p) => [p.id, { ...p, paid: 0, share: 0, balance: 0 }]));
  const unconverted: Record<string, number> = {};
  for (const e of expenses) {
    const rate = e.currency === trip.baseCurrency ? 1 : trip.rates[e.currency];
    if (!rate) {
      unconverted[e.currency] = (unconverted[e.currency] ?? 0) + e.amount;
      continue;
    }
    const v = e.amount * rate;
    const payer = by.get(e.paidBy ?? ME) ?? by.get(ME)!;
    payer.paid += v;
    const split = splitOf(e, trip);
    for (const id of split) by.get(id)!.share += v / split.length;
  }
  const out = [...by.values()].map((p) => ({ ...p, balance: p.paid - p.share }));

  // 가장 많이 낼 사람이 가장 많이 받을 사람에게 보내는 식으로 맞춘다
  const EPS = 0.005;
  const debt = out.filter((p) => p.balance < -EPS).map((p) => ({ id: p.id, left: -p.balance })).sort((a, b) => b.left - a.left);
  const credit = out.filter((p) => p.balance > EPS).map((p) => ({ id: p.id, left: p.balance })).sort((a, b) => b.left - a.left);
  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < credit.length) {
    const amount = Math.min(debt[i].left, credit[j].left);
    transfers.push({ from: debt[i].id, to: credit[j].id, amount });
    debt[i].left -= amount;
    credit[j].left -= amount;
    if (debt[i].left <= EPS) i++;
    if (credit[j].left <= EPS) j++;
  }
  return { people: out, transfers, unconverted };
}

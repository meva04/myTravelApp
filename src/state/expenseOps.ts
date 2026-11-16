// 비용 저장과 환율: 적는 순간의 환율을 함께 저장해 "그 날 환율" 로 원화 합계를 낸다.
import { currencyOfPlace } from '@/domain/currency';
import type { Expense, Trip } from '@/domain/types';

import type { Services } from './services';

/** 받은 환율을 여행에 저장한다 (받은 통화만 덮어쓴다). 저장된 최신 여행을 다시 읽어 덮어쓰므로 다른 변경을 잃지 않는다. */
async function saveRates(sv: Services, tripId: string, rates: Record<string, number>): Promise<Trip | null> {
  const trip = await sv.repo.getTrip(tripId);
  if (!trip) return null;
  const changed = Object.entries(rates).filter(([c, r]) => r && trip.rates[c] !== r);
  if (!changed.length) return trip;
  const updated = { ...trip, rates: { ...trip.rates, ...Object.fromEntries(changed) } };
  await sv.repo.updateTrip(updated);
  return updated;
}

/** 오늘 환율을 받아 여행에 저장한다. 인터넷이 없으면 저장된 환율 그대로. 최신 여행을 돌려준다. */
export async function refreshRates(sv: Services, trip: Trip, currencies: string[]): Promise<Trip> {
  const wanted = [...new Set(currencies.filter((c) => c && c !== trip.baseCurrency))];
  if (!wanted.length) return trip;
  try {
    const { rates } = await sv.fx.latest(trip.baseCurrency);
    return (await saveRates(sv, trip.id, Object.fromEntries(wanted.filter((c) => rates[c]).map((c) => [c, rates[c]])))) ?? trip;
  } catch {
    return trip;
  }
}

/**
 * 비용을 적는다. 다른 통화면 오늘 환율을 받아 그 비용에 함께 저장한다.
 * 인터넷이 없으면 환율을 비워 두고, 여행에 저장된(나중에 고칠 수 있는) 환율로 계산한다.
 */
export async function addExpense(sv: Services, trip: Trip, e: Omit<Expense, 'id' | 'tripId' | 'rate'>): Promise<Expense> {
  let rate: number | null = null;
  if (e.currency !== trip.baseCurrency) {
    try {
      const { rates } = await sv.fx.latest(trip.baseCurrency);
      rate = rates[e.currency] ?? null;
      if (rate) await saveRates(sv, trip.id, { [e.currency]: rate });
    } catch {
      rate = null;
    }
  }
  return sv.repo.addExpense({ ...e, tripId: trip.id, rate });
}

/** 현지 통화를 아직 정하지 않은 여행은 첫 도시 이름으로 정해 둔다 (예: '런던' → GBP). */
export async function ensureLocalCurrency(sv: Services, trip: Trip): Promise<Trip> {
  if (trip.localCurrency) return trip;
  const cur = currencyOfPlace(trip.city.split(',')[0] ?? '') ?? currencyOfPlace(trip.city);
  if (!cur) return trip;
  const latest = (await sv.repo.getTrip(trip.id)) ?? trip;
  const updated = { ...latest, localCurrency: cur };
  await sv.repo.updateTrip(updated);
  return updated;
}

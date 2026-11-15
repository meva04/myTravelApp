// 인천공항 출발·도착편의 당일 운항 정보 (공공데이터포털 "인천국제공항공사_여객편 운항현황", 무료).
// 이 API 는 조회 당일 자료만 주고 기종은 없다. 그래서 예약할 때는 직접 입력하고,
// 비행 당일에 게이트·터미널·체크인 카운터·지연 여부를 채운다.
import { callJson } from '@/google/errors';

export class NoFlightKeyError extends Error {
  constructor() {
    super('no flight api key');
    this.name = 'NoFlightKeyError';
  }
}

type Item = {
  flightId?: string;
  airline?: string;
  scheduleDateTime?: string; // 'HHMM'
  estimatedDateTime?: string;
  airport?: string;
  airportCode?: string;
  terminalId?: string;
  gatenumber?: string;
  chkinrange?: string;
  remark?: string;
};

/** 오늘 인천공항에서 그 편의 운항 정보 */
export type FlightToday = {
  direction: 'departure' | 'arrival';
  carrier?: string;
  /** 상대 공항 (출발편이면 도착지, 도착편이면 출발지) */
  otherAirport?: string;
  otherAirportCode?: string;
  scheduled?: string; // 'HH:mm'
  estimated?: string;
  terminal?: string;
  gate?: string;
  checkin?: string;
  /** 출발, 지연, 탑승중, 결항 … */
  status?: string;
};

const BASE = 'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsOdp';
const TERMINAL: Record<string, string> = { P01: 'T1', P02: 'T1 탑승동', P03: 'T2', C01: 'T1', C02: 'T1 탑승동', C03: 'T2' };
const hhmm = (s?: string) => (s && /^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : undefined);

/** 공공데이터포털 응답에서 항목 목록을 꺼낸다 (items 가 배열이거나 {item: …} 이다) */
function itemsOf(res: unknown): Item[] {
  const items = (res as { response?: { body?: { items?: unknown } } })?.response?.body?.items;
  if (Array.isArray(items)) return items as Item[];
  const inner = (items as { item?: Item | Item[] } | undefined)?.item;
  return Array.isArray(inner) ? inner : inner ? [inner] : [];
}

export const normalizeFlightNo = (s: string) => s.replace(/\s+/g, '').toUpperCase();

export function makeFlights(fetchFn: typeof fetch, serviceKey: string) {
  const get = async (op: string, flightNo: string): Promise<Item[]> => {
    const q = new URLSearchParams({ serviceKey, flight_id: flightNo, type: 'json', lang: 'K' });
    return itemsOf(await callJson<unknown>(fetchFn, `${BASE}/${op}?${q.toString()}`, { method: 'GET' }));
  };
  return {
    available: serviceKey !== '',
    /** 오늘 인천공항 출발 또는 도착하는 그 편. 없으면 null. */
    async today(flightNo: string): Promise<FlightToday | null> {
      if (!serviceKey) throw new NoFlightKeyError();
      const no = normalizeFlightNo(flightNo);
      for (const [op, direction] of [['getPassengerDeparturesOdp', 'departure'], ['getPassengerArrivalsOdp', 'arrival']] as const) {
        const it = (await get(op, no)).find((x) => normalizeFlightNo(x.flightId ?? '') === no);
        if (it) {
          return {
            direction,
            carrier: it.airline,
            otherAirport: it.airport,
            otherAirportCode: it.airportCode,
            scheduled: hhmm(it.scheduleDateTime),
            estimated: hhmm(it.estimatedDateTime),
            terminal: it.terminalId ? (TERMINAL[it.terminalId] ?? it.terminalId) : undefined,
            gate: it.gatenumber || undefined,
            checkin: it.chkinrange || undefined,
            status: it.remark || undefined,
          };
        }
      }
      return null;
    },
  };
}

export type Flights = ReturnType<typeof makeFlights>;

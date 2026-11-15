// 편명으로 항공편 정보(공항·시간·터미널·게이트·기종)를 찾는다. AeroDataBox(RapidAPI) 키가 있을 때만 쓴다.
import { callJson } from '@/google/errors';
import type { Booking } from '@/domain/types';

type Movement = {
  airport?: { iata?: string; name?: string; shortName?: string; municipalityName?: string; location?: { lat: number; lon: number } };
  scheduledTime?: { local?: string; utc?: string };
  revisedTime?: { local?: string };
  terminal?: string;
  gate?: string;
};
type ApiFlight = { number?: string; status?: string; departure?: Movement; arrival?: Movement; aircraft?: { model?: string }; airline?: { name?: string } };

export class NoFlightKeyError extends Error {
  constructor() {
    super('no flight api key');
    this.name = 'NoFlightKeyError';
  }
}

export type FlightInfo = Pick<Booking, 'title' | 'carrier' | 'from' | 'to' | 'departDate' | 'departTime' | 'arriveDate' | 'arriveTime' | 'terminal' | 'gate' | 'vehicle'> & { status?: string };

/** '2027-03-01 10:05+09:00' → ['2027-03-01', '10:05'] (그 공항의 현지 시각) */
export function splitLocal(s?: string): [string | undefined, string | undefined] {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? [m[1], m[2]] : [undefined, undefined];
}

const place = (m?: Movement) =>
  m?.airport?.location
    ? {
        name: `${m.airport.municipalityName ?? m.airport.shortName ?? m.airport.name ?? ''} ${m.airport.iata ?? ''}`.trim() || (m.airport.name ?? ''),
        code: m.airport.iata,
        placeId: null,
        lat: m.airport.location.lat,
        lng: m.airport.location.lon,
        address: m.airport.name,
      }
    : undefined;

/** 편명 정리: 'ke 17' → 'KE17' */
export const normalizeFlightNo = (s: string) => s.replace(/\s+/g, '').toUpperCase();

export function makeFlights(fetchFn: typeof fetch, apiKey: string) {
  return {
    available: apiKey !== '',
    /** 그 날(출발지 현지 날짜) 그 편명의 항공편. 없으면 null. */
    async lookup(number: string, date: string): Promise<FlightInfo | null> {
      if (!apiKey) throw new NoFlightKeyError();
      const no = normalizeFlightNo(number);
      const list = await callJson<ApiFlight[]>(fetchFn, `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(no)}/${date}?dateLocalRole=Departure`, {
        method: 'GET',
        headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' },
      }).catch((e) => {
        if (e?.status === 204 || e?.status === 404) return [];
        throw e;
      });
      const f = Array.isArray(list) ? list[0] : undefined;
      if (!f) return null;
      const [departDate, departTime] = splitLocal(f.departure?.revisedTime?.local ?? f.departure?.scheduledTime?.local);
      const [arriveDate, arriveTime] = splitLocal(f.arrival?.revisedTime?.local ?? f.arrival?.scheduledTime?.local);
      return {
        title: no,
        carrier: f.airline?.name,
        from: place(f.departure),
        to: place(f.arrival),
        departDate, departTime, arriveDate, arriveTime,
        terminal: f.departure?.terminal,
        gate: f.departure?.gate,
        vehicle: f.aircraft?.model,
        status: f.status,
      };
    },
  };
}

export type Flights = ReturnType<typeof makeFlights>;

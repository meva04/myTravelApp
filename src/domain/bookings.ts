// 숙소·교통편 예약을 일정의 장소로 바꾼다.
import type { Booking, BookingPlace, PlaceKind } from './types';

/** 일정에 넣을 자리: 그날 맨 앞, 맨 끝, 또는 예정 시간 순서에 맞게 */
export type Placement = 'start' | 'end' | 'time';
export type BookingStop = { date: string; place: BookingPlace; time: string | null; position: Placement; kind: PlaceKind; planNote: string };

const KIND: Record<Booking['kind'], PlaceKind> = { lodging: 'lodging', flight: 'airport', train: 'station', ship: 'port', bus: 'station' };

/** 예약 하나가 일정에 만드는 장소들. 여행 날짜 밖의 것은 뺀다. */
export function bookingStops(b: Booking, dates: string[]): BookingStop[] {
  const inTrip = (d?: string) => !!d && dates.includes(d);
  const out: BookingStop[] = [];
  if (b.kind === 'lodging') {
    if (!b.place || !b.checkIn || !b.checkOut) return [];
    for (const date of dates) {
      if (date < b.checkIn || date > b.checkOut) continue;
      const base = { date, place: b.place, kind: KIND.lodging };
      // 체크인 날은 하루의 끝에, 체크아웃 날은 하루의 시작에. 사이의 날은 아침에 나서고 저녁에 돌아온다.
      if (date !== b.checkIn) out.push({ ...base, time: date === b.checkOut ? (b.checkOutTime ?? null) : null, position: 'start', planNote: date === b.checkOut ? '[ ] 체크아웃' : '' });
      if (date !== b.checkOut) out.push({ ...base, time: date === b.checkIn ? (b.checkInTime ?? null) : null, position: 'end', planNote: date === b.checkIn ? '[ ] 체크인' : '' });
    }
    return out;
  }
  const label = [b.title, b.seat && `좌석 ${b.seat}`].filter(Boolean).join(' · ');
  if (b.from && inTrip(b.departDate)) {
    out.push({ date: b.departDate!, place: b.from, time: b.departTime ?? null, position: 'time', kind: KIND[b.kind], planNote: `[ ] ${label} 출발` });
  }
  if (b.to && inTrip(b.arriveDate)) {
    out.push({ date: b.arriveDate!, place: b.to, time: b.arriveTime ?? null, position: 'time', kind: KIND[b.kind], planNote: '' });
  }
  return out;
}

/** 'HH:mm' 으로 정렬할 자리. 시간 있는 장소들 사이에서 이 시간보다 늦은 첫 장소 앞. */
export function timeSlot(times: (string | null)[], time: string | null): number {
  if (!time) return -1;
  return times.findIndex((t) => t !== null && t > time);
}

/** 예약 요약 한 줄 (일정 카드 아래에 보인다) */
export function bookingLine(b: Booking, stopName: string): string {
  if (b.kind === 'lodging') return [b.confirmation && `예약 ${b.confirmation}`].filter(Boolean).join(' · ');
  const departing = b.from?.name === stopName;
  const parts = [
    b.carrier,
    b.title,
    departing && b.status && b.status !== '출발' ? b.status : null,
    departing && b.estimated && b.estimated !== b.departTime ? `변경 ${b.estimated}` : null,
    departing ? b.terminal && `터미널 ${b.terminal}` : null,
    departing ? b.checkin && `카운터 ${b.checkin}` : null,
    departing ? b.gate && `게이트 ${b.gate}` : null,
    b.car && `${b.car}호차`,
    b.seat && `좌석 ${b.seat}`,
  ];
  return parts.filter(Boolean).join(' · ');
}

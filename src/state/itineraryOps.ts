// 일정을 바꾸는 저장 작업들. 방문지 목록과 구간(경로)을 늘 함께 맞춘다.
import { bookingStops, timeSlot, type Placement } from '@/domain/bookings';
import { moveToDay, removeStop, syncLegs } from '@/domain/itinerary';
import type { Booking, Day, Id, PlaceKind, SeqItem, Stop } from '@/domain/types';

import type { Services } from './services';

type Sv = Pick<Services, 'repo' | 'newId' | 'onItineraryChanged'>;

/** 그날의 방문지 구성을 저장하고 구간을 다시 맞춘다. */
export async function saveDay(sv: Sv, dayId: Id, stops: Stop[], sequence?: SeqItem[]): Promise<void> {
  await sv.repo.saveStops(dayId, stops, sequence);
  await syncDayLegs(sv, dayId);
}

async function syncDayLegs(sv: Sv, dayId: Id): Promise<void> {
  await sv.repo.saveLegs(dayId, syncLegs(await sv.repo.listStops(dayId), await sv.repo.listLegs(dayId), sv.newId));
}

/** 장소와 이동 메모를 끌어 옮긴 새 순서를 저장한다. */
export async function saveOrder(sv: Sv, dayId: Id, items: SeqItem[]): Promise<void> {
  await sv.repo.saveSequence(dayId, items);
  await syncDayLegs(sv, dayId);
  sv.onItineraryChanged();
}

/** 계획에서 숨기거나 다시 넣는다. 숨긴 장소는 경로·지도·도착 감지·예정 알림에서 빠진다. */
export async function setSkipped(sv: Sv, stop: Stop, skipped: boolean): Promise<void> {
  await sv.repo.setStopSkipped(stop.id, skipped);
  await syncDayLegs(sv, stop.dayId);
  sv.onItineraryChanged();
}

export async function deleteStop(sv: Sv, stop: Stop): Promise<void> {
  await saveDay(sv, stop.dayId, removeStop(await sv.repo.listStops(stop.dayId), stop.id));
  sv.onItineraryChanged();
}

/** 다른 날의 맨 끝으로 옮긴다. 그 장소에 적은 비용도 그날로 따라간다. */
export async function moveStop(sv: Sv, stop: Stop, target: Day): Promise<void> {
  if (target.id === stop.dayId) return;
  // 옮기는 방문지를 먼저 대상 날에 저장해야 사진·비용이 따라간다.
  const r = moveToDay(stop, await sv.repo.listStops(stop.dayId), await sv.repo.listStops(target.id), target.id);
  await saveDay(sv, target.id, r.to);
  await saveDay(sv, stop.dayId, r.from);
  await sv.repo.setExpenseDateForStop(stop.id, target.date);
  sv.onItineraryChanged();
}

export type NewPlace = { placeId: string | null; name: string; lat: number; lng: number; kind?: PlaceKind | null };

/**
 * 장소들을 그날 일정에 넣는다. 예정 시간이 있으면 시간 순서에 맞는 자리에, 없으면 그날 끝(밤에 돌아갈 숙소 앞)에.
 * position 으로 맨 앞·맨 끝을 정할 수도 있다.
 */
export async function addStops(
  sv: Sv,
  dayId: Id,
  places: { place: NewPlace; extra?: Partial<Stop>; position?: Placement }[],
  notify = true,
): Promise<Stop[]> {
  const added: Stop[] = [];
  for (const { place, extra, position } of places) {
    const stops = await sv.repo.listStops(dayId);
    const seq = await sv.repo.listSequence(dayId);
    const stop: Stop = {
      id: sv.newId(), dayId, order: 0, placeId: place.placeId, name: place.name, lat: place.lat, lng: place.lng, kind: place.kind ?? null, bookingId: null,
      plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '', ...extra,
    };
    const byId = new Map(stops.map((s) => [s.id, s]));
    const stopAt = seq.map((x) => (x.kind === 'stop' ? byId.get(x.id) : undefined));
    let at = -1;
    if (position === 'start') at = 0;
    else if (position !== 'end' && stop.plannedTime) at = timeSlot(stopAt.map((s) => s?.plannedTime ?? null), stop.plannedTime);
    if (at < 0 && position !== 'end') {
      // 그날 끝에 이어진 숙소(밤에 돌아갈 곳) 앞
      // (아침에 나서는 첫 숙소는 건너뛰지 않는다)
      const first = seq.findIndex((x) => x.kind === 'stop');
      at = seq.length;
      while (at - 1 > first && (seq[at - 1].kind === 'note' || stopAt[at - 1]?.kind === 'lodging')) at--;
      while (at < seq.length && seq[at].kind === 'note') at++;
    }
    if (at < 0) at = seq.length;
    const nextSeq: SeqItem[] = [...seq.slice(0, at), { kind: 'stop', id: stop.id }, ...seq.slice(at)];
    await saveDay(sv, dayId, [...stops, stop], nextSeq);
    added.push(stop);
  }
  if (notify) sv.onItineraryChanged();
  return added;
}

/** 예약을 저장하고, 예전에 그 예약으로 만든 장소를 지운 뒤 날짜에 맞게 다시 넣는다. */
export async function applyBooking(sv: Sv, booking: Booking): Promise<void> {
  await sv.repo.saveBooking(booking);
  await clearBookingStops(sv, booking.id);
  const days = await sv.repo.listDays(booking.tripId);
  for (const bs of bookingStops(booking, days.map((d) => d.date))) {
    const day = days.find((d) => d.date === bs.date)!;
    await addStops(
      sv,
      day.id,
      [{ place: { ...bs.place, kind: bs.kind }, extra: { bookingId: booking.id, plannedTime: bs.time, planNote: bs.planNote }, position: bs.position }],
      false,
    );
  }
  sv.onItineraryChanged();
}

async function clearBookingStops(sv: Sv, bookingId: Id): Promise<void> {
  for (const s of await sv.repo.listStopsByBooking(bookingId)) {
    await saveDay(sv, s.dayId, removeStop(await sv.repo.listStops(s.dayId), s.id));
  }
}

export async function removeBooking(sv: Sv, bookingId: Id): Promise<void> {
  await clearBookingStops(sv, bookingId);
  await sv.repo.deleteBooking(bookingId);
  sv.onItineraryChanged();
}

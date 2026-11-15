// 일정을 바꾸는 저장 작업들. 방문지 목록과 구간(경로)을 늘 함께 맞춘다.
import { moveToDay, removeStop, syncLegs } from '@/domain/itinerary';
import type { Day, Id, Stop } from '@/domain/types';

import type { Services } from './services';

type Sv = Pick<Services, 'repo' | 'newId' | 'onItineraryChanged'>;

/** 그날의 방문지 구성을 저장하고 구간을 다시 맞춘다. */
export async function saveDay(sv: Sv, dayId: Id, stops: Stop[]): Promise<void> {
  await sv.repo.saveStops(dayId, stops);
  await sv.repo.saveLegs(dayId, syncLegs(stops, await sv.repo.listLegs(dayId), sv.newId));
}

/** 계획에서 숨기거나 다시 넣는다. 숨긴 장소는 경로·지도·도착 감지·예정 알림에서 빠진다. */
export async function setSkipped(sv: Sv, stop: Stop, skipped: boolean): Promise<void> {
  await sv.repo.setStopSkipped(stop.id, skipped);
  await saveDay(sv, stop.dayId, await sv.repo.listStops(stop.dayId));
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

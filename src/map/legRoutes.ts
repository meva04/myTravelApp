import type { Id, Leg, Stop, TravelMode } from '@/domain/types';
import { GoogleApiError, OfflineError } from '@/google/errors';
import type { Services } from '@/state/services';

export type LegStatus = 'ready' | 'loading' | 'offline' | 'error';
export type LegRoutes = { stops: Stop[]; legs: Leg[]; status: Record<Id, LegStatus> };

/**
 * 그 날의 구간 경로를 준비한다. 이미 받아둔 경로는 그대로 쓰고(오프라인에서도 보임),
 * 비어 있는 구간만 구글에서 받아 저장한다.
 */
export async function loadLegRoutes(sv: Pick<Services, 'repo' | 'routes'>, dayId: Id): Promise<LegRoutes> {
  const stops = await sv.repo.listStops(dayId);
  const byId = new Map(stops.map((s) => [s.id, s]));
  const legs = await sv.repo.listLegs(dayId);
  const status: Record<Id, LegStatus> = {};
  let dirty = false;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.options.length > 0) {
      status[leg.id] = 'ready';
      continue;
    }
    const from = byId.get(leg.fromStopId);
    const to = byId.get(leg.toStopId);
    if (!from || !to) {
      status[leg.id] = 'error';
      continue;
    }
    try {
      const option = await sv.routes.compute({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, leg.mode);
      legs[i] = { ...leg, options: [option], selectedOptionId: option.id };
      status[leg.id] = 'ready';
      dirty = true;
    } catch (e) {
      if (e instanceof OfflineError) status[leg.id] = 'offline';
      else if (e instanceof GoogleApiError) status[leg.id] = 'error';
      else throw e;
    }
  }
  if (dirty) await sv.repo.saveLegs(dayId, legs);
  return { stops, legs, status };
}

/** 구간의 이동 수단을 바꾼다. 이전 경로는 버리고 새로 받는다. */
export async function changeLegMode(sv: Pick<Services, 'repo' | 'routes'>, dayId: Id, legId: Id, mode: TravelMode): Promise<LegRoutes> {
  const legs = await sv.repo.listLegs(dayId);
  await sv.repo.saveLegs(
    dayId,
    legs.map((l) => (l.id === legId ? { ...l, mode, options: [], selectedOptionId: null } : l)),
  );
  return loadLegRoutes(sv, dayId);
}

export const selectedOption = (leg: Leg) => leg.options.find((o) => o.id === leg.selectedOptionId) ?? leg.options[0];

import type { Id, Leg, Stop, TravelMode } from '@/domain/types';
import { GoogleApiError, OfflineError } from '@/google/errors';
import type { Repo } from '@/db/repo';
import type { Services } from '@/state/services';

export type LegStatus = 'ready' | 'loading' | 'offline' | 'error';
export type LegRoutes = { stops: Stop[]; legs: Leg[]; status: Record<Id, LegStatus> };
type Sv = Pick<Services, 'repo' | 'routes'>;

const errorStatus = (e: unknown): LegStatus => (e instanceof OfflineError ? 'offline' : 'error');

/** 저장된 방문지·구간만 읽는다. 네트워크를 쓰지 않으므로 오프라인에서도 바로 보인다. */
export async function readLegRoutes(sv: Pick<Services, 'repo'>, dayId: Id): Promise<LegRoutes> {
  const stops = await sv.repo.listStops(dayId);
  const legs = await sv.repo.listLegs(dayId);
  const status: Record<Id, LegStatus> = {};
  for (const l of legs) status[l.id] = l.options.length > 0 ? 'ready' : 'loading';
  return { stops, legs, status };
}

// 같은 날을 동시에 두 번 불러도 구글 요청은 한 번만 (요금·저장 충돌 방지).
const inFlight = new WeakMap<Repo, Map<Id, Promise<LegRoutes>>>();

/**
 * 비어 있는 구간만 구글에서 받아 저장한다. 이미 받아둔 경로는 그대로 쓴다.
 * 어떤 실패도 화면을 깨뜨리지 않고 해당 구간의 상태로만 남는다.
 */
export function loadLegRoutes(sv: Sv, dayId: Id): Promise<LegRoutes> {
  let byDay = inFlight.get(sv.repo);
  if (!byDay) inFlight.set(sv.repo, (byDay = new Map()));
  const running = byDay.get(dayId);
  if (running) return running;
  const run = fetchMissing(sv, dayId).finally(() => byDay!.delete(dayId));
  byDay.set(dayId, run);
  return run;
}

async function fetchMissing(sv: Sv, dayId: Id): Promise<LegRoutes> {
  const { stops, legs, status } = await readLegRoutes(sv, dayId);
  const byId = new Map(stops.map((s) => [s.id, s]));
  const fetched = new Map<Id, Leg>();

  await Promise.all(
    legs
      .filter((l) => l.options.length === 0)
      .map(async (leg) => {
        const from = byId.get(leg.fromStopId);
        const to = byId.get(leg.toStopId);
        if (!from || !to) return void (status[leg.id] = 'error');
        try {
          const option = await sv.routes.compute({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, leg.mode);
          fetched.set(leg.id, { ...leg, options: [option], selectedOptionId: option.id });
          status[leg.id] = 'ready';
        } catch (e) {
          status[leg.id] = errorStatus(e);
        }
      }),
  );

  if (fetched.size === 0) return { stops, legs, status };
  // 받는 사이에 일정이 바뀌었을 수 있으니 최신 구간 목록에 덧입혀 저장한다.
  const latest = (await sv.repo.listLegs(dayId)).map((l) => (l.options.length === 0 && fetched.get(l.id)) || l);
  await sv.repo.saveLegs(dayId, latest);
  return { stops, legs: latest, status };
}

/** 구간의 이동 수단을 바꾼다. 새 경로를 받은 뒤에만 바꾸므로, 실패해도 기존 경로가 남는다. */
export async function changeLegMode(sv: Sv, dayId: Id, legId: Id, mode: TravelMode): Promise<LegRoutes> {
  const current = await readLegRoutes(sv, dayId);
  const leg = current.legs.find((l) => l.id === legId);
  const from = current.stops.find((s) => s.id === leg?.fromStopId);
  const to = current.stops.find((s) => s.id === leg?.toStopId);
  if (!leg || !from || !to) return current;
  try {
    const option = await sv.routes.compute({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, mode);
    const legs = (await sv.repo.listLegs(dayId)).map((l) => (l.id === legId ? { ...l, mode, options: [option], selectedOptionId: option.id } : l));
    await sv.repo.saveLegs(dayId, legs);
    return { ...current, legs, status: { ...current.status, [legId]: 'ready' } };
  } catch (e) {
    return { ...current, status: { ...current.status, [legId]: errorStatus(e) } };
  }
}

export const selectedOption = (leg: Leg) => leg.options.find((o) => o.id === leg.selectedOptionId) ?? leg.options[0];

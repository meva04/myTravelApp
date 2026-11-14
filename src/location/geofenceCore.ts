import type { Repo } from '@/db/repo';
import { pickRegions, type GeofenceRegion } from '@/domain/arrival';
import type { Id, LatLng, Stop } from '@/domain/types';
import { t } from '@/i18n/ko';

export type LocationAccess = 'always' | 'whenInUse' | 'denied';

export type GeofenceDeps = {
  repo: Repo;
  getAccess: () => Promise<LocationAccess>;
  getPosition: () => Promise<LatLng | null>;
  start: (regions: GeofenceRegion[]) => Promise<void>;
  stop: () => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
  now: () => string; // ISO
  today: () => string; // 'YYYY-MM-DD' (기기 현지 날짜)
};

const MAX_REGIONS = 20;

const nextDate = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

async function stopsOn(repo: Repo, date: string): Promise<Stop[]> {
  const stops: Stop[] = [];
  for (const day of await repo.listDaysByDate(date)) stops.push(...(await repo.listStops(day.id)));
  return stops;
}

/**
 * 오늘 일정의 미도착 방문지를 감시 대상으로 다시 등록한다. 자리가 남으면 내일 일정도 미리 넣어
 * 자정이 지나도(앱을 열지 않아도) 감지가 이어지게 한다. "항상 허용"이 아니면 아무것도 하지 않는다.
 */
export async function refreshGeofences(deps: GeofenceDeps): Promise<void> {
  if ((await deps.getAccess()) !== 'always') return;
  const here = await deps.getPosition();
  const today = deps.today();
  const regions = pickRegions(await stopsOn(deps.repo, today), here, MAX_REGIONS);
  if (regions.length < MAX_REGIONS) {
    regions.push(...pickRegions(await stopsOn(deps.repo, nextDate(today)), here, MAX_REGIONS - regions.length));
  }
  if (regions.length === 0) await deps.stop();
  else await deps.start(regions);
}

/** 감시 중인 장소에 들어왔을 때. 오늘 일정의 첫 도착만 기록하고 알린다. */
export async function handleEnter(deps: GeofenceDeps, stopId: Id): Promise<void> {
  const stop = await deps.repo.getStop(stopId);
  if (!stop) return;
  const day = await deps.repo.getDay(stop.dayId);
  if (day?.date !== deps.today()) return; // 내일 일정을 미리 지나친 것은 도착이 아니다
  if (!(await deps.repo.markStopArrived(stopId, deps.now(), 'auto'))) return;
  try {
    await deps.notify(t('arrival.notifyTitle', { name: stop.name }), t('arrival.notifyBody'));
  } catch {
    // 알림을 못 보내도 도착 기록과 다음 감시 등록은 이어져야 한다.
  }
  await refreshGeofences(deps);
}

import type { Repo } from '@/db/repo';
import { markArrived, pickRegions, type GeofenceRegion } from '@/domain/arrival';
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

/** 오늘 일정의 미도착 방문지를 감시 대상으로 다시 등록한다. "항상 허용"이 아니면 아무것도 하지 않는다. */
export async function refreshGeofences(deps: GeofenceDeps): Promise<void> {
  if ((await deps.getAccess()) !== 'always') return;
  const stops: Stop[] = [];
  for (const day of await deps.repo.listDaysByDate(deps.today())) {
    stops.push(...(await deps.repo.listStops(day.id)));
  }
  const regions = pickRegions(stops, await deps.getPosition());
  if (regions.length === 0) await deps.stop();
  else await deps.start(regions);
}

/** 감시 중인 장소에 들어왔을 때. 첫 도착만 기록하고 알린다. */
export async function handleEnter(deps: GeofenceDeps, stopId: Id): Promise<void> {
  const stop = await deps.repo.getStop(stopId);
  if (!stop) return;
  const arrived = markArrived(stop, deps.now(), 'auto');
  if (arrived === stop) return;
  await deps.repo.updateStop(arrived);
  await deps.notify(t('arrival.notifyTitle', { name: stop.name }), t('arrival.notifyBody'));
  await refreshGeofences(deps);
}

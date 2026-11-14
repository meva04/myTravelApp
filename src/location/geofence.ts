// 실제 기기 연결: 일정에 있는 장소 반경에 들어오면 앱이 꺼져 있어도 이 태스크가 실행된다.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { getServices } from '@/state/services';

import { handleEnter, refreshGeofences as refreshCore, type GeofenceDeps } from './geofenceCore';
import { getLocationAccess } from './permissions';

export const GEOFENCE_TASK = 'tripnote-arrival';

/** 기기 현지 날짜 'YYYY-MM-DD' */
export function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function deps(): Promise<GeofenceDeps> {
  const { repo } = await getServices();
  return {
    repo,
    getAccess: getLocationAccess,
    getPosition: async () => {
      const pos = await Location.getLastKnownPositionAsync().catch(() => null);
      return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
    },
    start: (regions) =>
      Location.startGeofencingAsync(
        GEOFENCE_TASK,
        regions.map((r) => ({ ...r, notifyOnEnter: true, notifyOnExit: false })),
      ),
    stop: async () => {
      if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    },
    notify: async (title, body) => {
      await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
    },
    now: () => new Date().toISOString(),
    today: () => localToday(),
  };
}

export async function refreshGeofences(): Promise<void> {
  try {
    await refreshCore(await deps());
  } catch (e) {
    // 감지 등록 실패가 앱 사용을 막아서는 안 된다. 수동 도착 체크는 계속 된다.
    console.warn('refreshGeofences failed', e);
  }
}

type GeofenceEvent = { eventType: Location.LocationGeofencingEventType; region: Location.LocationRegion };

TaskManager.defineTask<GeofenceEvent>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  if (data.eventType !== Location.LocationGeofencingEventType.Enter) return;
  if (!data.region.identifier) return;
  await handleEnter(await deps(), data.region.identifier);
});

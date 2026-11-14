import * as Location from 'expo-location';

import type { LocationAccess } from './geofenceCore';

export type { LocationAccess };

export async function getLocationAccess(): Promise<LocationAccess> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.granted ? 'always' : 'whenInUse';
}

/** 사용 중 허용 → 항상 허용 순서로 요청한다. */
export async function requestAlways(): Promise<LocationAccess> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? 'always' : 'whenInUse';
}

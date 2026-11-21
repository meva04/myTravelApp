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

/** 지도에 현재 위치(파란 점)를 보이려고 '앱 사용 중' 위치 권한을 한 번 묻는다. 이미 정했으면 다시 묻지 않는다. */
export async function askWhenInUse(): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.granted || !fg.canAskAgain) return fg.granted;
    return (await Location.requestForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** 지금 내 위치. 권한이 없거나 찾지 못하면 null. 최근에 받은 위치가 있으면 그걸 먼저 쓴다(빠르다). */
export async function whereAmI(): Promise<{ lat: number; lng: number } | null> {
  try {
    const pos = (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

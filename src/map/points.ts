import type { Id, LatLng, Leg, Stop } from '@/domain/types';

import { selectedOption } from './legRoutes';

export type Selection = { type: 'stop' | 'leg'; id: Id } | null;

/** 그날 지도에서 다 보여야 하는 점들: 방문지와 받아둔 경로. */
export function allPoints(stops: Stop[], legs: Leg[]): LatLng[] {
  const pts: LatLng[] = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  for (const l of legs) pts.push(...(selectedOption(l)?.polyline ?? []));
  return pts;
}

/** 선택한 방문지의 위치, 또는 선택한 구간 경로의 가운데. */
export function targetOf(sel: NonNullable<Selection>, stops: Stop[], legs: Leg[]): LatLng | null {
  if (sel.type === 'stop') {
    const s = stops.find((x) => x.id === sel.id);
    return s ? { lat: s.lat, lng: s.lng } : null;
  }
  const leg = legs.find((l) => l.id === sel.id);
  if (!leg) return null;
  const line = selectedOption(leg)?.polyline;
  if (line?.length) return line[Math.floor(line.length / 2)];
  const from = stops.find((s) => s.id === leg.fromStopId);
  return from ? { lat: from.lat, lng: from.lng } : null;
}

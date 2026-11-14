import type { Id, LatLng, RouteOption, TravelMode } from '@/domain/types';

import { callJson, GoogleApiError } from './errors';
import { decodePolyline } from './polyline';

const MODE: Record<TravelMode, string> = { walk: 'WALK', transit: 'TRANSIT', drive: 'DRIVE' };

type ApiRoutes = {
  routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
};

export function makeRoutes(fetchFn: typeof fetch, apiKey: string, newId: () => Id) {
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  return {
    async compute(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteOption> {
      const res = await callJson<ApiRoutes>(fetchFn, 'https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: MODE[mode] }),
      });
      const r = res.routes?.[0];
      if (!r?.polyline?.encodedPolyline) throw new GoogleApiError(404, 'no route');
      return {
        id: newId(),
        kind: 'default',
        polyline: decodePolyline(r.polyline.encodedPolyline),
        distanceMeters: r.distanceMeters ?? 0,
        durationSeconds: parseInt(r.duration ?? '0', 10) || 0,
      };
    },
  };
}

export type Routes = ReturnType<typeof makeRoutes>;

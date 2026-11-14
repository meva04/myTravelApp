import type { LatLng } from '@/domain/types';

import { callJson } from './errors';

export type PlaceHit = { placeId: string; name: string; address: string; lat: number; lng: number };
export type PlaceDetails = PlaceHit & {
  rating: number | null;
  ratingCount: number | null;
  openingHours: string[];
  website: string | null;
  photoUrls: string[];
};

type ApiPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: { name: string }[];
};

const BASE = 'https://places.googleapis.com/v1';
const CACHE_MS = 10 * 60 * 1000;

const toHit = (p: ApiPlace): PlaceHit => ({
  placeId: p.id,
  name: p.displayName?.text ?? '',
  address: p.formattedAddress ?? '',
  lat: p.location?.latitude ?? 0,
  lng: p.location?.longitude ?? 0,
});

export function makePlaces(fetchFn: typeof fetch, apiKey: string, now: () => number = Date.now) {
  // 별점·사진·영업시간은 기기에 저장하지 않고 메모리에만 잠깐 둔다 (구글 약관).
  const cache = new Map<string, { at: number; value: PlaceDetails }>();
  const headers = (mask: string) => ({
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': mask,
  });

  return {
    async search(query: string, near?: LatLng): Promise<PlaceHit[]> {
      const body: Record<string, unknown> = { textQuery: query, languageCode: 'ko' };
      if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } };
      const res = await callJson<{ places?: ApiPlace[] }>(fetchFn, `${BASE}/places:searchText`, {
        method: 'POST',
        headers: headers('places.id,places.displayName,places.formattedAddress,places.location'),
        body: JSON.stringify(body),
      });
      return (res.places ?? []).filter((p) => p.location).map(toHit);
    },

    async details(placeId: string): Promise<PlaceDetails> {
      const hit = cache.get(placeId);
      if (hit && now() - hit.at < CACHE_MS) return hit.value;
      const p = await callJson<ApiPlace>(fetchFn, `${BASE}/places/${encodeURIComponent(placeId)}?languageCode=ko`, {
        method: 'GET',
        headers: headers(
          'id,displayName,formattedAddress,location,rating,userRatingCount,regularOpeningHours.weekdayDescriptions,websiteUri,photos',
        ),
      });
      const value: PlaceDetails = {
        ...toHit(p),
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        openingHours: p.regularOpeningHours?.weekdayDescriptions ?? [],
        website: p.websiteUri ?? null,
        photoUrls: (p.photos ?? []).slice(0, 3).map((ph) => `${BASE}/${ph.name}/media?maxWidthPx=800&key=${apiKey}`),
      };
      cache.set(placeId, { at: now(), value });
      return value;
    },
  };
}

export type Places = ReturnType<typeof makePlaces>;

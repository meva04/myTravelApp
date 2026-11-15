import type { LatLng } from '@/domain/types';

import { callJson } from './errors';

export type PlaceHit = { placeId: string; name: string; address: string; lat: number; lng: number };
/**
 * 장소 화면 머리에 쓰는 정보: 주소와 사진뿐이다. 요금이 가장 싼 등급(Essentials)에 머물도록
 * 이름(Pro)·별점·영업시간·웹사이트(Enterprise)는 받지 않는다. 이름과 위치는 장소를 추가할 때 저장해 둔 것을 쓴다.
 */
export type PlaceDetails = {
  placeId: string;
  address: string;
  photoUrls: string[];
  /** 사진마다 구글 약관상 표시해야 하는 촬영자 이름 */
  photoAuthors: string[];
};

type ApiPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  photos?: { name: string; authorAttributions?: { displayName?: string }[] }[];
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
        headers: headers('id,formattedAddress,photos'),
      });
      const photos = (p.photos ?? []).slice(0, 3);
      const value: PlaceDetails = {
        placeId: p.id,
        address: p.formattedAddress ?? '',
        photoUrls: photos.map((ph) => `${BASE}/${ph.name}/media?maxWidthPx=1200&key=${apiKey}`),
        photoAuthors: photos.map((ph) => ph.authorAttributions?.map((a) => a.displayName).filter(Boolean).join(', ') ?? ''),
      };
      cache.set(placeId, { at: now(), value });
      return value;
    },
  };
}

export type Places = ReturnType<typeof makePlaces>;

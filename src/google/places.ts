import type { LatLng, PlaceKind } from '@/domain/types';

import { callJson } from './errors';

export type PlaceHit = { placeId: string; name: string; address: string; lat: number; lng: number; kind?: PlaceKind | null };
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
  /** 장소 종류 (아이콘) */
  kind?: PlaceKind | null;
};

/** 구글 장소 유형 → 아이콘 종류. 앞에 둔 것이 우선한다. */
const KIND_TYPES: [PlaceKind, string[]][] = [
  ['airport', ['airport', 'international_airport']],
  ['station', ['train_station', 'subway_station', 'transit_station', 'bus_station', 'light_rail_station']],
  ['port', ['ferry_terminal']],
  ['lodging', ['lodging', 'hotel', 'hostel', 'resort_hotel', 'motel', 'guest_house', 'bed_and_breakfast']],
  ['cafe', ['cafe', 'coffee_shop', 'bakery', 'tea_house', 'dessert_shop']],
  ['bar', ['bar', 'pub', 'wine_bar', 'night_club']],
  ['food', ['restaurant', 'food', 'meal_takeaway', 'fast_food_restaurant', 'ramen_restaurant', 'sushi_restaurant']],
  ['museum', ['museum', 'art_gallery']],
  ['park', ['park', 'national_park', 'garden', 'botanical_garden', 'zoo', 'beach']],
  ['shop', ['shopping_mall', 'store', 'department_store', 'market', 'clothing_store', 'supermarket', 'book_store']],
  ['sight', ['tourist_attraction', 'historical_landmark', 'church', 'place_of_worship', 'monument', 'amusement_park', 'aquarium', 'point_of_interest']],
];

export function kindFromTypes(types: string[] | undefined): PlaceKind | null {
  if (!types?.length) return null;
  for (const [kind, names] of KIND_TYPES) if (types.some((t) => names.includes(t) || (kind === 'food' && t.endsWith('_restaurant')))) return kind;
  return 'other';
}

type ApiPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
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
  kind: kindFromTypes(p.types),
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
        headers: headers('places.id,places.displayName,places.formattedAddress,places.location,places.types'),
        body: JSON.stringify(body),
      });
      return (res.places ?? []).filter((p) => p.location).map(toHit);
    },

    async details(placeId: string): Promise<PlaceDetails> {
      const hit = cache.get(placeId);
      if (hit && now() - hit.at < CACHE_MS) return hit.value;
      const p = await callJson<ApiPlace>(fetchFn, `${BASE}/places/${encodeURIComponent(placeId)}?languageCode=ko`, {
        method: 'GET',
        headers: headers('id,formattedAddress,photos,types'),
      });
      const photos = (p.photos ?? []).slice(0, 3);
      const value: PlaceDetails = {
        placeId: p.id,
        address: p.formattedAddress ?? '',
        photoUrls: photos.map((ph) => `${BASE}/${ph.name}/media?maxWidthPx=1200&key=${apiKey}`),
        photoAuthors: photos.map((ph) => ph.authorAttributions?.map((a) => a.displayName).filter(Boolean).join(', ') ?? ''),
        kind: kindFromTypes(p.types),
      };
      cache.set(placeId, { at: now(), value });
      return value;
    },
  };
}

export type Places = ReturnType<typeof makePlaces>;

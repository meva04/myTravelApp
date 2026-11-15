import type { LatLng, PlaceKind } from '@/domain/types';

import { callJson, OfflineError } from './errors';

export type PlaceHit = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind?: PlaceKind | null;
  /** 구글이 붙인 장소 종류 이름 (예: 음식점, 문화적 랜드마크) */
  category?: string;
};
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
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
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
  kind: kindFromTypes(p.primaryType ? [p.primaryType, ...(p.types ?? [])] : p.types),
  ...(p.primaryTypeDisplayName?.text ? { category: p.primaryTypeDisplayName.text } : {}),
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
    /** 이름으로 찾는다. near 근처를 먼저 (radius 미터, 기본 30km). (Text Search Pro: 이름·주소·위치·종류 모두 같은 등급) */
    async search(query: string, near?: LatLng, radius = 30000): Promise<PlaceHit[]> {
      const body: Record<string, unknown> = { textQuery: query, languageCode: 'ko' };
      if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius } };
      const res = await callJson<{ places?: ApiPlace[] }>(fetchFn, `${BASE}/places:searchText`, {
        method: 'POST',
        headers: headers('places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.primaryTypeDisplayName'),
        body: JSON.stringify(body),
      });
      return (res.places ?? []).filter((p) => p.location).map(toHit);
    },

    /**
     * 구글 지도에서 복사한 장소 링크(공유 링크 maps.app.goo.gl 포함)로 그 장소를 찾는다.
     * 링크를 열어 최종 주소에서 이름·좌표를 읽고, 그 자리에서 이름으로 한 번 검색해 장소를 맞춘다 (검색 1회 요금).
     */
    async fromMapsUrl(url: string): Promise<PlaceHit | null> {
      const full = await resolveRedirect(fetchFn, url.trim());
      const parsed = parseMapsUrl(full);
      if (!parsed) return null;
      const { name, lat, lng } = parsed;
      if (!name) return null;
      const near = lat !== null && lng !== null ? { lat, lng } : undefined;
      const hits = await this.search(name, near, near ? 500 : undefined);
      if (!hits.length) return null;
      if (!near) return hits[0];
      // 좌표에 가장 가까운 결과
      const d = (h: PlaceHit) => (h.lat - near.lat) ** 2 + (h.lng - near.lng) ** 2;
      return [...hits].sort((a, b) => d(a) - d(b))[0];
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

/** 구글 지도 링크인지 */
export function isMapsUrl(s: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(s.trim());
}

/** 짧은 공유 링크면 열어서 최종 주소를 받는다. */
async function resolveRedirect(fetchFn: typeof fetch, url: string): Promise<string> {
  if (!/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) return url;
  try {
    const res = await fetchFn(url, { method: 'GET' });
    if (res.url && res.url !== url) return res.url;
    // 자바스크립트로 넘기는 경우: 본문 안의 지도 주소를 찾는다
    const html = await res.text();
    const m = html.match(/https:\/\/www\.google\.[a-z.]+\/maps\/[^"'\s<>]+/);
    return m ? m[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&') : url;
  } catch {
    throw new OfflineError();
  }
}

/**
 * 지도 주소에서 장소 이름과 좌표를 읽는다.
 *  - /maps/place/<이름>/@lat,lng,17z/data=...!3d<lat>!4d<lng>
 *  - /maps/search/?api=1&query=<이름>  ·  ?q=<이름 또는 lat,lng>
 */
export function parseMapsUrl(url: string): { name: string; lat: number | null; lng: number | null } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const dec = (s: string) => decodeURIComponent(s.replace(/\+/g, ' ')).trim();
  const exact = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const c = exact ?? at;
  const lat = c ? Number(c[1]) : null;
  const lng = c ? Number(c[2]) : null;
  const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (place) return { name: dec(place[1]), lat, lng };
  const q = u.searchParams.get('query') ?? u.searchParams.get('q');
  if (q) {
    const coords = q.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    if (coords) return { name: '', lat: Number(coords[1]), lng: Number(coords[2]) };
    return { name: q.trim(), lat, lng };
  }
  return null;
}

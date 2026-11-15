import { GoogleApiError, OfflineError } from './errors';
import { isMapsUrl, kindFromTypes, makePlaces, parseMapsUrl } from './places';
import { decodePolyline } from './polyline';
import { makeRoutes } from './routes';

const json = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

test('decodePolyline decodes the reference example', () => {
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  expect(pts).toHaveLength(3);
  expect(pts[0].lat).toBeCloseTo(38.5, 5);
  expect(pts[0].lng).toBeCloseTo(-120.2, 5);
  expect(pts[1].lat).toBeCloseTo(40.7, 5);
  expect(pts[1].lng).toBeCloseTo(-120.95, 5);
  expect(pts[2].lat).toBeCloseTo(43.252, 5);
  expect(pts[2].lng).toBeCloseTo(-126.453, 5);
});

test('search maps places to hits and sends the query', async () => {
  const fetchFn = jest.fn(async () =>
    json({ places: [{ id: 'p1', displayName: { text: '센소지' }, formattedAddress: '도쿄', location: { latitude: 35.71, longitude: 139.79 } }] }),
  );
  const hits = await makePlaces(fetchFn as unknown as typeof fetch, 'KEY').search('센소지', { lat: 35.7, lng: 139.7 });
  expect(hits).toEqual([{ placeId: 'p1', name: '센소지', address: '도쿄', lat: 35.71, lng: 139.79, kind: null }]);
  const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
  expect(JSON.parse(init.body as string).textQuery).toBe('센소지');
  expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('KEY');
});

test('search with no results returns an empty list', async () => {
  const places = makePlaces((async () => json({})) as unknown as typeof fetch, 'KEY');
  expect(await places.search('zzzz')).toEqual([]);
});

test('details asks only for the address and photos (cheapest tier), and is cached', async () => {
  const fetchFn = jest.fn(async (_url: string, _init: RequestInit) =>
    json({
      id: 'p1', formattedAddress: '일본 도쿄도 다이토구 아사쿠사 2-3-1',
      photos: [{ name: 'places/p1/photos/abc', authorAttributions: [{ displayName: 'Kim' }] }],
    }),
  );
  const places = makePlaces(fetchFn as unknown as typeof fetch, 'KEY');
  const d = await places.details('p1');
  expect(d).toEqual({ placeId: 'p1', address: '일본 도쿄도 다이토구 아사쿠사 2-3-1', photoUrls: expect.any(Array), photoAuthors: ['Kim'], kind: null });
  expect(d.photoUrls).toEqual(['https://places.googleapis.com/v1/places/p1/photos/abc/media?maxWidthPx=1200&key=KEY']);
  const [url, init] = fetchFn.mock.calls[0];
  expect(url).toContain('languageCode=ko');
  // 이름(Pro)·별점·영업시간·웹사이트(Enterprise)처럼 비싼 항목은 요청하지 않는다
  expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id,formattedAddress,photos,types');
  await places.details('p1');
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

test('details tolerates missing optional fields', async () => {
  const places = makePlaces((async () => json({ id: 'p1' })) as unknown as typeof fetch, 'KEY');
  expect(await places.details('p1')).toMatchObject({ photoUrls: [], photoAuthors: [], address: '' });
});

test('compute returns a default route option with decoded path', async () => {
  const fetchFn = jest.fn(async () =>
    json({ routes: [{ distanceMeters: 772, duration: '165s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } }] }),
  );
  const r = await makeRoutes(fetchFn as unknown as typeof fetch, 'KEY', () => 'id1').compute({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, 'walk');
  expect(r).toMatchObject({ id: 'id1', kind: 'default', distanceMeters: 772, durationSeconds: 165 });
  expect(r.polyline).toHaveLength(2);
  const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
  expect(JSON.parse(init.body as string).travelMode).toBe('WALK');
});

test('compute with no route found is an api error', async () => {
  const routes = makeRoutes((async () => json({})) as unknown as typeof fetch, 'KEY', () => 'x');
  await expect(routes.compute({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, 'transit')).rejects.toBeInstanceOf(GoogleApiError);
});

test('network failure becomes OfflineError', async () => {
  const fetchFn = (async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
  await expect(makePlaces(fetchFn, 'KEY').search('x')).rejects.toBeInstanceOf(OfflineError);
  await expect(makeRoutes(fetchFn, 'KEY', () => 'x').compute({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, 'walk')).rejects.toBeInstanceOf(OfflineError);
});

test('non-200 becomes GoogleApiError with status', async () => {
  const fetchFn = (async () => json({ error: {} }, 403)) as unknown as typeof fetch;
  await expect(makePlaces(fetchFn, 'KEY').details('p')).rejects.toMatchObject({ status: 403 });
});

test('a request that never answers times out as OfflineError', async () => {
  jest.useFakeTimers();
  const fetchFn = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
  const p = makePlaces(fetchFn, 'KEY').search('x');
  jest.advanceTimersByTime(10000);
  await expect(p).rejects.toBeInstanceOf(OfflineError);
  jest.useRealTimers();
});

test('a non-JSON body is an api error, not a crash', async () => {
  const fetchFn = (async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } })) as unknown as typeof fetch;
  await expect(makePlaces(fetchFn, 'KEY').search('x')).rejects.toBeInstanceOf(GoogleApiError);
});

test('places without a location are left out of search results', async () => {
  const fetchFn = (async () => json({ places: [{ id: 'p1', displayName: { text: 'a' } }, { id: 'p2', displayName: { text: 'b' }, location: { latitude: 1, longitude: 2 } }] })) as unknown as typeof fetch;
  expect((await makePlaces(fetchFn, 'KEY').search('x')).map((h) => h.placeId)).toEqual(['p2']);
});

test('place types become icon kinds: restaurants, sights, hotels', () => {
  expect(kindFromTypes(['ramen_restaurant', 'restaurant', 'food'])).toBe('food');
  expect(kindFromTypes(['tourist_attraction', 'point_of_interest'])).toBe('sight');
  expect(kindFromTypes(['lodging', 'hotel'])).toBe('lodging');
  expect(kindFromTypes(['cafe', 'food'])).toBe('cafe');
  expect(kindFromTypes([])).toBeNull();
});

test('search shows Google\'s category name and asks only for same-tier fields', async () => {
  const fetchFn = jest.fn(async () =>
    json({ places: [{ id: 'p1', displayName: { text: '이치란' }, location: { latitude: 1, longitude: 2 }, primaryType: 'ramen_restaurant', primaryTypeDisplayName: { text: '라멘 전문점' } }] }),
  );
  const [hit] = await makePlaces(fetchFn as unknown as typeof fetch, 'KEY').search('이치란');
  expect(hit).toMatchObject({ kind: 'food', category: '라멘 전문점' });
  const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
  expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
    'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.primaryTypeDisplayName',
  );
});

test('Google Maps links give the place name and its exact coordinates', () => {
  expect(isMapsUrl('https://maps.app.goo.gl/xYz')).toBe(true);
  expect(isMapsUrl('https://www.google.co.kr/maps/place/x')).toBe(true);
  expect(isMapsUrl('센소지')).toBe(false);
  expect(parseMapsUrl('https://www.google.com/maps/place/Trattoria+da+Enzo+al+29/@41.8881,12.4735,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d41.8882!4d12.4741')).toEqual({
    name: 'Trattoria da Enzo al 29', lat: 41.8882, lng: 12.4741,
  });
  expect(parseMapsUrl('https://www.google.com/maps/search/?api=1&query=%EC%84%BC%EC%86%8C%EC%A7%80')).toEqual({ name: '센소지', lat: null, lng: null });
});

test('a short share link is followed, then the place is matched by name right at that spot', async () => {
  const fetchFn = jest.fn(async (url: string) => {
    if (url.startsWith('https://maps.app.goo.gl')) {
      return { ok: true, status: 200, url: 'https://www.google.com/maps/place/Da+Enzo/@41.88,12.47,17z/data=!3d41.8882!4d12.4741', text: async (): Promise<string> => '' };
    }
    return json({
      places: [
        { id: 'far', displayName: { text: 'Da Enzo' }, location: { latitude: 41.9, longitude: 12.5 } },
        { id: 'near', displayName: { text: 'Da Enzo' }, location: { latitude: 41.8882, longitude: 12.4741 } },
      ],
    });
  });
  const hit = await makePlaces(fetchFn as unknown as typeof fetch, 'KEY').fromMapsUrl('https://maps.app.goo.gl/abc');
  expect(hit?.placeId).toBe('near');
  const body = JSON.parse((fetchFn.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
  expect(body).toMatchObject({ textQuery: 'Da Enzo', locationBias: { circle: { radius: 500 } } });
});

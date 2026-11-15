import { GoogleApiError, OfflineError } from './errors';
import { makePlaces } from './places';
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
  expect(hits).toEqual([{ placeId: 'p1', name: '센소지', address: '도쿄', lat: 35.71, lng: 139.79 }]);
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
  expect(d).toEqual({ placeId: 'p1', address: '일본 도쿄도 다이토구 아사쿠사 2-3-1', photoUrls: expect.any(Array), photoAuthors: ['Kim'] });
  expect(d.photoUrls).toEqual(['https://places.googleapis.com/v1/places/p1/photos/abc/media?maxWidthPx=1200&key=KEY']);
  const [url, init] = fetchFn.mock.calls[0];
  expect(url).toContain('languageCode=ko');
  // 이름(Pro)·별점·영업시간·웹사이트(Enterprise)처럼 비싼 항목은 요청하지 않는다
  expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id,formattedAddress,photos');
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

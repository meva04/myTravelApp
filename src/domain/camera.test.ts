import { allVisible, bearingTo, fitRegion, isOffscreen, nearestStopAt, nextRegion, type Region } from './camera';

const zoomedIn: Region = { lat: 35.0, lng: 139.0, latDelta: 0.01, lngDelta: 0.01 };
const pts = [{ lat: 35.0, lng: 139.0 }, { lat: 35.1, lng: 139.2 }];

test('opening a day for the first time fits the whole route', () => {
  expect(nextRegion(null, { type: 'dayOpened', points: pts })).toEqual(fitRegion(pts));
});

test('opening again once the user has a view does not move the map', () => {
  expect(nextRegion(zoomedIn, { type: 'dayOpened', points: pts })).toBeNull();
});

test('opening a day with no stops does not move the map', () => {
  expect(nextRegion(null, { type: 'dayOpened', points: [] })).toBeNull();
  expect(nextRegion(zoomedIn, { type: 'fitAll', points: [] })).toBeNull();
});

test('selecting a leg or stop never moves the map', () => {
  expect(nextRegion(zoomedIn, { type: 'selected' })).toBeNull();
  expect(nextRegion(null, { type: 'selected' })).toBeNull();
});

test('user gestures never trigger a programmatic move', () => {
  expect(nextRegion(zoomedIn, { type: 'userMoved', region: { ...zoomedIn, lat: 36 } })).toBeNull();
});

test('fitAll fits every point even when zoomed in', () => {
  expect(nextRegion(zoomedIn, { type: 'fitAll', points: pts })).toEqual(fitRegion(pts));
});

test('goToMe and goToTarget recentre but keep the current zoom', () => {
  expect(nextRegion(zoomedIn, { type: 'goToMe', me: { lat: 1, lng: 2 } })).toEqual({ lat: 1, lng: 2, latDelta: 0.01, lngDelta: 0.01 });
  expect(nextRegion(zoomedIn, { type: 'goToTarget', target: { lat: 3, lng: 4 } })).toEqual({ lat: 3, lng: 4, latDelta: 0.01, lngDelta: 0.01 });
});

test('goToMe with no current view uses a street-level zoom', () => {
  expect(nextRegion(null, { type: 'goToMe', me: { lat: 1, lng: 2 } })).toEqual({ lat: 1, lng: 2, latDelta: 0.01, lngDelta: 0.01 });
});

test('fitRegion centres on the points with 20% margin', () => {
  const r = fitRegion(pts);
  expect(r.lat).toBeCloseTo(35.05, 6);
  expect(r.lng).toBeCloseTo(139.1, 6);
  expect(r.latDelta).toBeCloseTo(0.12, 6);
  expect(r.lngDelta).toBeCloseTo(0.24, 6);
});

test('fitRegion of a single point uses delta 0.01', () => {
  expect(fitRegion([pts[0]])).toEqual({ lat: 35.0, lng: 139.0, latDelta: 0.01, lngDelta: 0.01 });
});

test('isOffscreen tells whether a point is outside the visible region', () => {
  expect(isOffscreen({ lat: 35.004, lng: 139.0 }, zoomedIn)).toBe(false);
  expect(isOffscreen({ lat: 35.006, lng: 139.0 }, zoomedIn)).toBe(true);
  expect(isOffscreen({ lat: 35.0, lng: 138.99 }, zoomedIn)).toBe(true);
});

test('bearingTo points from the screen centre to the target', () => {
  expect(bearingTo(zoomedIn, { lat: 36, lng: 139 })).toBeCloseTo(0, 0);
  expect(bearingTo(zoomedIn, { lat: 35, lng: 140 })).toBeCloseTo(90, 0);
  expect(bearingTo(zoomedIn, { lat: 34, lng: 139 })).toBeCloseTo(180, 0);
  expect(bearingTo(zoomedIn, { lat: 35, lng: 138 })).toBeCloseTo(270, 0);
});

test('nearestStopAt picks the stop under the finger and ignores far taps', () => {
  const stops = [{ id: 'a', lat: 35.0, lng: 139.0 }, { id: 'b', lat: 35.003, lng: 139.003 }];
  expect(nearestStopAt({ lat: 35.0002, lng: 139.0001 }, stops, zoomedIn)).toBe('a');
  expect(nearestStopAt({ lat: 35.0029, lng: 139.0031 }, stops, zoomedIn)).toBe('b');
  expect(nearestStopAt({ lat: 35.0015, lng: 139.0015 }, stops, zoomedIn)).toBeNull();
  expect(nearestStopAt({ lat: 35, lng: 139 }, [], zoomedIn)).toBeNull();
});

test('the fit-all button hides when every place is on screen above the sheet, and comes back when zoomed in', () => {
  const fit = fitRegion(pts);
  expect(allVisible(pts, fit)).toBe(true);
  expect(allVisible(pts, zoomedIn)).toBe(false);
  // 아래 절반이 시트에 가리면, 화면 아래쪽에 있는 점은 안 보이는 것으로 친다
  const low = [{ lat: fit.lat - fit.latDelta * 0.3, lng: fit.lng }];
  expect(allVisible(low, fit, 0)).toBe(true);
  expect(allVisible(low, fit, 0.5)).toBe(false);
  expect(allVisible([], zoomedIn)).toBe(true);
});

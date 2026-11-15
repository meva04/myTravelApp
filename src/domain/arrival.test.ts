import type { Stop } from './types';
import { distanceMeters, markArrived, pickRegions } from './arrival';

const stop = (i: number, p: Partial<Stop> = {}): Stop => ({
  id: `s${i}`, dayId: 'd', order: i, placeId: null, name: `s${i}`, lat: 35 + i * 0.01, lng: 139,
  plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '', ...p,
});

test('distance between Seoul City Hall and Gwanghwamun is about 1.07km', () => {
  const d = distanceMeters({ lat: 37.5663, lng: 126.9779 }, { lat: 37.5759, lng: 126.9769 });
  expect(d).toBeGreaterThan(1000);
  expect(d).toBeLessThan(1150);
});

test('pickRegions watches at most 20 unvisited stops, nearest first, radius 150', () => {
  const stops = Array.from({ length: 25 }, (_, i) => stop(i, i < 5 ? { arrivedAt: '2027-03-01T00:00:00Z', arrivalMethod: 'auto' } : {}));
  const regions = pickRegions(stops, { lat: 35 + 24 * 0.01, lng: 139 });
  expect(regions).toHaveLength(20);
  expect(regions[0].identifier).toBe('s24');
  expect(regions.map((r) => r.identifier)).not.toContain('s4');
  expect(regions.every((r) => r.radius === 150)).toBe(true);
  expect(regions[0]).toMatchObject({ latitude: 35.24, longitude: 139 });
});

test('pickRegions without a current position keeps itinerary order', () => {
  const stops = [stop(2), stop(0), stop(1)];
  expect(pickRegions(stops, null).map((r) => r.identifier)).toEqual(['s0', 's1', 's2']);
});

test('pickRegions with no stops is empty', () => {
  expect(pickRegions([], null)).toEqual([]);
});

test('markArrived records the first arrival and ignores later ones', () => {
  const first = markArrived(stop(0), '2027-03-01T01:00:00.000Z', 'auto');
  expect(first).toMatchObject({ arrivedAt: '2027-03-01T01:00:00.000Z', arrivalMethod: 'auto' });
  const again = markArrived(first, '2027-03-01T05:00:00.000Z', 'manual');
  expect(again).toBe(first);
});

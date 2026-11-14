import { randomUUID } from 'crypto';

import type { Leg, Stop } from '@/domain/types';

import { makeRepo } from './repo';
import { makeTestDb } from './testDb';

async function setup() {
  const repo = makeRepo(makeTestDb(), randomUUID);
  await repo.migrate();
  const trip = await repo.createTrip({
    name: '도쿄', city: 'Tokyo', startDate: '2027-03-01', endDate: '2027-03-03', baseCurrency: 'KRW',
  });
  const days = await repo.listDays(trip.id);
  return { repo, trip, days };
}

const stop = (dayId: string, order: number, name: string): Stop => ({
  id: randomUUID(), dayId, order, placeId: null, name, lat: 35.6, lng: 139.7,
  plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '',
});

test('createTrip creates one day per date in range, in order', async () => {
  const { trip, days } = await setup();
  expect(trip.rates).toEqual({});
  expect(days.map((d) => d.date)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03']);
});

test('trips round-trip through list, get and update', async () => {
  const { repo, trip } = await setup();
  await repo.updateTrip({ ...trip, rates: { JPY: 9 } });
  expect((await repo.getTrip(trip.id))?.rates).toEqual({ JPY: 9 });
  expect((await repo.listTrips()).map((t) => t.name)).toEqual(['도쿄']);
  expect(await repo.getTrip('nope')).toBeNull();
});

test('saveStops replaces the day and listStops returns them by order', async () => {
  const { repo, days } = await setup();
  const a = stop(days[0].id, 1, 'A');
  const b = stop(days[0].id, 0, 'B');
  await repo.saveStops(days[0].id, [a, b]);
  expect(await repo.listStops(days[0].id)).toEqual([b, a]);
  await repo.saveStops(days[0].id, [a]);
  expect(await repo.listStops(days[0].id)).toEqual([a]);
});

test('legs keep their route options', async () => {
  const { repo, days } = await setup();
  const a = stop(days[0].id, 0, 'A');
  const b = stop(days[0].id, 1, 'B');
  await repo.saveStops(days[0].id, [a, b]);
  const leg: Leg = {
    id: randomUUID(), fromStopId: a.id, toStopId: b.id, mode: 'walk', selectedOptionId: 'o1',
    options: [{ id: 'o1', kind: 'default', polyline: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], distanceMeters: 500, durationSeconds: 400 }],
  };
  await repo.saveLegs(days[0].id, [leg]);
  expect(await repo.listLegs(days[0].id)).toEqual([leg]);
});

test('photos and expenses are stored and listed', async () => {
  const { repo, trip, days } = await setup();
  const a = stop(days[0].id, 0, 'A');
  await repo.saveStops(days[0].id, [a]);
  const p = await repo.addPhoto({ stopId: a.id, uri: 'file://x.jpg', takenAt: '2027-03-01T02:00:00.000Z', lat: null, lng: null });
  expect(await repo.listPhotos(a.id)).toEqual([p]);
  const e = await repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: a.id, amount: 1000, currency: 'JPY', category: 'food', memo: '라멘' });
  await repo.updateExpense({ ...e, amount: 1200 });
  expect(await repo.listExpenses(trip.id)).toEqual([{ ...e, amount: 1200 }]);
  await repo.deleteExpense(e.id);
  await repo.deletePhoto(p.id);
  expect(await repo.listExpenses(trip.id)).toEqual([]);
  expect(await repo.listPhotos(a.id)).toEqual([]);
});

test('deleteTrip removes its days, stops, legs and expenses', async () => {
  const { repo, trip, days } = await setup();
  const a = stop(days[0].id, 0, 'A');
  await repo.saveStops(days[0].id, [a]);
  await repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: null, amount: 1, currency: 'KRW', category: 'etc', memo: '' });
  await repo.deleteTrip(trip.id);
  expect(await repo.listDays(trip.id)).toEqual([]);
  expect(await repo.listStops(days[0].id)).toEqual([]);
  expect(await repo.listExpenses(trip.id)).toEqual([]);
});

test('saveStops with a stale copy does not erase an arrival or memo recorded since', async () => {
  const { repo, days } = await setup();
  const a = stop(days[0].id, 0, 'A');
  const b = stop(days[0].id, 1, 'B');
  await repo.saveStops(days[0].id, [a, b]);
  await repo.markStopArrived(a.id, '2027-03-01T01:00:00.000Z', 'auto');
  await repo.setStopMemo(a.id, '메모');
  await repo.saveStops(days[0].id, [{ ...b, order: 0 }, { ...a, order: 1 }]); // 화면이 들고 있던 옛 사본
  const saved = await repo.getStop(a.id);
  expect(saved).toMatchObject({ order: 1, arrivedAt: '2027-03-01T01:00:00.000Z', arrivalMethod: 'auto', memo: '메모' });
});

test('markStopArrived only records the first arrival', async () => {
  const { repo, days } = await setup();
  const a = stop(days[0].id, 0, 'A');
  await repo.saveStops(days[0].id, [a]);
  expect(await repo.markStopArrived(a.id, '2027-03-01T01:00:00.000Z', 'auto')).toBe(true);
  expect(await repo.markStopArrived(a.id, '2027-03-01T09:00:00.000Z', 'manual')).toBe(false);
  expect(await repo.getStop(a.id)).toMatchObject({ arrivedAt: '2027-03-01T01:00:00.000Z', arrivalMethod: 'auto' });
  expect(await repo.markStopArrived('nope', '2027-03-01T01:00:00.000Z', 'auto')).toBe(false);
});

test('narrow setters change only their own field', async () => {
  const { repo, days } = await setup();
  const a = stop(days[0].id, 0, 'A');
  await repo.saveStops(days[0].id, [a]);
  await repo.markStopArrived(a.id, '2027-03-01T01:00:00.000Z', 'auto');
  await repo.setStopPlannedTime(a.id, '09:30');
  await repo.setStopArrivalTime(a.id, '2027-03-01T02:00:00.000Z');
  expect(await repo.getStop(a.id)).toMatchObject({ plannedTime: '09:30', arrivedAt: '2027-03-01T02:00:00.000Z', arrivalMethod: 'manual', memo: '' });
});

test('setExpenseDateForStop moves a stop’s expenses to another date', async () => {
  const { repo, trip, days } = await setup();
  const a = stop(days[0].id, 0, 'A');
  await repo.saveStops(days[0].id, [a]);
  await repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: a.id, amount: 1, currency: 'KRW', category: 'etc', memo: '' });
  await repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: null, amount: 2, currency: 'KRW', category: 'etc', memo: '' });
  await repo.setExpenseDateForStop(a.id, '2027-03-02');
  expect((await repo.listExpenses(trip.id)).map((e) => [e.amount, e.date])).toEqual([[2, '2027-03-01'], [1, '2027-03-02']]);
});

test('concurrent saveLegs calls do not interleave and lose legs', async () => {
  const { repo, days } = await setup();
  const mk = (id: string): Leg => ({ id, fromStopId: 'x', toStopId: 'y', mode: 'walk', options: [], selectedOptionId: null });
  await Promise.all([repo.saveLegs(days[0].id, [mk('a1'), mk('a2')]), repo.saveLegs(days[0].id, [mk('b1'), mk('b2')])]);
  expect((await repo.listLegs(days[0].id)).map((l) => l.id)).toEqual(['b1', 'b2']);
});

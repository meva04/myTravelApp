import { GoogleApiError, OfflineError } from '@/google/errors';
import type { Leg, RouteOption, Stop } from '@/domain/types';
import { makeTestServices } from '@/testing/services';

import { changeLegMode, loadLegRoutes, readLegRoutes } from './legRoutes';

const opt = (id: string): RouteOption => ({ id, kind: 'default', polyline: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], distanceMeters: 100, durationSeconds: 60 });
const stop = (id: string, dayId: string, order: number): Stop => ({
  id, dayId, order, placeId: null, name: id, lat: order, lng: order, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '',
});

async function setup() {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  await sv.repo.saveStops(day.id, [stop('A', day.id, 0), stop('B', day.id, 1), stop('C', day.id, 2)]);
  const ready: Leg = { id: 'l1', fromStopId: 'A', toStopId: 'B', mode: 'walk', options: [opt('o1')], selectedOptionId: 'o1' };
  const empty: Leg = { id: 'l2', fromStopId: 'B', toStopId: 'C', mode: 'walk', options: [], selectedOptionId: null };
  await sv.repo.saveLegs(day.id, [ready, empty]);
  return { sv, dayId: day.id };
}

test('only legs without a stored route are fetched, then saved', async () => {
  const { sv, dayId } = await setup();
  const compute = jest.fn(async () => opt('new'));
  sv.routes.compute = compute;
  const r = await loadLegRoutes(sv, dayId);
  expect(compute).toHaveBeenCalledTimes(1);
  expect(compute).toHaveBeenCalledWith({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, 'walk');
  expect(r.status).toEqual({ l1: 'ready', l2: 'ready' });
  const saved = await sv.repo.listLegs(dayId);
  expect(saved[1]).toMatchObject({ selectedOptionId: 'new', options: [opt('new')] });
});

test('when everything is stored nothing is fetched', async () => {
  const { sv, dayId } = await setup();
  sv.routes.compute = async () => opt('new');
  await loadLegRoutes(sv, dayId);
  const compute = jest.fn(async () => opt('again'));
  sv.routes.compute = compute;
  await loadLegRoutes(sv, dayId);
  expect(compute).not.toHaveBeenCalled();
});

test('offline keeps stored routes ready and marks the missing leg offline', async () => {
  const { sv, dayId } = await setup();
  sv.routes.compute = async () => { throw new OfflineError(); };
  const r = await loadLegRoutes(sv, dayId);
  expect(r.status).toEqual({ l1: 'ready', l2: 'offline' });
  expect(r.legs[0].options).toEqual([opt('o1')]);
  expect(r.legs[1].options).toEqual([]);
});

test('an api failure marks the leg as error without throwing', async () => {
  const { sv, dayId } = await setup();
  sv.routes.compute = async () => { throw new GoogleApiError(404); };
  expect((await loadLegRoutes(sv, dayId)).status.l2).toBe('error');
});

test('changing the travel mode drops the old route and fetches a new one', async () => {
  const { sv, dayId } = await setup();
  const compute = jest.fn(async () => opt('t1'));
  sv.routes.compute = compute;
  const r = await changeLegMode(sv, dayId, 'l1', 'transit');
  expect(compute).toHaveBeenCalledWith({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'transit');
  expect(r.legs[0]).toMatchObject({ mode: 'transit', selectedOptionId: 't1' });
});

test('readLegRoutes returns stored stops and legs without any network call', async () => {
  const { sv, dayId } = await setup();
  const compute = jest.fn(async () => opt('new'));
  sv.routes.compute = compute;
  const r = await readLegRoutes(sv, dayId);
  expect(r.stops.map((x) => x.id)).toEqual(['A', 'B', 'C']);
  expect(r.status).toEqual({ l1: 'ready', l2: 'loading' });
  expect(compute).not.toHaveBeenCalled();
});

test('an unexpected failure marks the leg as error instead of breaking the screen', async () => {
  const { sv, dayId } = await setup();
  sv.routes.compute = async () => { throw new SyntaxError('Unexpected token <'); };
  expect((await loadLegRoutes(sv, dayId)).status.l2).toBe('error');
});

test('changing mode while offline keeps the route that was already saved', async () => {
  const { sv, dayId } = await setup();
  sv.routes.compute = async () => { throw new OfflineError(); };
  const r = await changeLegMode(sv, dayId, 'l1', 'transit');
  expect(r.status.l1).toBe('offline');
  expect(r.legs[0]).toMatchObject({ mode: 'walk', options: [opt('o1')], selectedOptionId: 'o1' });
  expect((await sv.repo.listLegs(dayId))[0].options).toEqual([opt('o1')]);
});

test('two loads at the same time fetch each missing leg only once', async () => {
  const { sv, dayId } = await setup();
  const compute = jest.fn(async () => opt('new'));
  sv.routes.compute = compute;
  await Promise.all([loadLegRoutes(sv, dayId), loadLegRoutes(sv, dayId)]);
  expect(compute).toHaveBeenCalledTimes(1);
});

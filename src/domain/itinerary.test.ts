import type { Leg, Stop } from './types';
import { moveToDay, removeStop, reorder, syncLegs } from './itinerary';

const stop = (id: string, order: number, dayId = 'd1'): Stop => ({
  id, dayId, order, placeId: null, name: id, lat: 0, lng: 0, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '',
});
let n = 0;
const newId = () => `new${++n}`;

test('reorder moves a stop and renumbers order from 0', () => {
  const out = reorder([stop('A', 0), stop('B', 1), stop('C', 2)], 2, 0);
  expect(out.map((s) => s.id)).toEqual(['C', 'A', 'B']);
  expect(out.map((s) => s.order)).toEqual([0, 1, 2]);
});

test('syncLegs keeps legs whose pair still exists and creates the rest', () => {
  const kept: Leg = {
    id: 'l1', fromStopId: 'A', toStopId: 'B', mode: 'transit', selectedOptionId: 'o',
    options: [{ id: 'o', kind: 'default', polyline: [], distanceMeters: 1, durationSeconds: 1 }],
  };
  const gone: Leg = { id: 'l2', fromStopId: 'B', toStopId: 'C', mode: 'walk', options: [], selectedOptionId: null };
  const legs = syncLegs([stop('C', 0), stop('A', 1), stop('B', 2)], [kept, gone], newId);
  expect(legs.map((l) => [l.fromStopId, l.toStopId])).toEqual([['C', 'A'], ['A', 'B']]);
  expect(legs[1]).toBe(kept);
  expect(legs[0]).toMatchObject({ mode: 'walk', options: [], selectedOptionId: null });
});

test('a day with no stops or one stop has no legs', () => {
  expect(syncLegs([], [], newId)).toEqual([]);
  expect(syncLegs([stop('A', 0)], [], newId)).toEqual([]);
});

test('moveToDay appends to the other day and keeps both orders contiguous', () => {
  const from = [stop('A', 0), stop('B', 1), stop('C', 2)];
  const to = [stop('X', 0, 'd2')];
  const r = moveToDay(from[1], from, to, 'd2');
  expect(r.from.map((s) => [s.id, s.order])).toEqual([['A', 0], ['C', 1]]);
  expect(r.to.map((s) => [s.id, s.order, s.dayId])).toEqual([['X', 0, 'd2'], ['B', 1, 'd2']]);
});

test('removeStop removes the stop and renumbers, including the last one', () => {
  expect(removeStop([stop('A', 0), stop('B', 1), stop('C', 2)], 'B').map((s) => [s.id, s.order])).toEqual([['A', 0], ['C', 1]]);
  expect(removeStop([stop('A', 0)], 'A')).toEqual([]);
});

test('reorder with an out-of-range index returns the list unchanged', () => {
  expect(reorder([], 0, 0)).toEqual([]);
  const list = [stop('A', 0)];
  expect(reorder(list, 3, 0)).toEqual(list);
});

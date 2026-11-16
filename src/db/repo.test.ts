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
  plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '', kind: null, bookingId: null,
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

test('saveStops replaces the day and listStops returns them in the given order', async () => {
  const { repo, days } = await setup();
  const a = stop(days[0].id, 1, 'A');
  const b = stop(days[0].id, 0, 'B');
  await repo.saveStops(days[0].id, [b, a]);
  expect(await repo.listStops(days[0].id)).toEqual([b, a]);
  await repo.saveStops(days[0].id, [a]);
  expect(await repo.listStops(days[0].id)).toEqual([{ ...a, order: 0 }]);
});

test('travel notes share the day order with places: they stay put when places move, and can be dragged between them', async () => {
  const { repo, days } = await setup();
  const d = days[0].id;
  const [a, b, c] = [stop(d, 0, 'A'), stop(d, 1, 'B'), stop(d, 2, 'C')];
  await repo.saveStops(d, [a, b, c]);
  const n = await repo.addNote(d, a.id, '표 사기');
  expect(await repo.listSequence(d)).toEqual([{ kind: 'stop', id: a.id }, { kind: 'note', id: n.id }, { kind: 'stop', id: b.id }, { kind: 'stop', id: c.id }]);
  // 장소 순서를 바꿔도 메모 자리(두 번째 칸)는 그대로
  await repo.saveStops(d, [c, a, b]);
  expect((await repo.listSequence(d)).map((x) => x.id)).toEqual([c.id, n.id, a.id, b.id]);
  // 메모를 끌어 다른 자리로
  await repo.saveSequence(d, [{ kind: 'stop', id: c.id }, { kind: 'stop', id: a.id }, { kind: 'stop', id: b.id }, { kind: 'note', id: n.id }]);
  expect((await repo.listSequence(d)).map((x) => x.id)).toEqual([c.id, a.id, b.id, n.id]);
});

test('an older database whose notes belonged to a place is moved to day order', async () => {
  const db = makeTestDb();
  await db.run(`CREATE TABLE trip (id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL, baseCurrency TEXT NOT NULL, rates TEXT NOT NULL DEFAULT '{}')`);
  await db.run(`CREATE TABLE day (id TEXT PRIMARY KEY, tripId TEXT NOT NULL, date TEXT NOT NULL)`);
  await db.run(`CREATE TABLE stop (id TEXT PRIMARY KEY, dayId TEXT NOT NULL, "order" INTEGER NOT NULL, placeId TEXT, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, plannedTime TEXT, arrivedAt TEXT, arrivalMethod TEXT, memo TEXT NOT NULL DEFAULT '')`);
  await db.run(`CREATE TABLE photo (id TEXT PRIMARY KEY, stopId TEXT NOT NULL REFERENCES stop(id) ON DELETE CASCADE, uri TEXT NOT NULL, takenAt TEXT NOT NULL, lat REAL, lng REAL, assetId TEXT, cover INTEGER NOT NULL DEFAULT 0, noteId TEXT)`);
  await db.run(`CREATE TABLE note (id TEXT PRIMARY KEY, stopId TEXT NOT NULL REFERENCES stop(id) ON DELETE CASCADE, "order" INTEGER NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, memo TEXT NOT NULL DEFAULT '')`);
  await db.run(`INSERT INTO trip VALUES ('t','t','c','2027-03-01','2027-03-01','KRW','{}')`);
  await db.run(`INSERT INTO day VALUES ('d','t','2027-03-01')`);
  await db.run(`INSERT INTO stop (id, dayId, "order", name, lat, lng) VALUES ('a','d',0,'A',1,1), ('b','d',1,'B',1,1)`);
  await db.run(`INSERT INTO note VALUES ('n1','a',0,'표',1,'기록')`);
  await db.run(`INSERT INTO photo (id, stopId, uri, takenAt, noteId) VALUES ('p1','a','x.jpg','2027','n1'), ('p2','b','y.jpg','2027',NULL)`);
  const repo = makeRepo(db, randomUUID);
  await repo.migrate();
  expect(await repo.listSequence('d')).toEqual([{ kind: 'stop', id: 'a' }, { kind: 'note', id: 'n1' }, { kind: 'stop', id: 'b' }]);
  expect(await repo.getNote('n1')).toMatchObject({ dayId: 'd', text: '표', done: true, memo: '기록' });
  expect((await repo.listNotePhotos('n1')).map((p) => [p.uri, p.stopId])).toEqual([['x.jpg', null]]);
  await repo.saveStops('d', []); // 장소가 없어져도 메모와 그 사진은 남는다
  expect(await repo.listNotePhotos('n1')).toHaveLength(1);
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

test('a database from an older version gains the plan note and photo source columns', async () => {
  const db = makeTestDb();
  await db.run(`CREATE TABLE stop (
    id TEXT PRIMARY KEY, dayId TEXT NOT NULL, "order" INTEGER NOT NULL, placeId TEXT, name TEXT NOT NULL,
    lat REAL NOT NULL, lng REAL NOT NULL, plannedTime TEXT, arrivedAt TEXT, arrivalMethod TEXT, memo TEXT NOT NULL DEFAULT '')`);
  await db.run(`CREATE TABLE photo (id TEXT PRIMARY KEY, stopId TEXT NOT NULL, uri TEXT NOT NULL, takenAt TEXT NOT NULL, lat REAL, lng REAL)`);
  await db.run(`INSERT INTO stop (id, dayId, "order", name, lat, lng, memo) VALUES ('old', 'd', 0, '옛 장소', 1, 1, '좋았다')`);
  const repo = makeRepo(db, randomUUID);
  await repo.migrate();
  await repo.migrate(); // 두 번 해도 괜찮아야 한다
  expect(await repo.getStop('old')).toMatchObject({ memo: '좋았다', planNote: '', skipped: false, legNote: '' });
  await repo.setStopLegNote('old', '가는 길에 우산 사기');
  expect((await repo.getStop('old'))?.legNote).toBe('가는 길에 우산 사기');
  await repo.setStopPlanNote('old', '예약 확인');
  expect((await repo.getStop('old'))?.planNote).toBe('예약 확인');
  const p = await repo.addPhoto({ stopId: 'old', uri: 'a.jpg', takenAt: '2027-03-01T00:00:00.000Z', lat: null, lng: null, assetId: 'A1' });
  expect(await repo.listPhotos('old')).toEqual([p]);
});

test('travel notes keep their own record, photos and expenses, and old checklist notes are moved over', async () => {
  const db = makeTestDb();
  const repo = makeRepo(db, randomUUID);
  await repo.migrate();
  const trip = await repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-02', baseCurrency: 'KRW' });
  const [d1, d2] = await repo.listDays(trip.id);
  const a = stop(d1.id, 0, 'A');
  await repo.saveStops(d1.id, [{ ...a, legNote: '[x] 교통카드 구입\n[ ] 현금 2,000엔' }]);
  await repo.migrate(); // 예전 legNote 가 이동 메모로 옮겨진다
  const notes = await repo.listNotesForDay(d1.id);
  expect(notes.map((n) => [n.text, n.done, n.order])).toEqual([['교통카드 구입', true, 1], ['현금 2,000엔', false, 2]]);
  expect((await repo.getStop(a.id))?.legNote).toBe('');
  await repo.migrate(); // 두 번 옮기지 않는다
  expect(await repo.listNotesForDay(d1.id)).toHaveLength(2);

  const n = await repo.addNote(d1.id, a.id, '우산 사기');
  expect(n.order).toBe(3); // 장소 A(0) 뒤, 옮겨 온 메모 둘(1,2) 다음
  await repo.updateNote(n.id, { done: true, memo: '비가 많이 왔다' });
  expect(await repo.getNote(n.id)).toMatchObject({ text: '우산 사기', done: true, memo: '비가 많이 왔다' });
  await repo.addPhoto({ stopId: null, noteId: n.id, uri: 'n.jpg', takenAt: '2027-03-01T00:00:00.000Z', lat: null, lng: null });
  expect((await repo.listNotePhotos(n.id)).map((p) => p.uri)).toEqual(['n.jpg']);
  expect(await repo.listPhotos(a.id)).toEqual([]); // 장소 사진에는 섞이지 않는다
  const e = await repo.addExpense({ tripId: trip.id, date: d1.date, stopId: null, noteId: n.id, amount: 5, currency: 'GBP', category: 'shopping', memo: '' });
  await repo.setExpenseDateForStop(a.id, d2.date); // 메모는 장소와 따로라 장소를 옮겨도 메모 비용은 그대로
  expect((await repo.listExpenses(trip.id)).find((x) => x.id === e.id)?.date).toBe(d1.date);
  // 장소를 지워도 이동 메모는 남는다
  await repo.saveStops(d1.id, []);
  expect(await repo.getNote(n.id)).not.toBeNull();

  expect(await repo.deleteNote(n.id)).toEqual(['n.jpg']);
  expect(await repo.getNote(n.id)).toBeNull();
  expect((await repo.listExpenses(trip.id)).find((x) => x.id === e.id)?.noteId).toBeNull(); // 비용은 남는다
});

test('changing trip dates moves each day (and its places and expenses) to the new dates in order', async () => {
  const { repo, trip, days } = await setup();
  await repo.saveStops(days[0].id, [stop(days[0].id, 0, '센소지')]);
  await repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: null, amount: 1000, currency: 'KRW', category: 'food', memo: '' });
  await repo.setTripDates(trip.id, '2027-05-10', '2027-05-13');
  const moved = await repo.listDays(trip.id);
  expect(moved.map((d) => d.date)).toEqual(['2027-05-10', '2027-05-11', '2027-05-12', '2027-05-13']);
  expect(moved[0].id).toBe(days[0].id);
  expect((await repo.listStops(moved[0].id)).map((s) => s.name)).toEqual(['센소지']);
  expect((await repo.listExpenses(trip.id)).map((e) => e.date)).toEqual(['2027-05-10']);
  const t = await repo.getTrip(trip.id);
  expect([t?.startDate, t?.endDate]).toEqual(['2027-05-10', '2027-05-13']);
  // 줄이면 뒤쪽 날이 빠진다
  await repo.setTripDates(trip.id, '2027-05-10', '2027-05-10');
  expect((await repo.listDays(trip.id)).map((d) => d.id)).toEqual([days[0].id]);
});

test('recent places come newest first, once each, without booking places', async () => {
  const { repo, days } = await setup();
  await repo.saveStops(days[0].id, [stop(days[0].id, 0, 'A'), stop(days[0].id, 1, 'B'), { ...stop(days[0].id, 2, '호텔'), bookingId: 'b1' }]);
  await repo.saveStops(days[1].id, [stop(days[1].id, 0, 'A')]);
  expect((await repo.listRecentStops()).map((s) => s.name)).toEqual(['A', 'B']);
});

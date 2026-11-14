import { randomUUID } from 'crypto';

import { makeRepo } from '@/db/repo';
import { makeTestDb } from '@/db/testDb';
import type { Stop } from '@/domain/types';

import { handleEnter, refreshGeofences, type GeofenceDeps } from './geofenceCore';

async function setup(access: 'always' | 'whenInUse' | 'denied') {
  const repo = makeRepo(makeTestDb(), randomUUID);
  await repo.migrate();
  const trip = await repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-02', baseCurrency: 'KRW' });
  const [d1, d2] = await repo.listDays(trip.id);
  const s: Stop = { id: 's1', dayId: d1.id, order: 0, placeId: null, name: '센소지', lat: 35, lng: 139, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '' };
  await repo.saveStops(d1.id, [s]);
  const started: unknown[][] = [];
  const notified: string[] = [];
  let stopped = 0;
  const deps: GeofenceDeps = {
    repo,
    getAccess: async () => access,
    getPosition: async () => null,
    start: async (regions) => { started.push(regions); },
    stop: async () => { stopped++; },
    notify: async (title) => { notified.push(title); },
    now: () => '2027-03-01T03:00:00.000Z',
    today: () => '2027-03-01',
  };
  return { repo, deps, started, notified, d1, d2, stoppedCount: () => stopped };
}

test('with always-on access, today’s unvisited stops are registered', async () => {
  const { deps, started } = await setup('always');
  await refreshGeofences(deps);
  expect(started).toEqual([[{ identifier: 's1', latitude: 35, longitude: 139, radius: 150 }]]);
});

test('without always-on access nothing is registered and nothing throws', async () => {
  for (const access of ['whenInUse', 'denied'] as const) {
    const { deps, started } = await setup(access);
    await expect(refreshGeofences(deps)).resolves.toBeUndefined();
    expect(started).toEqual([]);
  }
});

test('when nothing is left to watch, geofencing is stopped', async () => {
  const { deps, started, repo, stoppedCount } = await setup('always');
  await repo.markStopArrived('s1', '2027-03-01T01:00:00.000Z', 'manual');
  await refreshGeofences(deps);
  expect(started).toEqual([]);
  expect(stoppedCount()).toBe(1);
});

test('entering a stop records arrival once and notifies once', async () => {
  const { deps, repo, notified } = await setup('always');
  await handleEnter(deps, 's1');
  expect(await repo.getStop('s1')).toMatchObject({ arrivedAt: '2027-03-01T03:00:00.000Z', arrivalMethod: 'auto' });
  deps.now = () => '2027-03-01T09:00:00.000Z';
  await handleEnter(deps, 's1');
  expect((await repo.getStop('s1'))?.arrivedAt).toBe('2027-03-01T03:00:00.000Z');
  expect(notified).toEqual(['센소지에 도착했어요']);
});

test('an enter event for a stop that no longer exists is ignored', async () => {
  const { deps, notified } = await setup('always');
  await expect(handleEnter(deps, 'gone')).resolves.toBeUndefined();
  expect(notified).toEqual([]);
});

const tomorrowStop = (dayId: string): Stop => ({ id: 't1', dayId, order: 0, placeId: null, name: '내일', lat: 36, lng: 140, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '' });

test('tomorrow’s stops fill the free slots so detection survives midnight', async () => {
  const { deps, started, repo, d2 } = await setup('always');
  await repo.saveStops(d2.id, [tomorrowStop(d2.id)]);
  await refreshGeofences(deps);
  expect((started[0] as { identifier: string }[]).map((r) => r.identifier)).toEqual(['s1', 't1']);
});

test('entering a stop planned for another day is not recorded as an arrival', async () => {
  const { deps, repo, d2, notified } = await setup('always');
  await repo.saveStops(d2.id, [tomorrowStop(d2.id)]);
  await handleEnter(deps, 't1');
  expect((await repo.getStop('t1'))?.arrivedAt).toBeNull();
  expect(notified).toEqual([]);
});

test('a failing notification does not lose the arrival or stop re-registration', async () => {
  const { deps, repo, started } = await setup('always');
  deps.notify = async () => { throw new Error('notifications not permitted'); };
  await expect(handleEnter(deps, 's1')).resolves.toBeUndefined();
  expect((await repo.getStop('s1'))?.arrivedAt).toBe('2027-03-01T03:00:00.000Z');
  expect(started).toHaveLength(0); // 남은 감시 대상이 없어 stop 이 호출된다
});

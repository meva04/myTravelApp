import { randomUUID } from 'crypto';

import { makeRepo } from '@/db/repo';
import { makeTestDb } from '@/db/testDb';
import type { Stop } from '@/domain/types';

import { ACTIONS, handlePromptResponse, upcomingReminders, wallKey, wallTimeAfter, type PromptData, type StopPrompt } from './promptsCore';

async function setup() {
  const repo = makeRepo(makeTestDb(), randomUUID);
  await repo.migrate();
  const trip = await repo.createTrip({ name: 't', city: '런던', startDate: '2027-03-01', endDate: '2027-03-02', baseCurrency: 'KRW' });
  const [d1, d2] = await repo.listDays(trip.id);
  const stop = (id: string, dayId: string, order: number, over: Partial<Stop> = {}): Stop => ({
    id, dayId, order, placeId: null, name: id, lat: 51.5, lng: -0.12, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '', ...over,
  });
  await repo.saveStops(d1.id, [
    stop('빅 벤', d1.id, 0, { plannedTime: '10:00' }),
    stop('런던 아이', d1.id, 1, { plannedTime: '23:50' }),
    stop('시간 없음', d1.id, 2),
    stop('이미 감', d1.id, 3, { plannedTime: '11:00', arrivedAt: '2027-03-01T10:00:00.000Z' }),
  ]);
  await repo.saveStops(d2.id, [stop('숨김', d2.id, 0, { plannedTime: '09:00' })]);
  await repo.setStopSkipped('숨김', true);
  return { repo, trip, d1 };
}

test('wallTimeAfter rolls over midnight into the next day', () => {
  expect(wallKey(wallTimeAfter('2027-03-01', '23:50', 15))).toBe('2027-03-02T00:05');
  expect(wallKey(wallTimeAfter('2027-02-28', '10:00', 15))).toBe('2027-02-28T10:15');
});

test('a reminder is planned 15 minutes after each planned time that is still ahead', async () => {
  const { repo, trip } = await setup();
  const before = await upcomingReminders(repo, '2027-02-20T09:00');
  // 시간이 없는 곳, 이미 도착한 곳, 숨긴 곳은 묻지 않는다
  expect(before.map((r) => [r.notice.data.stopId, wallKey(r.at)])).toEqual([
    ['빅 벤', '2027-03-01T10:15'],
    ['런던 아이', '2027-03-02T00:05'],
  ]);
  expect(before[0].notice).toMatchObject({ title: '빅 벤에 도착했어야 할 시간인데 아직이네요', body: '일정을 변경할까요?', category: 'overdue', data: { tripId: trip.id } });
  // 이미 지난 알림은 다시 예약하지 않는다
  expect((await upcomingReminders(repo, '2027-03-01T12:00')).map((r) => r.notice.data.stopId)).toEqual(['런던 아이']);
});

function responder(repo: Awaited<ReturnType<typeof setup>>['repo']) {
  const opened: [string, StopPrompt | undefined][] = [];
  let refreshed = 0;
  const deps = { repo, refresh: () => void refreshed++, openStop: (_t: string, stopId: string, prompt?: StopPrompt) => void opened.push([stopId, prompt]) };
  return { deps, opened, refreshed: () => refreshed };
}
const data = (kind: PromptData['kind'], stopId: string): PromptData => ({ kind, stopId, tripId: 'trip' });

test('"네, 도착했어요" records the arrival at the time of the alert and opens the place', async () => {
  const { repo } = await setup();
  const { deps, opened, refreshed } = responder(repo);
  await handlePromptResponse(deps, data('arrival', '빅 벤'), ACTIONS.arrived, '2027-03-01T10:02:00.000Z');
  expect(await repo.getStop('빅 벤')).toMatchObject({ arrivedAt: '2027-03-01T10:02:00.000Z', arrivalMethod: 'auto' });
  expect(refreshed()).toBe(1);
  expect(opened).toEqual([['빅 벤', undefined]]);
});

test('"가는 중이에요" changes nothing', async () => {
  const { repo } = await setup();
  const { deps, opened } = responder(repo);
  await handlePromptResponse(deps, data('arrival', '빅 벤'), ACTIONS.onTheWay, '2027-03-01T10:02:00.000Z');
  await handlePromptResponse(deps, data('overdue', '빅 벤'), ACTIONS.onTheWay, '2027-03-01T10:15:00.000Z');
  expect((await repo.getStop('빅 벤'))?.arrivedAt).toBeNull();
  expect(opened).toEqual([]);
});

test('tapping an alert opens the place with the matching question', async () => {
  const { repo } = await setup();
  const { deps, opened } = responder(repo);
  await handlePromptResponse(deps, data('arrival', '빅 벤'), null, 'x');
  await handlePromptResponse(deps, data('overdue', '빅 벤'), null, 'x');
  await handlePromptResponse(deps, data('overdue', '빅 벤'), ACTIONS.reschedule, 'x');
  await handlePromptResponse(deps, data('overdue', '빅 벤'), ACTIONS.skip, 'x');
  await handlePromptResponse(deps, data('overdue', '이미 감'), null, 'x'); // 그 사이 도착했으면 묻지 않는다
  await handlePromptResponse(deps, data('overdue', '없어진 곳'), null, 'x');
  expect(opened).toEqual([
    ['빅 벤', 'arrival'],
    ['빅 벤', 'overdue'],
    ['빅 벤', 'reschedule'],
    ['빅 벤', 'skip'],
    ['이미 감', undefined],
  ]);
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { OfflineError } from '@/google/errors';
import { setSkipped } from '@/state/itineraryOps';
import { pickDate, pickTime } from '@/testing/pickers';
import { makeTestServices, withServices } from '@/testing/services';

import { AddStopScreen, appendStop } from './AddStopScreen';
import { NewTripScreen } from './NewTripScreen';
import { TripHomeScreen } from './TripHomeScreen';
import { TripListScreen } from './TripListScreen';

const noop = () => {};

test('trip list shows an empty state when there are no trips', async () => {
  const sv = await makeTestServices();
  await render(withServices(sv, <TripListScreen onOpen={noop} onNew={noop} />));
  expect(await screen.findByText('아직 여행이 없어요')).toBeTruthy();
});

test('a new trip can be saved and then appears in the list', async () => {
  const sv = await makeTestServices();
  const done = jest.fn();
  const view = await render(withServices(sv, <NewTripScreen onDone={done} />));
  await fireEvent.changeText(screen.getByPlaceholderText('여행 이름'), '도쿄 봄');
  await fireEvent.changeText(screen.getByPlaceholderText(/^도시/), '도쿄');
  await fireEvent.press(screen.getByText('+ 도시'));
  await fireEvent.changeText(screen.getByPlaceholderText(/^도시/), '오사카');
  await pickDate('시작일', '2027-03-01');
  await pickDate('종료일', '2027-03-03');
  await fireEvent.press(screen.getByText('저장'));
  expect(done).toHaveBeenCalledWith((await sv.repo.listTrips())[0].id);
  expect((await sv.repo.listTrips())[0].city).toBe('도쿄, 오사카'); // 도시 여러 곳
  await view.unmount();
  await render(withServices(sv, <TripListScreen onOpen={noop} onNew={noop} />));
  expect(await screen.findByText('도쿄 봄')).toBeTruthy();
});

test('a trip whose end date is before its start date is rejected', async () => {
  const sv = await makeTestServices();
  const done = jest.fn();
  await render(withServices(sv, <NewTripScreen onDone={done} />));
  await fireEvent.changeText(screen.getByPlaceholderText('여행 이름'), 'x');
  await pickDate('시작일', '2027-03-05');
  await pickDate('종료일', '2027-03-01');
  await fireEvent.press(screen.getByText('저장'));
  expect(done).not.toHaveBeenCalled();
  expect(await sv.repo.listTrips()).toEqual([]);
  expect(screen.getByText(/날짜를 확인해 주세요/)).toBeTruthy();
});

test('trip home shows one tab per day', async () => {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-03', baseCurrency: 'KRW' });
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={noop} onOpenStop={noop} onExpenses={noop} onSettings={noop} />));
  expect(await screen.findByText('1일차')).toBeTruthy();
  expect(screen.getByText('2일차')).toBeTruthy();
  expect(screen.getByText('3일차')).toBeTruthy();
  expect(screen.queryByText('4일차')).toBeNull();
  expect(screen.getByText('이 날은 아직 비어 있어요')).toBeTruthy();
});

test('typing shows matching places; picking one and pressing 추가하기 puts it in the day right away', async () => {
  const sv = await makeTestServices();
  const queries: string[] = [];
  sv.places.search = async (q) => {
    queries.push(q);
    return [
      { placeId: 'p1', name: '센소지', address: '다이토구', lat: 35.71, lng: 139.79, kind: 'sight' as const },
      { placeId: 'p2', name: '스카이트리', address: '스미다구', lat: 35.71, lng: 139.81 },
    ].filter((h) => h.name.startsWith(q.slice(0, 1)));
  };
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  const done = jest.fn();
  await render(withServices(sv, <AddStopScreen dayId={day.id} onDone={done} />));

  // 입력하는 대로 결과가 아래에 나온다 (검색 버튼 없이)
  await fireEvent.changeText(screen.getByPlaceholderText('장소 이름 또는 구글 지도 링크'), '센소');
  await fireEvent.press(await screen.findByText('센소지'));
  // 시간·할 일을 적는 창이 뜨고, 추가하기를 누르면 바로 일정에 들어간다
  await pickTime('예정 시간', '09:30');
  await fireEvent.changeText(screen.getByPlaceholderText(/할 일 추가/), '부적 사기'); // 완료를 누르지 않아도 적은 글이 들어간다
  await fireEvent.press(screen.getByText('추가하기'));
  // 추가하기를 누르면 바로 일정에 넣고 돌아간다 (따로 완료 단계 없음)
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect((await sv.repo.listStops(day.id)).map((s) => [s.name, s.plannedTime, s.planNote, s.kind])).toEqual([['센소지', '09:30', '[ ] 부적 사기', 'sight']]);

  await fireEvent.changeText(screen.getByPlaceholderText('장소 이름 또는 구글 지도 링크'), '스카이');
  // 첫 누름에 바로 장소 카드가 뜬다
  await fireEvent.press(await screen.findByText('스카이트리'));
  expect(screen.getByTestId('place-card')).toBeTruthy();
  await fireEvent.press(screen.getByText('추가하기'));
  await waitFor(async () => expect(await sv.repo.listStops(day.id)).toHaveLength(2));
  const stops = await sv.repo.listStops(day.id);
  expect(stops.map((s) => s.name)).toEqual(['센소지', '스카이트리']);
  const legs = await sv.repo.listLegs(day.id);
  expect(legs.map((l) => [l.fromStopId, l.toStopId])).toEqual([[stops[0].id, stops[1].id]]);
  expect(queries).toContain('센소');
});

test('below the empty search box, recently added places can be added again (the same place twice in a day)', async () => {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  await appendStop(sv, day.id, { placeId: 'p1', name: '센소지', lat: 35.71, lng: 139.79, kind: 'sight' });
  const done = jest.fn();
  const opened: string[] = [];
  await render(withServices(sv, <AddStopScreen dayId={day.id} onDone={done} openUrl={(u) => void opened.push(u)} />));
  await fireEvent.press(await screen.findByLabelText('최근에 넣은 장소 센소지'));
  // 카드 안에서 구글로 확인할 수 있다
  await fireEvent.press(screen.getByText('Google 지도에서 보기 ↗'));
  expect(opened[0]).toContain('query_place_id=p1');
  await fireEvent.press(screen.getByText('추가하기'));
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect((await sv.repo.listStops(day.id)).map((s) => s.name)).toEqual(['센소지', '센소지']);
});

test('a place with a planned time goes into the day in time order, and before the hotel at night', async () => {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  await appendStop(sv, day.id, { placeId: null, name: '아침', lat: 1, lng: 1 }, { plannedTime: '09:00' });
  await appendStop(sv, day.id, { placeId: null, name: '호텔', lat: 1, lng: 1, kind: 'lodging' });
  await appendStop(sv, day.id, { placeId: null, name: '점심', lat: 1, lng: 1 });
  await appendStop(sv, day.id, { placeId: null, name: '이른 아침', lat: 1, lng: 1 }, { plannedTime: '07:00' });
  expect((await sv.repo.listStops(day.id)).map((s) => s.name)).toEqual(['이른 아침', '아침', '점심', '호텔']);
});

test('pasting a Google Maps link finds that place and opens the add form; results show their category', async () => {
  const sv = await makeTestServices();
  const link = 'https://maps.app.goo.gl/abc123';
  sv.places.fromMapsUrl = async (url) => (url === link ? { placeId: 'p7', name: 'Trattoria da Enzo', address: 'Roma', lat: 41.88, lng: 12.47, kind: 'food', category: '음식점' } : null);
  sv.places.search = async () => [{ placeId: 'p1', name: '콜로세움', address: '로마', lat: 41.89, lng: 12.49, category: '문화적 랜드마크' }];
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  await render(withServices(sv, <AddStopScreen dayId={day.id} onDone={noop} />));
  await fireEvent.changeText(screen.getByPlaceholderText('장소 이름 또는 구글 지도 링크'), '콜로');
  expect(await screen.findByText('문화적 랜드마크')).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('장소 이름 또는 구글 지도 링크'), link);
  await fireEvent.press(await screen.findByText('추가하기'));
  await waitFor(async () => expect((await sv.repo.listStops(day.id)).map((s) => [s.name, s.placeId, s.kind])).toEqual([['Trattoria da Enzo', 'p7', 'food']]));
});

test('searching while offline offers to retry when connected', async () => {
  const sv = await makeTestServices();
  sv.places.search = async () => { throw new OfflineError(); };
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  await render(withServices(sv, <AddStopScreen dayId={day.id} onDone={noop} />));
  await fireEvent.changeText(screen.getByPlaceholderText('장소 이름 또는 구글 지도 링크'), 'xy');
  expect(await screen.findByText('연결되면 다시 시도')).toBeTruthy();
});

async function dayWithStops(names: string[], days = 1) {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: `2027-03-0${days}`, baseCurrency: 'KRW' });
  const ds = await sv.repo.listDays(trip.id);
  for (const name of names) await appendStop(sv, ds[0].id, { placeId: null, name, lat: 1, lng: 1 });
  return { sv, trip, days: ds };
}
const home = (sv: Awaited<ReturnType<typeof makeTestServices>>, tripId: string, today?: string) =>
  withServices(sv, <TripHomeScreen tripId={tripId} today={today} onAddStop={noop} onOpenStop={noop} onExpenses={noop} onSettings={noop} />);

test('deleting the only stop of a day empties the day', async () => {
  const { sv, trip, days } = await dayWithStops(['센소지']);
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  await render(home(sv, trip.id));
  await fireEvent.press(await screen.findByText('편집'));
  await fireEvent.press(await screen.findByText('삭제'));
  expect(await screen.findByText('이 날은 아직 비어 있어요')).toBeTruthy();
  expect(await sv.repo.listStops(days[0].id)).toEqual([]);
});

test('moving a stop to another day carries its expenses to that date', async () => {
  const { sv, trip, days } = await dayWithStops(['A', 'B'], 2);
  const [a] = await sv.repo.listStops(days[0].id);
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: a.id, amount: 100, currency: 'KRW', category: 'food', memo: '' });
  await render(home(sv, trip.id));
  await fireEvent.press(await screen.findByText('편집'));
  await fireEvent.press((await screen.findAllByText('다른 날로'))[0]);
  await fireEvent.press(screen.getAllByText('2일차')[1]);
  await screen.findByText('B');
  expect((await sv.repo.listStops(days[1].id)).map((s) => s.name)).toEqual(['A']);
  expect((await sv.repo.listStops(days[0].id)).map((s) => [s.name, s.order])).toEqual([['B', 0]]);
  expect((await sv.repo.listExpenses(trip.id))[0].date).toBe('2027-03-02');
});

test('trip home opens on today when the trip is under way', async () => {
  const { sv, trip, days } = await dayWithStops(['A'], 2);
  await appendStop(sv, days[1].id, { placeId: null, name: '둘째날', lat: 1, lng: 1 });
  await render(home(sv, trip.id, '2027-03-02'));
  expect(await screen.findByText('둘째날')).toBeTruthy();
  expect(screen.queryByText('A')).toBeNull();
});

test('the day summary shows spending that could not be converted', async () => {
  const { sv, trip } = await dayWithStops(['A']);
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: null, amount: 20, currency: 'EUR', category: 'etc', memo: '' });
  await render(home(sv, trip.id));
  expect(await screen.findByText(/환산 안 됨: 20 EUR/)).toBeTruthy();
});

test('trip home shows the real distance of each leg by its travel mode', async () => {
  const { sv, trip } = await dayWithStops(['A', 'B', 'C']);
  const meters = [1100, 756];
  sv.routes.compute = async (_from, _to, mode) => ({ id: mode + meters.length, kind: 'default', polyline: [], distanceMeters: meters.shift() ?? 0, durationSeconds: 600 });
  await render(home(sv, trip.id));
  expect(await screen.findByText('1.1km ↗')).toBeTruthy();
  expect(screen.getByText('756m ↗')).toBeTruthy();
  expect(screen.getAllByText('10분')).toHaveLength(2);
  expect(screen.getAllByRole('radio', { name: '도보', selected: true })).toHaveLength(2);
});

test('changing a leg to transit re-measures it with that mode', async () => {
  const { sv, trip } = await dayWithStops(['A', 'B']);
  sv.routes.compute = async (_from, _to, mode) => ({ id: mode, kind: 'default', polyline: [], distanceMeters: mode === 'transit' ? 2400 : 900, durationSeconds: 600 });
  await render(home(sv, trip.id));
  await screen.findByText('900m ↗');
  // 이동 수단은 펼치지 않아도 늘 보이고, 언제든 다시 바꿀 수 있다
  await fireEvent.press(screen.getByRole('radio', { name: '대중교통' }));
  expect(await screen.findByText('2.4km ↗')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: '도보' }));
  expect(await screen.findByText('900m ↗')).toBeTruthy();
});

test('tapping a place card opens that place right away', async () => {
  const { sv, trip, days } = await dayWithStops(['A', 'B']);
  const open = jest.fn();
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={noop} onOpenStop={open} onExpenses={noop} onSettings={noop} />));
  await fireEvent.press(await screen.findByText('B'));
  const [, b] = await sv.repo.listStops(days[0].id);
  expect(open).toHaveBeenCalledWith(b.id);
});

test('the add button adds a stop to the shown day', async () => {
  const { sv, trip, days } = await dayWithStops(['A']);
  const add = jest.fn();
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={add} onOpenStop={noop} onExpenses={noop} onSettings={noop} />));
  await fireEvent.press(await screen.findByLabelText('장소 추가'));
  expect(add).toHaveBeenCalledWith(days[0].id);
});

test('hidden places leave the itinerary and its legs, and can be put back', async () => {
  const { sv, trip, days } = await dayWithStops(['A', 'B', 'C']);
  const [, b] = await sv.repo.listStops(days[0].id);
  await setSkipped(sv, b, true);
  expect((await sv.repo.listLegs(days[0].id)).length).toBe(1); // A → C 한 구간만
  await render(home(sv, trip.id));
  expect(await screen.findByText('숨긴 장소 1곳 ▾')).toBeTruthy();
  expect(screen.queryByText('B')).toBeNull();
  await fireEvent.press(screen.getByText('숨긴 장소 1곳 ▾'));
  await fireEvent.press(await screen.findByText('다시 일정에 넣기'));
  expect(await screen.findByText('B')).toBeTruthy();
  expect(screen.queryByText(/숨긴 장소/)).toBeNull();
  expect((await sv.repo.listLegs(days[0].id)).length).toBe(2);
});

test('travel notes are separate cards between two places; each can be checked off and opened', async () => {
  const { sv, trip, days } = await dayWithStops(['A', 'B', 'C']);
  const open = jest.fn();
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={noop} onOpenStop={noop} onOpenNote={open} onExpenses={noop} onSettings={noop} />));
  const adds = await screen.findAllByLabelText('+ 메모');
  expect(adds).toHaveLength(2); // A→B, B→C 사이마다 하나
  await fireEvent.press(adds[0]);
  await fireEvent.changeText(screen.getByPlaceholderText(/가는 길에 할 일/), '교통카드 구입');
  await fireEvent(screen.getByPlaceholderText(/가는 길에 할 일/), 'submitEditing');
  await fireEvent.changeText(screen.getByPlaceholderText(/가는 길에 할 일/), '현금 2,000엔');
  await fireEvent.press(screen.getByText('추가하기'));
  expect(await screen.findByText('교통카드 구입')).toBeTruthy();
  expect(screen.getAllByLabelText(/^이동 메모 /)).toHaveLength(2); // 하나하나가 각각의 카드
  const [a] = await sv.repo.listStops(days[0].id);
  const notes = await sv.repo.listNotesForDay(days[0].id);
  expect(notes.map((n) => [n.text, n.done])).toEqual([['교통카드 구입', false], ['현금 2,000엔', false]]);
  // 일정에서 A 바로 뒤에 놓인다
  expect((await sv.repo.listSequence(days[0].id)).slice(0, 3).map((x) => x.id)).toEqual([a.id, notes[0].id, notes[1].id]);

  // 이동 중에 바로 체크
  await fireEvent.press(screen.getByRole('checkbox', { name: '교통카드 구입' }));
  await waitFor(async () => expect((await sv.repo.getNote(notes[0].id))?.done).toBe(true));

  // 카드를 누르면 그 메모 화면이 열린다
  await fireEvent.press(screen.getByLabelText('이동 메모 현금 2,000엔'));
  expect(open).toHaveBeenCalledWith(notes[1].id);
});

test('plan items can be checked off right from the itinerary', async () => {
  const { sv, trip, days } = await dayWithStops(['A']);
  const [a] = await sv.repo.listStops(days[0].id);
  await sv.repo.setStopPlanNote(a.id, '[ ] 예약 확인\n[ ] 우산');
  await render(home(sv, trip.id));
  await fireEvent.press(await screen.findByRole('checkbox', { name: '우산' }));
  await waitFor(async () => expect((await sv.repo.getStop(a.id))?.planNote).toBe('[ ] 예약 확인\n[x] 우산'));
  expect(await screen.findByRole('checkbox', { name: '우산', checked: true })).toBeTruthy();
});

test('tapping the distance of a leg opens Google Maps: navigation for walking/driving, transit options for transit', async () => {
  const { sv, trip } = await dayWithStops(['A', 'B']);
  const opened: string[] = [];
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={noop} onOpenStop={noop} onExpenses={noop} onSettings={noop} openUrl={(u) => void opened.push(u)} />));
  expect(screen.queryByText('↗ 구글 지도 길 안내')).toBeNull(); // 따로 길 안내 버튼은 없다
  await fireEvent.press(await screen.findByLabelText(/구글 지도 길 안내$/));
  expect(opened[0]).toContain('travelmode=walking');
  expect(opened[0]).toContain('dir_action=navigate');
  await fireEvent.press(screen.getByRole('radio', { name: '대중교통' }));
  await fireEvent.press(await screen.findByLabelText(/구글 지도 대중교통$/));
  expect(opened[1]).toContain('travelmode=transit');
  expect(opened[1]).not.toContain('dir_action');
});

test('swiping a place or a travel note shows a delete button', async () => {
  const { sv, trip, days } = await dayWithStops(['A', 'B']);
  const [a] = await sv.repo.listStops(days[0].id);
  await sv.repo.addNote(days[0].id, a.id, '표 사기');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  await render(home(sv, trip.id));
  await fireEvent.press(await screen.findByLabelText('표 사기 삭제'));
  await waitFor(async () => expect(await sv.repo.listNotesForDay(days[0].id)).toEqual([]));
  await fireEvent.press(screen.getByLabelText('A 삭제'));
  await waitFor(async () => expect((await sv.repo.listStops(days[0].id)).map((s) => s.name)).toEqual(['B']));
  alert.mockRestore();
});

test('once arrived, the itinerary shows the arrival time instead of the planned time', async () => {
  const { sv, trip, days } = await dayWithStops(['A', 'B']);
  const [a, b] = await sv.repo.listStops(days[0].id);
  await sv.repo.setStopPlannedTime(a.id, '09:00');
  await sv.repo.setStopPlannedTime(b.id, '13:00');
  await sv.repo.markStopArrived(a.id, new Date(2027, 2, 1, 9, 12).toISOString(), 'manual');
  await render(home(sv, trip.id));
  expect(await screen.findByText('도착 09:12')).toBeTruthy();
  expect(screen.queryByText('09:00')).toBeNull();
  expect(screen.getByText('13:00')).toBeTruthy();
});

test('a past day opens as a diary of visited places, and can be switched back to the plan', async () => {
  const { sv, trip, days } = await dayWithStops(['A', 'B'], 2);
  const [a] = await sv.repo.listStops(days[0].id);
  await sv.repo.markStopArrived(a.id, new Date(2027, 2, 1, 10, 0).toISOString(), 'manual');
  await sv.repo.setStopMemo(a.id, '햇살이 좋았다');
  await sv.repo.addPhoto({ stopId: a.id, uri: 'a.jpg', takenAt: '2027-03-01T01:00:00.000Z', lat: null, lng: null });
  await render(home(sv, trip.id, '2027-03-02'));
  await fireEvent.press(await screen.findByText('1일차'));
  expect(await screen.findByTestId('diary')).toBeTruthy();
  expect(screen.getByText('햇살이 좋았다')).toBeTruthy();
  expect(screen.getByText('가지 못한 곳 · B')).toBeTruthy();
  await fireEvent.press(screen.getByText('계획 보기'));
  expect(screen.queryByTestId('diary')).toBeNull();
  expect(screen.getByText('B')).toBeTruthy();
});

test('in the diary, a photo opens full screen and the day ends with what was spent', async () => {
  const { sv, trip, days } = await dayWithStops(['A'], 2);
  const [a] = await sv.repo.listStops(days[0].id);
  await sv.repo.markStopArrived(a.id, new Date(2027, 2, 1, 10, 0).toISOString(), 'manual');
  await sv.repo.addPhoto({ stopId: a.id, uri: 'a.jpg', takenAt: '2027-03-01T01:00:00.000Z', lat: null, lng: null });
  await sv.repo.addPhoto({ stopId: a.id, uri: 'b.jpg', takenAt: '2027-03-01T02:00:00.000Z', lat: null, lng: null });
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: a.id, amount: 12000, currency: 'KRW', category: 'food', memo: '점심' });
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-02', stopId: null, amount: 999, currency: 'KRW', category: 'etc', memo: '다른 날' });
  await render(home(sv, trip.id, '2027-03-02'));
  await fireEvent.press(await screen.findByText('1일차'));
  const photos = await screen.findAllByLabelText('사진 크게 보기');
  expect(photos).toHaveLength(2);
  await fireEvent.press(photos[1]);
  expect(await screen.findByTestId('photo-viewer')).toBeTruthy();
  expect(screen.getByText('2 / 2')).toBeTruthy(); // 누른 사진부터, 옆으로 넘겨 다른 사진도 본다
  await fireEvent.press(screen.getByLabelText('닫기'));
  expect(screen.queryByTestId('photo-viewer')).toBeNull();

  await fireEvent.press(screen.getByText('이 날 쓴 돈'));
  expect(await screen.findByTestId('diary-spending')).toBeTruthy();
  expect(screen.getByText('식비 · 점심')).toBeTruthy();
  expect(screen.queryByText(/다른 날/)).toBeNull();
});

test('a hotel booking puts the hotel at the end of the check-in day and the start of the next', async () => {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-02', baseCurrency: 'KRW' });
  const [d1, d2] = await sv.repo.listDays(trip.id);
  await appendStop(sv, d1.id, { placeId: null, name: '센소지', lat: 1, lng: 1 });
  await appendStop(sv, d2.id, { placeId: null, name: '시부야', lat: 1, lng: 1 });
  const { applyBooking, removeBooking } = jest.requireActual('@/state/itineraryOps') as typeof import('@/state/itineraryOps');
  const hotel = { id: 'h', tripId: trip.id, kind: 'lodging' as const, title: '호텔', place: { name: '호텔', placeId: null, lat: 2, lng: 2 }, checkIn: '2027-03-01', checkOut: '2027-03-02', checkInTime: '15:00', checkOutTime: '11:00' };
  await applyBooking(sv, hotel);
  expect((await sv.repo.listStops(d1.id)).map((s) => s.name)).toEqual(['센소지', '호텔']);
  expect((await sv.repo.listStops(d2.id)).map((s) => [s.name, s.plannedTime])).toEqual([['호텔', '11:00'], ['시부야', null]]);
  // 새 장소는 밤에 돌아갈 호텔 앞에 들어간다
  await appendStop(sv, d1.id, { placeId: null, name: '스카이트리', lat: 1, lng: 1 });
  expect((await sv.repo.listStops(d1.id)).map((s) => s.name)).toEqual(['센소지', '스카이트리', '호텔']);
  // 예약을 지우면 일정에서도 빠진다
  await removeBooking(sv, 'h');
  expect((await sv.repo.listStops(d1.id)).map((s) => s.name)).toEqual(['센소지', '스카이트리']);
  expect((await sv.repo.listStops(d2.id)).map((s) => s.name)).toEqual(['시부야']);
});

test('a flight on a place shows its seat on a cabin drawing', async () => {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const { applyBooking } = jest.requireActual('@/state/itineraryOps') as typeof import('@/state/itineraryOps');
  await applyBooking(sv, {
    id: 'f', tripId: trip.id, kind: 'flight', title: 'KE703', vehicle: 'Boeing 787-9', seat: '32A',
    from: { name: '인천 ICN', placeId: null, lat: 37.4, lng: 126.4 }, to: { name: '도쿄 NRT', placeId: null, lat: 35.7, lng: 140.3 },
    departDate: '2027-03-01', departTime: '09:00', arriveDate: '2027-03-01', arriveTime: '11:20',
  });
  const [day] = await sv.repo.listDays(trip.id);
  const stops = await sv.repo.listStops(day.id);
  expect(stops.map((s) => [s.name, s.plannedTime, s.kind])).toEqual([['인천 ICN', '09:00', 'airport'], ['도쿄 NRT', '11:20', 'airport']]);
  // 비행 당일에는 인천공항 운항 정보로 카운터·게이트·지연을 채운다
  sv.flights = {
    available: true,
    today: async () => ({ direction: 'departure', gate: '250', terminal: 'T2', checkin: 'E01-E06', status: '지연', estimated: '09:35' }),
  };
  await render(home(sv, trip.id, '2027-03-01'));
  expect(await screen.findByText('KE703 · 지연 · 변경 09:35 · 터미널 T2 · 카운터 E01-E06 · 게이트 250 · 좌석 32A')).toBeTruthy();
  const { StopScreen } = jest.requireActual('./StopScreen') as typeof import('./StopScreen');
  await render(withServices(sv, <StopScreen stopId={stops[0].id} pickPhoto={async () => []} resolvePhoto={(u) => u} openUrl={noop} />));
  expect(await screen.findByLabelText('my-seat:32A')).toBeTruthy();
  expect(screen.getByText('32A · 창가')).toBeTruthy();
});

test('on a wide screen (unfolded iPhone Duo) the itinerary sits beside the map instead of in a sheet', async () => {
  const { sv, trip } = await dayWithStops(['A', 'B']);
  const rn = jest.requireActual('react-native') as typeof import('react-native');
  const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 669, height: 951, scale: 3, fontScale: 1 });
  await render(home(sv, trip.id));
  expect(await screen.findByTestId('split-layout')).toBeTruthy();
  expect(screen.getByText('A')).toBeTruthy();
  spy.mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  await render(home(sv, trip.id));
  await screen.findAllByText('A');
  expect(screen.queryByTestId('split-layout')).toBeNull();
  spy.mockRestore();
});

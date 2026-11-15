import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { OfflineError } from '@/google/errors';
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
  await fireEvent.changeText(screen.getByPlaceholderText('도시'), '도쿄');
  await fireEvent.changeText(screen.getByPlaceholderText('시작일 (예: 2027-03-01)'), '2027-03-01');
  await fireEvent.changeText(screen.getByPlaceholderText('종료일 (예: 2027-03-05)'), '2027-03-03');
  await fireEvent.press(screen.getByText('저장'));
  expect(done).toHaveBeenCalledWith((await sv.repo.listTrips())[0].id);
  await view.unmount();
  await render(withServices(sv, <TripListScreen onOpen={noop} onNew={noop} />));
  expect(await screen.findByText('도쿄 봄')).toBeTruthy();
});

test('a trip whose end date is before its start date is rejected', async () => {
  const sv = await makeTestServices();
  const done = jest.fn();
  await render(withServices(sv, <NewTripScreen onDone={done} />));
  await fireEvent.changeText(screen.getByPlaceholderText('여행 이름'), 'x');
  await fireEvent.changeText(screen.getByPlaceholderText('시작일 (예: 2027-03-01)'), '2027-03-05');
  await fireEvent.changeText(screen.getByPlaceholderText('종료일 (예: 2027-03-05)'), '2027-03-01');
  await fireEvent.press(screen.getByText('저장'));
  expect(done).not.toHaveBeenCalled();
  expect(await sv.repo.listTrips()).toEqual([]);
  expect(screen.getByText(/날짜를 확인해 주세요/)).toBeTruthy();
});

test('trip home shows one tab per day', async () => {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-03', baseCurrency: 'KRW' });
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={noop} onOpenMap={noop} onOpenStop={noop} onExpenses={noop} onSettings={noop} />));
  expect(await screen.findByText('1일차')).toBeTruthy();
  expect(screen.getByText('2일차')).toBeTruthy();
  expect(screen.getByText('3일차')).toBeTruthy();
  expect(screen.queryByText('4일차')).toBeNull();
  expect(screen.getByText('이 날은 아직 비어 있어요')).toBeTruthy();
});

test('picking a search result adds a stop and keeps legs in sync', async () => {
  const sv = await makeTestServices();
  sv.places.search = async () => [
    { placeId: 'p1', name: '센소지', address: '다이토구', lat: 35.71, lng: 139.79 },
    { placeId: 'p2', name: '스카이트리', address: '스미다구', lat: 35.71, lng: 139.81 },
  ];
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  const done = jest.fn();
  for (const name of ['센소지', '스카이트리']) {
    const view = await render(withServices(sv, <AddStopScreen dayId={day.id} onDone={done} />));
    await fireEvent.changeText(screen.getByPlaceholderText('장소 이름으로 검색'), name);
    await fireEvent.press(screen.getByText('검색'));
    await fireEvent.press(await screen.findByText(name));
    await view.unmount();
  }
  const stops = await sv.repo.listStops(day.id);
  expect(stops.map((s) => [s.name, s.order, s.placeId])).toEqual([['센소지', 0, 'p1'], ['스카이트리', 1, 'p2']]);
  const legs = await sv.repo.listLegs(day.id);
  expect(legs.map((l) => [l.fromStopId, l.toStopId])).toEqual([[stops[0].id, stops[1].id]]);
  expect(done).toHaveBeenCalledTimes(2);
});

test('searching while offline offers to retry when connected', async () => {
  const sv = await makeTestServices();
  sv.places.search = async () => { throw new OfflineError(); };
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  await render(withServices(sv, <AddStopScreen dayId={day.id} onDone={noop} />));
  await fireEvent.changeText(screen.getByPlaceholderText('장소 이름으로 검색'), 'x');
  await fireEvent.press(screen.getByText('검색'));
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
  withServices(sv, <TripHomeScreen tripId={tripId} today={today} onAddStop={noop} onOpenMap={noop} onOpenStop={noop} onExpenses={noop} onSettings={noop} />);

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
  expect(await screen.findByText('1.1km')).toBeTruthy();
  expect(screen.getByText('756m')).toBeTruthy();
  expect(screen.getAllByText('도보 · 10분 ▾')).toHaveLength(2);
});

test('changing a leg to transit re-measures it with that mode', async () => {
  const { sv, trip } = await dayWithStops(['A', 'B']);
  sv.routes.compute = async (_from, _to, mode) => ({ id: mode, kind: 'default', polyline: [], distanceMeters: mode === 'transit' ? 2400 : 900, durationSeconds: 600 });
  await render(home(sv, trip.id));
  await fireEvent.press(await screen.findByText('900m'));
  await fireEvent.press(screen.getByText('대중교통'));
  expect(await screen.findByText('2.4km')).toBeTruthy();
});

test('tapping a stop selects it, tapping it again opens it', async () => {
  const { sv, trip } = await dayWithStops(['A', 'B']);
  const open = jest.fn();
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={noop} onOpenMap={noop} onOpenStop={open} onExpenses={noop} onSettings={noop} />));
  await fireEvent.press(await screen.findByText('B'));
  expect(open).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('B'));
  expect(open).toHaveBeenCalledTimes(1);
});

test('the add button adds a stop to the shown day', async () => {
  const { sv, trip, days } = await dayWithStops(['A']);
  const add = jest.fn();
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={add} onOpenMap={noop} onOpenStop={noop} onExpenses={noop} onSettings={noop} />));
  await fireEvent.press(await screen.findByLabelText('장소 추가'));
  expect(add).toHaveBeenCalledWith(days[0].id);
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import { OfflineError } from '@/google/errors';
import { makeTestServices, withServices } from '@/testing/services';

import { AddStopScreen } from './AddStopScreen';
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

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Stop } from '@/domain/types';
import { OfflineError } from '@/google/errors';
import { makeTestServices, withServices } from '@/testing/services';

import { StopScreen } from './StopScreen';

async function setup(over: Partial<Stop> = {}) {
  const sv = await makeTestServices();
  const changed = jest.fn();
  sv.onItineraryChanged = changed;
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  await sv.repo.updateTrip({ ...trip, rates: { JPY: 9 } });
  const [day] = await sv.repo.listDays(trip.id);
  const stop: Stop = { id: 's1', dayId: day.id, order: 0, placeId: 'p1', name: '센소지', lat: 35, lng: 139, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', ...over };
  await sv.repo.saveStops(day.id, [stop]);
  const ui = withServices(sv, <StopScreen stopId="s1" pickPhoto={async () => null} resolvePhoto={(u) => u} openUrl={() => {}} now={() => '2027-03-01T03:04:00.000Z'} />);
  return { sv, trip, ui, changed };
}

test('pressing 도착 records a manual arrival and shows the stamp', async () => {
  const { sv, ui, changed } = await setup();
  await render(ui);
  expect(screen.queryByTestId('stamp')).toBeNull();
  await fireEvent.press(await screen.findByText('도착'));
  expect(await screen.findByTestId('stamp')).toBeTruthy();
  expect(await sv.repo.getStop('s1')).toMatchObject({ arrivedAt: '2027-03-01T03:04:00.000Z', arrivalMethod: 'manual' });
  expect(screen.queryByText('도착')).toBeNull();
  expect(changed).toHaveBeenCalled();
});

test('a stop that was already reached shows its stamp and no 도착 button', async () => {
  const { ui } = await setup({ arrivedAt: '2027-03-01T01:00:00.000Z', arrivalMethod: 'auto' });
  await render(ui);
  expect(await screen.findByTestId('stamp')).toBeTruthy();
  expect(screen.queryByText('도착')).toBeNull();
});

test('an added expense appears in the list and the subtotal in base currency', async () => {
  const { sv, trip, ui } = await setup();
  await render(ui);
  await fireEvent.changeText(await screen.findByPlaceholderText('금액'), '1000');
  await fireEvent.changeText(screen.getByPlaceholderText('통화'), 'jpy');
  await fireEvent.changeText(screen.getByPlaceholderText('내용'), '라멘');
  await fireEvent.press(screen.getByText('비용 추가'));
  expect(await screen.findByText(/라멘/)).toBeTruthy();
  expect(screen.getByText('소계 9,000 KRW')).toBeTruthy();
  expect(await sv.repo.listExpenses(trip.id)).toMatchObject([{ amount: 1000, currency: 'JPY', stopId: 's1', date: '2027-03-01', category: 'food' }]);
});

test('an expense with a non-numeric amount is rejected', async () => {
  const { sv, trip, ui } = await setup();
  await render(ui);
  await fireEvent.changeText(await screen.findByPlaceholderText('금액'), 'abc');
  await fireEvent.press(screen.getByText('비용 추가'));
  expect(screen.getByText('금액을 숫자로 입력해 주세요')).toBeTruthy();
  expect(await sv.repo.listExpenses(trip.id)).toEqual([]);
});

test('place info is shown with rating and Google attribution', async () => {
  const { sv, ui } = await setup();
  sv.places.details = async () => ({ placeId: 'p1', name: '센소지', address: '다이토구', lat: 35, lng: 139, rating: 4.5, ratingCount: 1200, openingHours: ['월요일: 06:00~17:00'], website: null, photoUrls: [] });
  await render(ui);
  expect(await screen.findByText('★ 4.5 (1200)')).toBeTruthy();
  expect(screen.getByText('월요일: 06:00~17:00')).toBeTruthy();
  expect(screen.getByText('장소 정보 제공: Google')).toBeTruthy();
});

test('offline place info does not hide my own records', async () => {
  const { sv, ui } = await setup({ memo: '비가 왔다' });
  sv.places.details = async () => { throw new OfflineError(); };
  await render(ui);
  expect(await screen.findByText('장소 정보는 연결되면 다시 불러올 수 있어요')).toBeTruthy();
  expect(screen.getByDisplayValue('비가 왔다')).toBeTruthy();
  expect(screen.getByText('도착')).toBeTruthy();
});

test('memo edits are saved', async () => {
  const { sv, ui } = await setup();
  await render(ui);
  const memo = await screen.findByPlaceholderText('여기서 있었던 일을 적어보세요');
  await fireEvent.changeText(memo, '사람이 많았다');
  await fireEvent(memo, 'blur');
  expect((await sv.repo.getStop('s1'))?.memo).toBe('사람이 많았다');
});

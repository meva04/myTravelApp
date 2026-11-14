import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { makeTestServices, withServices } from '@/testing/services';

import { ExpensesScreen } from './ExpensesScreen';
import { SettingsScreen } from './SettingsScreen';

const noop = () => {};
const notif = { getNotifications: async () => true, requestNotifications: async () => true };

async function setup() {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-02', baseCurrency: 'KRW' });
  await sv.repo.updateTrip({ ...trip, rates: { JPY: 9 } });
  return { sv, trip };
}

test('summary shows total, per-date and per-category amounts', async () => {
  const { sv, trip } = await setup();
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: null, amount: 1000, currency: 'JPY', category: 'food', memo: '' });
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-02', stopId: null, amount: 5000, currency: 'KRW', category: 'shopping', memo: '' });
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} />));
  expect(await screen.findByText('14,000 KRW')).toBeTruthy();
  expect(screen.getByText('2027-03-01')).toBeTruthy();
  expect(screen.getAllByText('9,000 KRW')).toHaveLength(2); // 날짜별 + 식비
  expect(screen.getAllByText('5,000 KRW')).toHaveLength(3); // 날짜별 + 그 날 항목 + 쇼핑
  expect(screen.getByText('1,000 JPY')).toBeTruthy(); // 항목은 원래 통화로
  expect(screen.queryByText('환산 안 됨')).toBeNull();
});

test('amounts without a rate are listed apart with a link to set the rate', async () => {
  const { sv, trip } = await setup();
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: null, amount: 20, currency: 'EUR', category: 'etc', memo: '' });
  const edit = jest.fn();
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={edit} />));
  expect(await screen.findByText('환산 안 됨')).toBeTruthy();
  expect(screen.getAllByText('20 EUR')).toHaveLength(2); // 환산 안 됨 + 그 날 항목
  await fireEvent.press(screen.getByText('환율 입력하기'));
  expect(edit).toHaveBeenCalled();
});

test('expenses are listed per date and can be deleted', async () => {
  const { sv, trip } = await setup();
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: null, amount: 7000, currency: 'KRW', category: 'transport', memo: '택시' });
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} />));
  expect(await screen.findByText('교통 · 택시')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('택시 삭제'));
  expect(await sv.repo.listExpenses(trip.id)).toEqual([]);
});

test('a loose expense with a date outside the trip is rejected', async () => {
  const { sv, trip } = await setup();
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} />));
  await fireEvent.changeText(await screen.findByPlaceholderText('날짜 (예: 2027-03-01)'), '2027-04-09');
  await fireEvent.changeText(screen.getByPlaceholderText('금액'), '3000');
  await fireEvent.press(screen.getByText('비용 추가'));
  expect(await sv.repo.listExpenses(trip.id)).toEqual([]);
  expect(screen.getByText('여행 기간 안의 날짜를 입력해 주세요')).toBeTruthy();
});

test('an expense with no place can be added to a date', async () => {
  const { sv, trip } = await setup();
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} />));
  await fireEvent.changeText(await screen.findByPlaceholderText('날짜 (예: 2027-03-01)'), '2027-03-02');
  await fireEvent.changeText(screen.getByPlaceholderText('금액'), '3000');
  await fireEvent.press(screen.getByText('비용 추가'));
  expect(await sv.repo.listExpenses(trip.id)).toMatchObject([{ date: '2027-03-02', stopId: null, amount: 3000, currency: 'KRW' }]);
  expect((await screen.findAllByText('3,000 KRW')).length).toBeGreaterThan(0);
});

test('settings explains how to enable auto arrival unless access is always', async () => {
  const { sv, trip } = await setup();
  const view = await render(withServices(sv, <SettingsScreen tripId={trip.id} getAccess={async () => 'whenInUse'} requestAlways={async () => 'whenInUse'} openSystemSettings={noop} {...notif} />));
  expect(await screen.findByText(/"항상 허용"으로 바꿔 주세요/)).toBeTruthy();
  await view.unmount();
  await render(withServices(sv, <SettingsScreen tripId={trip.id} getAccess={async () => 'always'} requestAlways={async () => 'always'} openSystemSettings={noop} {...notif} />));
  expect(await screen.findByText(/켜짐/)).toBeTruthy();
  expect(screen.queryByText(/"항상 허용"으로 바꿔 주세요/)).toBeNull();
});

test('asking for location also asks for notification permission, and its state is shown', async () => {
  const { sv, trip } = await setup();
  const requestNotifications = jest.fn(async () => true);
  await render(withServices(sv, <SettingsScreen tripId={trip.id} getAccess={async () => 'whenInUse'} requestAlways={async () => 'always'} openSystemSettings={noop} getNotifications={async () => false} requestNotifications={requestNotifications} />));
  expect(await screen.findByText(/도착 알림이 꺼져 있어요/)).toBeTruthy();
  await fireEvent.press(screen.getByText('위치 권한 요청'));
  expect(requestNotifications).toHaveBeenCalled();
  expect(screen.queryByText(/도착 알림이 꺼져 있어요/)).toBeNull();
});

test('a rate can be added for a new currency', async () => {
  const { sv, trip } = await setup();
  await render(withServices(sv, <SettingsScreen tripId={trip.id} getAccess={async () => 'always'} requestAlways={async () => 'always'} openSystemSettings={noop} {...notif} />));
  await fireEvent.changeText(await screen.findByPlaceholderText('통화 추가 (예: JPY)'), 'eur');
  await fireEvent.changeText(screen.getByPlaceholderText('1 EUR = ? KRW'), '1500');
  await fireEvent.press(screen.getByText('저장'));
  expect((await sv.repo.getTrip(trip.id))?.rates).toEqual({ JPY: 9, EUR: 1500 });
});

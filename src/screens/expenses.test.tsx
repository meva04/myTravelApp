import { fireEvent, render, screen } from '@testing-library/react-native';

import { makeTestServices, withServices } from '@/testing/services';

import { ExpensesScreen } from './ExpensesScreen';
import { SettingsScreen } from './SettingsScreen';

const noop = () => {};

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
  expect(screen.getAllByText('5,000 KRW')).toHaveLength(2); // 날짜별 + 쇼핑
  expect(screen.queryByText('환산 안 됨')).toBeNull();
});

test('amounts without a rate are listed apart with a link to set the rate', async () => {
  const { sv, trip } = await setup();
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: null, amount: 20, currency: 'EUR', category: 'etc', memo: '' });
  const edit = jest.fn();
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={edit} />));
  expect(await screen.findByText('환산 안 됨')).toBeTruthy();
  expect(screen.getByText('20 EUR')).toBeTruthy();
  await fireEvent.press(screen.getByText('환율 입력하기'));
  expect(edit).toHaveBeenCalled();
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
  const view = await render(withServices(sv, <SettingsScreen tripId={trip.id} getAccess={async () => 'whenInUse'} requestAlways={async () => 'whenInUse'} openSystemSettings={noop} />));
  expect(await screen.findByText(/"항상 허용"으로 바꿔 주세요/)).toBeTruthy();
  await view.unmount();
  await render(withServices(sv, <SettingsScreen tripId={trip.id} getAccess={async () => 'always'} requestAlways={async () => 'always'} openSystemSettings={noop} />));
  expect(await screen.findByText(/켜짐/)).toBeTruthy();
  expect(screen.queryByText(/"항상 허용"으로 바꿔 주세요/)).toBeNull();
});

test('a rate can be added for a new currency', async () => {
  const { sv, trip } = await setup();
  await render(withServices(sv, <SettingsScreen tripId={trip.id} getAccess={async () => 'always'} requestAlways={async () => 'always'} openSystemSettings={noop} />));
  await fireEvent.changeText(await screen.findByPlaceholderText('통화 추가 (예: JPY)'), 'eur');
  await fireEvent.changeText(screen.getByPlaceholderText('1 EUR = ? KRW'), '1500');
  await fireEvent.press(screen.getByText('저장'));
  expect((await sv.repo.getTrip(trip.id))?.rates).toEqual({ JPY: 9, EUR: 1500 });
});

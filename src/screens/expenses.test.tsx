import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { addExpense } from '@/state/expenseOps';
import { pickDate } from '@/testing/pickers';
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
  await pickDate('날짜', '2027-04-09');
  await fireEvent.changeText(screen.getByPlaceholderText('금액'), '3000');
  await fireEvent.press(screen.getByText('비용 추가'));
  expect(await sv.repo.listExpenses(trip.id)).toEqual([]);
  expect(screen.getByText('여행 기간 안의 날짜를 입력해 주세요')).toBeTruthy();
});

test('an expense with no place can be added to a date', async () => {
  const { sv, trip } = await setup();
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} />));
  await pickDate('날짜', '2027-03-02');
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

test('people can be added; each expense records who paid and who splits it, and the settlement says what I owe', async () => {
  const { sv, trip } = await setup();
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} />));
  for (const n of ['민수', '지영']) {
    await fireEvent.changeText(await screen.findByPlaceholderText('이름 (예: 민수)'), n);
    await fireEvent.press(screen.getByText('추가'));
    await screen.findByText(`${n} ✕`);
  }
  // 민수가 3만원 내고 셋이 나눔
  await fireEvent.changeText(screen.getByPlaceholderText('금액'), '30000');
  await fireEvent.press(screen.getByLabelText('낸 사람 민수'));
  await fireEvent.press(screen.getByText('비용 추가'));
  expect(await screen.findByText('식비 · 민수 냄 · 3명')).toBeTruthy();
  // 지영이 빠진 1만원: 내가 내고 민수와 둘이 나눔
  await fireEvent.changeText(screen.getByPlaceholderText('금액'), '10000');
  await fireEvent.press(screen.getByLabelText('나눌 사람 지영'));
  await fireEvent.press(screen.getByText('비용 추가'));
  expect(await screen.findByText('식비 · 나 냄 · 2명')).toBeTruthy();

  // 나: 낸 1만, 몫 1만+5천 → 5천 낼 돈. 민수: 낸 3만, 몫 1만+5천 → 1만5천 받음. 지영: 몫 1만 → 낼 돈
  expect(screen.getByText('내가 낼 돈')).toBeTruthy();
  expect(screen.getByText('지영 → 민수 10,000 KRW')).toBeTruthy();
  expect(screen.getByText('나 → 민수 5,000 KRW')).toBeTruthy();

  // 비용에 들어간 사람은 뺄 수 없다
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByLabelText('지영 삭제'));
  expect(alert).toHaveBeenCalledWith('지영', expect.stringContaining('뺄 수 없어요'));
  alert.mockRestore();
});

test('the city sets the local currency; expenses can be entered in KRW, local or USD and the total shown in any of them', async () => {
  const fx = { latest: jest.fn(async () => ({ date: '2027-03-01', rates: { JPY: 9, USD: 1400 } })) };
  const sv = await makeTestServices({ fx });
  const trip = await sv.repo.createTrip({ name: 't', city: '도쿄', startDate: '2027-03-01', endDate: '2027-03-02', baseCurrency: 'KRW' });
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} today="2027-03-01" />));
  expect(await screen.findByText('현지 통화: JPY')).toBeTruthy();
  // 여행 중에는 현지 통화가 기본
  await fireEvent.changeText(screen.getByPlaceholderText('금액'), '1000');
  await fireEvent.press(screen.getByText('비용 추가'));
  await waitFor(async () => expect(await sv.repo.listExpenses(trip.id)).toMatchObject([{ amount: 1000, currency: 'JPY', rate: 9 }]));
  // 달러로도 적는다
  await fireEvent.press(screen.getByLabelText('통화 USD'));
  await fireEvent.changeText(screen.getByPlaceholderText('금액'), '10');
  await fireEvent.press(screen.getByText('비용 추가'));
  await waitFor(async () => expect((await sv.repo.listExpenses(trip.id))[1]).toMatchObject({ amount: 10, currency: 'USD', rate: 1400 }));
  // 합계: 원화 23,000 → 달러로 보기
  expect(await screen.findAllByText('23,000 KRW')).not.toHaveLength(0);
  await fireEvent.press(screen.getByLabelText('보기 USD'));
  expect(await screen.findAllByText('16.43 USD')).not.toHaveLength(0);
  expect(screen.getByText('오늘 환율 1 USD = 1,400 KRW')).toBeTruthy();
});

test('an expense keeps the rate of the day it was entered, even if the rate changes later', async () => {
  const sv = await makeTestServices({ fx: { latest: async () => ({ date: '2027-03-01', rates: { JPY: 9 } }) } });
  const trip = await sv.repo.createTrip({ name: 't', city: '오사카', startDate: '2027-03-01', endDate: '2027-03-02', baseCurrency: 'KRW' });
  await addExpense(sv, trip, { date: '2027-03-01', stopId: null, amount: 1000, currency: 'JPY', category: 'food', memo: '' });
  const later = (await sv.repo.getTrip(trip.id))!;
  await sv.repo.updateTrip({ ...later, rates: { JPY: 10 } });
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} />));
  expect(await screen.findAllByText('9,000 KRW')).not.toHaveLength(0);
});

test('a country or city name, typed in, picks the local currency', async () => {
  const { sv, trip } = await setup();
  await render(withServices(sv, <ExpensesScreen tripId={trip.id} onEditRates={noop} />));
  await fireEvent.changeText(await screen.findByPlaceholderText('나라·도시 이름 (예: 도쿄, 영국)'), '베트남 다낭');
  await fireEvent.press(screen.getByText('VND로 정하기'));
  await waitFor(async () => expect((await sv.repo.getTrip(trip.id))?.localCurrency).toBe('VND'));
});

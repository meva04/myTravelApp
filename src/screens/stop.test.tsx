import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { Stop } from '@/domain/types';
import { OfflineError } from '@/google/errors';
import { pickTime } from '@/testing/pickers';
import { makeTestServices, withServices } from '@/testing/services';

import { StopScreen } from './StopScreen';

async function setup(over: Partial<Stop> = {}) {
  const sv = await makeTestServices();
  const changed = jest.fn();
  sv.onItineraryChanged = changed;
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  await sv.repo.updateTrip({ ...trip, rates: { JPY: 9 } });
  const [day] = await sv.repo.listDays(trip.id);
  const stop: Stop = { id: 's1', dayId: day.id, order: 0, placeId: 'p1', name: '센소지', lat: 35, lng: 139, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '', ...over };
  await sv.repo.saveStops(day.id, [stop]);
  const ui = withServices(sv, <StopScreen stopId="s1" pickPhoto={async () => []} resolvePhoto={(u) => u} openUrl={() => {}} now={() => '2027-03-01T03:04:00.000Z'} />);
  return { sv, trip, ui, changed };
}

test('before arriving only the plan is shown; arriving opens the record section', async () => {
  const { sv, ui, changed } = await setup();
  await render(ui);
  expect(await screen.findByText('계획')).toBeTruthy();
  expect(screen.queryByText('내 기록')).toBeNull();
  expect(screen.queryByText('사진')).toBeNull();
  expect(screen.queryByPlaceholderText('여기서 있었던 일을 적어보세요')).toBeNull();
  await fireEvent.press(screen.getByText('네, 도착했어요'));
  expect(await screen.findByTestId('stamp')).toBeTruthy();
  expect(screen.getByText('내 기록')).toBeTruthy();
  expect(screen.getByPlaceholderText('여기서 있었던 일을 적어보세요')).toBeTruthy();
  expect(await sv.repo.getStop('s1')).toMatchObject({ arrivedAt: '2027-03-01T03:04:00.000Z', arrivalMethod: 'manual' });
  expect(screen.queryByText('네, 도착했어요')).toBeNull();
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
  await fireEvent.press(screen.getByText('다른 통화')); // 원화·현지·달러 말고
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

const details = { placeId: 'p1', address: '일본 도쿄도 다이토구 아사쿠사 2-3-1', photoUrls: ['https://g/photo1'], photoAuthors: ['Kim'] };
// 머리 사진은 옆으로 넘기는 줄이라 첫 장을 본다
const heroUri = () => (screen.getAllByTestId(/^hero-image:/)[0].props.testID as string).slice('hero-image:'.length);

test('the hero shows the name, the address and a Google photo with its credit', async () => {
  const { sv } = await setup();
  sv.places.details = async () => details;
  const opened: string[] = [];
  await render(withServices(sv, <StopScreen stopId="s1" pickPhoto={async () => []} resolvePhoto={(u) => `file:///${u}`} openUrl={(u) => void opened.push(u)} />));
  expect(await screen.findByText('일본 도쿄도 다이토구 아사쿠사 2-3-1')).toBeTruthy();
  expect(screen.getByText('센소지')).toBeTruthy();
  expect(screen.getByText('사진: Kim · Google')).toBeTruthy();
  expect(heroUri()).toBe('https://g/photo1');
  // 별점은 비용 때문에 보여 주지 않는다
  expect(screen.queryByText(/★ \d/)).toBeNull();
  await fireEvent.press(screen.getByText('Google 지도에서 보기 ↗'));
  expect(opened[0]).toContain('query_place_id=p1');
});

test('after visiting, my own photos replace the Google photo; a photo marked as cover is the only one shown', async () => {
  const { sv } = await setup({ arrivedAt: '2027-03-01T01:00:00.000Z', arrivalMethod: 'auto' });
  sv.places.details = async () => details;
  await sv.repo.addPhoto({ stopId: 's1', uri: 'a.jpg', takenAt: '2027-03-01T01:10:00.000Z', lat: null, lng: null });
  const b = await sv.repo.addPhoto({ stopId: 's1', uri: 'b.jpg', takenAt: '2027-03-01T01:20:00.000Z', lat: null, lng: null });
  await render(withServices(sv, <StopScreen stopId="s1" pickPhoto={async () => []} resolvePhoto={(u) => `file:///${u}`} openUrl={() => {}} />));
  await screen.findByText('일본 도쿄도 다이토구 아사쿠사 2-3-1');
  expect(heroUri()).toBe('file:///a.jpg'); // 내 사진 두 장이 슬라이드로 (첫 장부터)
  expect(screen.queryByText(/사진: Kim/)).toBeNull();
  await fireEvent.press(screen.getAllByText('대표로')[1]);
  await waitFor(async () => expect((await sv.repo.listPhotos('s1')).find((p) => p.id === b.id)?.cover).toBe(true));
  expect(await screen.findByText('★ 대표')).toBeTruthy();
  expect(heroUri()).toBe('file:///b.jpg');
});

test('offline, the hero shows the saved name and my records are still there', async () => {
  const { sv, ui } = await setup({ memo: '비가 왔다', arrivedAt: '2027-03-01T01:00:00.000Z', arrivalMethod: 'auto' });
  sv.places.details = async () => { throw new OfflineError(); };
  await render(ui);
  expect(await screen.findByText('센소지')).toBeTruthy();
  expect(screen.getByDisplayValue('비가 왔다')).toBeTruthy();
  expect(screen.getByTestId('stamp')).toBeTruthy();
});

test('memo edits are saved', async () => {
  const { sv, ui } = await setup({ arrivedAt: '2027-03-01T01:00:00.000Z', arrivalMethod: 'auto' });
  await render(ui);
  const memo = await screen.findByPlaceholderText('여기서 있었던 일을 적어보세요');
  await fireEvent.changeText(memo, '사람이 많았다');
  await fireEvent(memo, 'blur');
  expect((await sv.repo.getStop('s1'))?.memo).toBe('사람이 많았다');
});

test('pressing 도착 on a stale screen keeps an arrival recorded in the background', async () => {
  const { sv, ui } = await setup();
  await render(ui);
  await screen.findByText('네, 도착했어요');
  await sv.repo.markStopArrived('s1', '2027-03-01T01:00:00.000Z', 'auto'); // 화면이 열린 사이 알림으로 답함
  await fireEvent.press(screen.getByText('네, 도착했어요'));
  expect(await sv.repo.getStop('s1')).toMatchObject({ arrivedAt: '2027-03-01T01:00:00.000Z', arrivalMethod: 'auto' });
  expect(await screen.findByTestId('stamp')).toBeTruthy();
});

test('editing the plan note on a stale screen does not erase a background arrival', async () => {
  const { sv, ui } = await setup();
  await render(ui);
  const note = await screen.findByPlaceholderText(/할 일 추가/);
  await sv.repo.markStopArrived('s1', '2027-03-01T01:00:00.000Z', 'auto');
  await fireEvent.changeText(note, '좋았다');
  await fireEvent(note, 'submitEditing');
  await waitFor(async () => expect(await sv.repo.getStop('s1')).toMatchObject({ planNote: '[ ] 좋았다', arrivedAt: '2027-03-01T01:00:00.000Z' }));
});

test('an expense in a currency without a rate is shown next to the subtotal', async () => {
  const { sv, trip, ui } = await setup();
  await sv.repo.addExpense({ tripId: trip.id, date: '2027-03-01', stopId: 's1', amount: 20, currency: 'EUR', category: 'etc', memo: '' });
  await render(ui);
  expect(await screen.findByText(/환산 안 됨: 20 EUR/)).toBeTruthy();
});

test('the plan is a checklist: items can be added, checked off and removed', async () => {
  const { sv, ui } = await setup({ memo: '비가 왔다' });
  await render(ui);
  // 한 글자 칠 때마다 항목이 생기지 않고, 다 적고 완료(줄바꿈)를 눌러야 항목이 된다
  const input = await screen.findByPlaceholderText(/할 일 추가/);
  await fireEvent.changeText(input, '초');
  expect(screen.queryByRole('checkbox', { name: '초' })).toBeNull();
  await fireEvent.changeText(input, '초밥 예약 12시');
  await fireEvent(input, 'submitEditing');
  await fireEvent.changeText(screen.getByPlaceholderText(/할 일 추가/), '환전');
  await fireEvent(screen.getByPlaceholderText(/할 일 추가/), 'blur');
  await waitFor(async () => expect((await sv.repo.getStop('s1'))?.planNote).toBe('[ ] 초밥 예약 12시\n[ ] 환전'));
  await fireEvent.press(screen.getByRole('checkbox', { name: '초밥 예약 12시' }));
  await waitFor(async () => expect((await sv.repo.getStop('s1'))?.planNote).toBe('[x] 초밥 예약 12시\n[ ] 환전'));
  await fireEvent.press(screen.getByLabelText('환전 삭제'));
  await waitFor(async () => expect(await sv.repo.getStop('s1')).toMatchObject({ planNote: '[x] 초밥 예약 12시', memo: '비가 왔다' }));
});

const open = (sv: Awaited<ReturnType<typeof setup>>['sv'], prompt: 'arrival' | 'overdue' | 'reschedule' | 'skip', onRemoved = () => {}) =>
  withServices(sv, <StopScreen stopId="s1" prompt={prompt} onRemoved={onRemoved} pickPhoto={async () => []} resolvePhoto={(u) => u} openUrl={() => {}} now={() => '2027-03-01T03:04:00.000Z'} />);

test('opened from the arrival alert, it asks and "가는 중" just closes the question', async () => {
  const { sv } = await setup();
  await render(open(sv, 'arrival'));
  expect(await screen.findByText('센소지에 도착하셨나요?')).toBeTruthy();
  await fireEvent.press(screen.getByText('아직이에요, 가는 중이에요'));
  expect(screen.queryByText('센소지에 도착하셨나요?')).toBeNull();
  expect((await sv.repo.getStop('s1'))?.arrivedAt).toBeNull();
});

test('opened from the overdue alert, "네" lets you change the time or move it to another day', async () => {
  const { sv } = await setup({ plannedTime: '10:00' });
  await render(open(sv, 'overdue'));
  expect(await screen.findByText('센소지에 도착했어야 할 시간인데 아직이네요')).toBeTruthy();
  await fireEvent.press(screen.getByText('네'));
  expect(await screen.findByText('일정 변경')).toBeTruthy();
  await pickTime('예정 시간', '15:30'); // 일정 변경 카드의 시간 선택기
  await waitFor(async () => expect((await sv.repo.getStop('s1'))?.plannedTime).toBe('15:30'));
  await fireEvent.press(screen.getAllByText('확인')[0]);
  expect(screen.queryByText('일정 변경')).toBeNull();
});

test('"못 갈 거 같아요" offers to hide the place from the plan', async () => {
  const { sv } = await setup({ plannedTime: '10:00' });
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === '숨기기')?.onPress?.());
  await render(open(sv, 'overdue'));
  await fireEvent.press(await screen.findByText('이번 여행에서는 못 갈 거 같아요'));
  expect(await screen.findByText('계획에서 숨긴 장소예요')).toBeTruthy();
  expect((await sv.repo.getStop('s1'))?.skipped).toBe(true);
  await fireEvent.press(screen.getByText('다시 일정에 넣기'));
  expect(await screen.findByText('계획')).toBeTruthy();
  expect((await sv.repo.getStop('s1'))?.skipped).toBe(false);
});

test('"못 갈 거 같아요" can also delete the place', async () => {
  const { sv } = await setup();
  const removed = jest.fn();
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  await render(open(sv, 'skip', removed));
  await screen.findByText('센소지');
  await waitFor(() => expect(removed).toHaveBeenCalled());
  expect(await sv.repo.getStop('s1')).toBeNull();
});

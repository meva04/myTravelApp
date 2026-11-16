import { fireEvent, render, screen } from '@testing-library/react-native';

import { DateRangeField, monthCells, nightsBetween, tapRange } from './DateRangeField';

test('the first tap picks check-in, the next later tap picks check-out; an earlier tap starts over', () => {
  expect(tapRange({}, '2027-03-05')).toEqual({ from: '2027-03-05', to: undefined });
  expect(tapRange({ from: '2027-03-05' }, '2027-03-08')).toEqual({ from: '2027-03-05', to: '2027-03-08' });
  expect(tapRange({ from: '2027-03-05' }, '2027-03-02')).toEqual({ from: '2027-03-02', to: undefined });
  expect(tapRange({ from: '2027-03-05', to: '2027-03-08' }, '2027-03-20')).toEqual({ from: '2027-03-20', to: undefined });
  expect(nightsBetween('2027-03-05', '2027-03-08')).toBe(3);
  // 2027년 3월 1일은 월요일: 앞에 빈칸 하나
  expect(monthCells(2027, 2).slice(0, 2)).toEqual([null, '2027-03-01']);
});

test('one calendar picks both dates, and can go to any month or year (past records, bookings a year ahead)', async () => {
  const change = jest.fn();
  await render(<DateRangeField label="체크인 → 체크아웃" openAt="2027-03-01" onChange={change} />);
  await fireEvent.press(screen.getByLabelText('체크인 → 체크아웃'));
  expect(screen.getByText('2027년 3월')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('다음 해'));
  await fireEvent.press(screen.getByLabelText('이전 달'));
  expect(screen.getByText('2028년 2월')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('2028-02-27'));
  await fireEvent.press(screen.getByLabelText('다음 달'));
  await fireEvent.press(screen.getByLabelText('2028-03-02'));
  await fireEvent.press(screen.getByText('선택 완료'));
  expect(change).toHaveBeenCalledWith('2028-02-27', '2028-03-02');
});

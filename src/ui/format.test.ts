import { formatDistance, isDate } from './format';

test('isDate accepts real dates and rejects impossible ones', () => {
  expect(isDate('2027-03-01')).toBe(true);
  expect(isDate('2027-02-31')).toBe(false);
  expect(isDate('2027-13-01')).toBe(false);
  expect(isDate('27-3-1')).toBe(false);
});

test('formatDistance shows metres under 1km and km above', () => {
  expect(formatDistance(194)).toBe('194m');
  expect(formatDistance(756.4)).toBe('756m');
  expect(formatDistance(1100)).toBe('1.1km');
  expect(formatDistance(12345)).toBe('12.3km');
});

import { isDate } from './format';

test('isDate accepts real dates and rejects impossible ones', () => {
  expect(isDate('2027-03-01')).toBe(true);
  expect(isDate('2027-02-31')).toBe(false);
  expect(isDate('2027-13-01')).toBe(false);
  expect(isDate('27-3-1')).toBe(false);
});

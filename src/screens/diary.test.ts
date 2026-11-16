import { mosaicRows } from './DiaryDay';

test('diary photos mix big, medium and small rows; the last row fits what is left', () => {
  const rows = (n: number) => mosaicRows(Array.from({ length: n }, (_, i) => i)).map((r) => r.weights);
  expect(rows(1)).toEqual([[1]]);
  expect(rows(3)).toEqual([[1], [2, 1]]);
  expect(rows(6)).toEqual([[1], [2, 1], [1, 1, 1]]);
  expect(rows(8)).toEqual([[1], [2, 1], [1, 1, 1], [1, 1]]);
  expect(rows(5)).toEqual([[1], [2, 1], [1, 1]]);
});

import { drawnLines, easeOut } from './drawRoute';

const a = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
];
const b = [
  { lat: 0, lng: 1 },
  { lat: 0, lng: 3 },
];

test('at 0 nothing is drawn and at 1 every leg is whole', () => {
  expect(drawnLines([a, b], 0)).toEqual([[], []]);
  expect(drawnLines([a, b], 1)).toEqual([a, b]);
});

test('legs are drawn one after another along the whole day', () => {
  // 전체 길이 3 중 1/3: 첫 구간만 다 그려지고 둘째는 아직
  const [first, second] = drawnLines([a, b], 1 / 3);
  expect(first).toEqual(a);
  expect(second).toEqual([]);
});

test('the leg being drawn ends at an interpolated point on the line', () => {
  const [first, second] = drawnLines([a, b], 0.5); // 길이 1.5 → 둘째 구간 0.5 만큼
  expect(first).toEqual(a);
  expect(second).toHaveLength(2);
  expect(second[1].lng).toBeCloseTo(1.5);
});

test('easing starts fast and ends at 1', () => {
  expect(easeOut(0)).toBe(0);
  expect(easeOut(0.5)).toBeGreaterThan(0.5);
  expect(easeOut(1)).toBe(1);
  expect(easeOut(2)).toBe(1);
});

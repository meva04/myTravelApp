import { drawnLines, easeOut, roundCorners, simplifyLine, smoothTolerance } from './drawRoute';

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

test('tiny zigzags along a road are removed but real turns stay', () => {
  // 동쪽으로 가다 1m 남짓 들쭉날쭉 → 북쪽으로 꺾는다 (경도 0.001 ≈ 111m)
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0.00001, lng: 0.001 },
    { lat: -0.00001, lng: 0.002 },
    { lat: 0, lng: 0.003 },
    { lat: 0.003, lng: 0.003 },
  ];
  expect(simplifyLine(line)).toEqual([line[0], line[3], line[4]]);
});

test('rounding keeps both ends on the places and softens the corner', () => {
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
  ];
  const r = roundCorners(line);
  expect(r[0]).toEqual(line[0]);
  expect(r[r.length - 1]).toEqual(line[2]);
  expect(r).not.toContainEqual(line[1]);
});

test('smoothing follows the road when zoomed in and gets looser when zoomed out', () => {
  const street = smoothTolerance(0.005); // 골목이 보이는 확대
  const city = smoothTolerance(0.08); // 도시 전체
  const country = smoothTolerance(3); // 나라 사이 이동
  expect(street).toBeLessThanOrEqual(5);
  expect(city).toBeGreaterThan(street);
  expect(country).toBeGreaterThan(city * 10);
  // 조금 움직인 정도로는 같은 값 (다시 계산하지 않는다)
  expect(smoothTolerance(0.07)).toBe(smoothTolerance(0.08));
});

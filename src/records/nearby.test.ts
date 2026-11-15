import { dayWindow, distanceMeters, nearbyPhotos, type LibraryPhoto } from './nearby';

const bigBen = { lat: 51.5007, lng: -0.1246 };
const photo = (assetId: string, takenAt: number, location: LibraryPhoto['location']): LibraryPhoto => ({ assetId, uri: `ph://${assetId}`, takenAt, location });

test('distanceMeters measures real distance on the ground', () => {
  // 빅 벤 → 런던 아이 는 약 400m
  const d = distanceMeters(bigBen, { lat: 51.5033, lng: -0.1196 });
  expect(d).toBeGreaterThan(350);
  expect(d).toBeLessThan(500);
});

test('nearbyPhotos keeps photos taken within 500m, in time order', () => {
  const photos = [
    photo('late', 3, { lat: 51.5009, lng: -0.1240 }),
    photo('far', 1, { lat: 51.5081, lng: -0.0759 }), // 타워 브리지, 3km 이상
    photo('noGps', 2, null),
    photo('early', 0, bigBen),
  ];
  expect(nearbyPhotos(photos, bigBen).map((p) => p.assetId)).toEqual(['early', 'late']);
});

test('dayWindow covers the whole local day at the place, wherever the phone is', () => {
  const hour = 60 * 60 * 1000;
  // 런던(경도 0): 3월 1일 23:30 런던 시각 = 한국 기준으로는 3월 2일이지만 포함되어야 한다
  const london = dayWindow('2027-03-01', -0.12);
  expect(Date.UTC(2027, 2, 1, 23, 30)).toBeLessThan(london.to);
  expect(Date.UTC(2027, 2, 1, 0, 30)).toBeGreaterThan(london.from);
  // 도쿄(경도 139.8, UTC+9): 3월 1일 00:30 도쿄 = 2월 28일 15:30 UTC
  const tokyo = dayWindow('2027-03-01', 139.8);
  expect(Date.UTC(2027, 1, 28, 15, 30)).toBeGreaterThan(tokyo.from);
  expect(Date.UTC(2027, 2, 2, 15, 30)).toBeGreaterThan(tokyo.to); // 다음 날 00:30 도쿄 는 빠진다
  expect(tokyo.to - tokyo.from).toBe(30 * hour);
});

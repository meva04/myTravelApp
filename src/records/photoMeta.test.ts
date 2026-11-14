import { photoMeta } from './photoMeta';

const NOW = '2027-03-01T05:00:00.000Z';

test('reads capture time and position from exif', () => {
  const m = photoMeta({ DateTimeOriginal: '2027:03:01 10:20:30', GPSLatitude: 35.5, GPSLatitudeRef: 'N', GPSLongitude: 139.7, GPSLongitudeRef: 'E' }, NOW);
  expect(m.takenAt).toBe(new Date(2027, 2, 1, 10, 20, 30).toISOString());
  expect(m.lat).toBe(35.5);
  expect(m.lng).toBe(139.7);
});

test('south and west references make coordinates negative', () => {
  const m = photoMeta({ GPSLatitude: 33.9, GPSLatitudeRef: 'S', GPSLongitude: 70.6, GPSLongitudeRef: 'W' }, NOW);
  expect([m.lat, m.lng]).toEqual([-33.9, -70.6]);
});

test('missing or malformed exif falls back to now and no position', () => {
  expect(photoMeta(null, NOW)).toEqual({ takenAt: NOW, lat: null, lng: null });
  expect(photoMeta({ DateTimeOriginal: 'garbage', GPSLatitude: 'x' }, NOW)).toEqual({ takenAt: NOW, lat: null, lng: null });
});

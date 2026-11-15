import type { Stop } from '@/domain/types';

import { directionsUrl } from './directions';

const stop = (id: string, lat: number, lng: number, placeId: string | null): Stop => ({
  id, dayId: 'd', order: 0, placeId, name: id, lat, lng, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '',
});
const bigBen = stop('빅 벤', 51.5007, -0.1246, 'ChIJ2dGMjMMEdkgRqVqkuXQkj7c');
const eye = stop('런던 아이', 51.5033, -0.1196, null);

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

test('walking and driving open turn-by-turn navigation in Google Maps', () => {
  const walk = directionsUrl(bigBen, eye, 'walk');
  expect(walk.startsWith('https://www.google.com/maps/dir/?')).toBe(true);
  expect(params(walk)).toEqual({
    api: '1',
    origin: '51.5007,-0.1246',
    destination: '51.5033,-0.1196',
    travelmode: 'walking',
    origin_place_id: 'ChIJ2dGMjMMEdkgRqVqkuXQkj7c',
    dir_action: 'navigate',
  });
  expect(params(directionsUrl(bigBen, eye, 'drive'))).toMatchObject({ travelmode: 'driving', dir_action: 'navigate' });
});

test('transit shows the transit route options instead of starting navigation', () => {
  const p = params(directionsUrl(eye, bigBen, 'transit'));
  expect(p).toMatchObject({ travelmode: 'transit', destination_place_id: 'ChIJ2dGMjMMEdkgRqVqkuXQkj7c' });
  expect(p.dir_action).toBeUndefined();
});

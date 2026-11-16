import type { Stop } from '@/domain/types';

import { groupPins, pinLabel } from './points';

const s = (id: string, lat: number, lng: number, arrivedAt: string | null = null): Stop => ({
  id, dayId: 'd', order: 0, placeId: null, name: id, lat, lng, plannedTime: null, arrivedAt, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '',
});

test('places at the same spot share one pin labelled with all their numbers', () => {
  const pins = groupPins([s('호텔', 35.69, 139.7), s('A', 35.71, 139.79), s('호텔2', 35.69001, 139.70001)]);
  expect(pins.map(pinLabel)).toEqual(['1·3', '2']);
  expect(pinLabel(groupPins([s('a', 1, 1, 'x'), s('b', 1, 1, 'y')])[0])).toBe('1·2');
});

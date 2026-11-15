import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Stop } from '@/domain/types';
import type { LibraryPhoto } from '@/records/nearby';
import { makeTestServices, withServices } from '@/testing/services';

import { NearbyPhotosScreen } from './NearbyPhotosScreen';
import { TripHomeScreen } from './TripHomeScreen';

const bigBen = { lat: 51.5007, lng: -0.1246 };
const at = (h: number, m: number) => new Date(2027, 2, 1, h, m).getTime();
const photo = (assetId: string, takenAt: number, location: LibraryPhoto['location']): LibraryPhoto => ({ assetId, uri: `file:///${assetId}.jpg`, takenAt, location });

async function setup(over: Partial<Stop> = {}) {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  const stop: Stop = { id: 's1', dayId: day.id, order: 0, placeId: null, name: '빅 벤', ...bigBen, plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '', ...over };
  await sv.repo.saveStops(day.id, [stop]);
  return { sv, trip, day };
}

const library = [
  photo('near1', at(10, 5), { lat: 51.5009, lng: -0.124 }),
  photo('far', at(11, 0), { lat: 51.5081, lng: -0.0759 }),
  photo('near2', at(10, 20), bigBen),
];
const importPhoto = async (p: LibraryPhoto) => ({ uri: `${p.assetId}.jpg`, takenAt: new Date(p.takenAt).toISOString(), lat: p.location?.lat ?? null, lng: p.location?.lng ?? null, assetId: p.assetId });

test('only photos taken near the place that day are offered, and the picked ones are archived', async () => {
  const { sv, day } = await setup();
  const find = jest.fn(async () => library);
  const done = jest.fn();
  await render(withServices(sv, <NearbyPhotosScreen stopId="s1" findPhotos={find} importPhoto={importPhoto} onDone={done} />));
  expect(await screen.findByText('근처 2장')).toBeTruthy();
  expect(find).toHaveBeenCalledWith(day.date, bigBen.lng);
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  await fireEvent.press(screen.getByLabelText('사진 1'));
  await fireEvent.press(screen.getByLabelText('사진 2'));
  await fireEvent.press(await screen.findByText('2장 보관하기'));
  expect(done).toHaveBeenCalled();
  expect((await sv.repo.listPhotos('s1')).map((p) => [p.assetId, p.lat])).toEqual([['near1', 51.5009], ['near2', bigBen.lat]]);
});

test('the whole day can be shown, and photos already archived cannot be picked again', async () => {
  const { sv } = await setup();
  await sv.repo.addPhoto({ stopId: 's1', uri: 'x.jpg', takenAt: new Date(at(10, 5)).toISOString(), lat: null, lng: null, assetId: 'near1' });
  await render(withServices(sv, <NearbyPhotosScreen stopId="s1" findPhotos={async () => library} importPhoto={importPhoto} onDone={() => {}} />));
  await fireEvent.press(await screen.findByText('그날 전체 3장'));
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  await fireEvent.press(screen.getByLabelText('사진 1 보관됨'));
  expect(screen.queryByText(/장 보관하기/)).toBeNull();
});

test('a refused photo library says how to allow it', async () => {
  const { sv } = await setup();
  await render(withServices(sv, <NearbyPhotosScreen stopId="s1" findPhotos={async () => 'denied'} importPhoto={importPhoto} onDone={() => {}} />));
  expect(await screen.findByText(/사진첩 접근이 꺼져 있어요/)).toBeTruthy();
});

test('the plan note shows under the place in the itinerary', async () => {
  const { sv, trip } = await setup({ planNote: '초밥 / 예약완료' });
  const noop = () => {};
  await render(withServices(sv, <TripHomeScreen tripId={trip.id} onAddStop={noop} onOpenMap={noop} onOpenStop={noop} onExpenses={noop} onSettings={noop} />));
  expect(await screen.findByText('초밥 / 예약완료')).toBeTruthy();
});

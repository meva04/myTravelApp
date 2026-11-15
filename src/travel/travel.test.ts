import { bookingStops } from '@/domain/bookings';
import type { Booking } from '@/domain/types';

import { makeFlights, splitLocal } from './flights';
import { coordsFromUrl, parseTakeoutCsv, parseTakeoutJson } from './savedPlaces';

const hotel = { name: '호텔 그레이스리', placeId: 'h1', lat: 35.69, lng: 139.7 };

test('a hotel stay ends the check-in day, starts the check-out day, and starts and ends the nights between', () => {
  const b: Booking = { id: 'b', tripId: 't', kind: 'lodging', title: '호텔', place: hotel, checkIn: '2027-03-01', checkOut: '2027-03-03', checkInTime: '15:00', checkOutTime: '11:00' };
  const out = bookingStops(b, ['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04']);
  expect(out.map((s) => [s.date, s.position, s.time])).toEqual([
    ['2027-03-01', 'end', '15:00'],
    ['2027-03-02', 'start', null],
    ['2027-03-02', 'end', null],
    ['2027-03-03', 'start', '11:00'],
  ]);
});

test('a flight adds its departure and arrival airports on their days, at their times', () => {
  const b: Booking = {
    id: 'b', tripId: 't', kind: 'flight', title: 'KE703', seat: '32A',
    from: { name: '인천 ICN', placeId: null, lat: 37.46, lng: 126.44 }, to: { name: '도쿄 NRT', placeId: null, lat: 35.77, lng: 140.39 },
    departDate: '2027-02-28', departTime: '09:00', arriveDate: '2027-03-01', arriveTime: '11:20',
  };
  const out = bookingStops(b, ['2027-03-01', '2027-03-02']);
  expect(out).toHaveLength(1); // 여행 첫날 전 출발은 일정 밖
  expect(out[0]).toMatchObject({ date: '2027-03-01', time: '11:20', kind: 'airport', position: 'time' });
});

test('flight lookup reads airports, local times, gate and aircraft', async () => {
  expect(splitLocal('2027-03-01 10:05+09:00')).toEqual(['2027-03-01', '10:05']);
  const fetchFn = jest.fn(async () => ({
    ok: true, status: 200,
    json: async () => [{
      number: 'KE 703', status: 'Expected', airline: { name: 'Korean Air' }, aircraft: { model: 'Boeing 787-9' },
      departure: { airport: { iata: 'ICN', municipalityName: 'Seoul', location: { lat: 37.46, lon: 126.44 } }, scheduledTime: { local: '2027-03-01 09:00+09:00' }, terminal: '2', gate: '250' },
      arrival: { airport: { iata: 'NRT', municipalityName: 'Tokyo', location: { lat: 35.77, lon: 140.39 } }, scheduledTime: { local: '2027-03-01 11:20+09:00' } },
    }],
  }));
  const info = await makeFlights(fetchFn as unknown as typeof fetch, 'K').lookup('ke 703', '2027-03-01');
  expect(info).toMatchObject({ title: 'KE703', carrier: 'Korean Air', vehicle: 'Boeing 787-9', gate: '250', terminal: '2', departTime: '09:00', arriveTime: '11:20' });
  expect(info?.from).toMatchObject({ code: 'ICN', lat: 37.46, lng: 126.44 });
  await expect(makeFlights(fetchFn as unknown as typeof fetch, '').lookup('KE703', '2027-03-01')).rejects.toThrow('no flight api key');
});

test('Google Takeout saved places are read from the GeoJSON and from list CSVs', () => {
  const json = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { geometry: { coordinates: [139.79, 35.71] }, properties: { google_maps_url: 'http://maps.google.com/?cid=1', location: { name: '센소지', address: '도쿄 다이토구' } } },
      { geometry: { coordinates: [0, 0] }, properties: { google_maps_url: 'https://www.google.com/maps/search/?q=35.66,139.70', location: { name: '시부야 스카이' } } },
    ],
  });
  expect(parseTakeoutJson(json)).toEqual([
    { name: '센소지', address: '도쿄 다이토구', lat: 35.71, lng: 139.79, note: '', url: 'http://maps.google.com/?cid=1' },
    { name: '시부야 스카이', address: '', lat: 35.66, lng: 139.7, note: '', url: 'https://www.google.com/maps/search/?q=35.66,139.70' },
  ]);
  const csv = 'Title,Note,URL,Tags,Comment\n"이치란, 신주쿠",꼭 가기,"https://www.google.com/maps/place/x/@35.69,139.70,17z",,\n후운지,,https://www.google.com/maps/place/y,,맛집\n';
  expect(parseTakeoutCsv(csv)).toEqual([
    { name: '이치란, 신주쿠', address: '', lat: 35.69, lng: 139.7, note: '꼭 가기', url: 'https://www.google.com/maps/place/x/@35.69,139.70,17z' },
    { name: '후운지', address: '', lat: null, lng: null, note: '맛집', url: 'https://www.google.com/maps/place/y' },
  ]);
  expect(coordsFromUrl('https://www.google.com/maps/place/a/data=!3d51.5!4d-0.12')).toEqual([51.5, -0.12]);
});

test('seats: the aircraft type picks the cabin layout, and a seat is window, aisle or middle', () => {
  const { aircraftLayout, parseSeat, seatSide } = jest.requireActual('@/domain/seats') as typeof import('@/domain/seats');
  expect(parseSeat('32a')).toEqual({ row: 32, letter: 'A' });
  expect(parseSeat('뭐')).toBeNull();
  const wide = aircraftLayout('Boeing 787-9');
  expect(wide.blocks.map((b) => b.join(''))).toEqual(['ABC', 'DEF', 'HJK']);
  expect(seatSide(wide, 'A')).toBe('window');
  expect(seatSide(wide, 'C')).toBe('aisle');
  expect(seatSide(wide, 'E')).toBe('middle');
  expect(aircraftLayout('Airbus A321neo').name).toBe('협동체 (3-3)');
  expect(aircraftLayout('Boeing 777-300ER').blocks[1]).toHaveLength(4);
});

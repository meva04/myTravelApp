import { bookingStops } from '@/domain/bookings';
import type { Booking } from '@/domain/types';

import { airlineOf } from './airlines';
import { makeFlights } from './flights';

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

test('a flight number shows its airline from a built-in table', () => {
  expect(airlineOf('ke 703')).toEqual({ code: 'KE', name: '대한항공' });
  expect(airlineOf('7C1101')?.name).toBe('제주항공');
  expect(airlineOf('XX1')).toBeNull();
});

test('today at Incheon: departures give terminal, check-in counters, gate and delays (free public data)', async () => {
  const urls: string[] = [];
  const fetchFn = jest.fn(async (url: string) => {
    urls.push(url);
    const dep = url.includes('getPassengerDeparturesOdp');
    return {
      ok: true, status: 200,
      json: async () => ({
        response: { body: { items: dep ? [{ flightId: 'KE703', airline: '대한항공', airport: '나리타', airportCode: 'NRT', scheduleDateTime: '0900', estimatedDateTime: '0935', terminalId: 'P03', gatenumber: '250', chkinrange: 'E01-E06', remark: '지연' }] : [] } },
      }),
    };
  });
  const info = await makeFlights(fetchFn as unknown as typeof fetch, 'K').today('ke 703');
  expect(info).toEqual({
    direction: 'departure', carrier: '대한항공', otherAirport: '나리타', otherAirportCode: 'NRT', scheduled: '09:00', estimated: '09:35',
    terminal: 'T2', gate: '250', checkin: 'E01-E06', status: '지연',
  });
  expect(urls[0]).toContain('StatusOfPassengerFlightsOdp/getPassengerDeparturesOdp?serviceKey=K&flight_id=KE703&type=json');
  await expect(makeFlights(fetchFn as unknown as typeof fetch, '').today('KE703')).rejects.toThrow('no flight api key');
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

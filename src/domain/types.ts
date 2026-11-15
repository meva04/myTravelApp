export type Id = string;
export type LatLng = { lat: number; lng: number };
export type TravelMode = 'walk' | 'transit' | 'drive';
export type Category = 'food' | 'transport' | 'shopping' | 'ticket' | 'lodging' | 'etc';
export const CATEGORIES: Category[] = ['food', 'transport', 'shopping', 'ticket', 'lodging', 'etc'];

export type Trip = {
  id: Id;
  name: string;
  city: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;
  baseCurrency: string;
  /** rates[cur] = 1 cur 가 기준 통화로 얼마인지 */
  rates: Record<string, number>;
};

export type Day = { id: Id; tripId: Id; date: string };

export type Stop = {
  id: Id;
  dayId: Id;
  order: number;
  placeId: string | null;
  name: string;
  lat: number;
  lng: number;
  plannedTime: string | null; // 'HH:mm'
  arrivedAt: string | null; // ISO
  arrivalMethod: 'auto' | 'manual' | null;
  /** 방문 후 기록: 있었던 일 */
  memo: string;
  /** 계획 단계 메모: 해야 할 것, 기억할 것. 일정 목록에 보인다. */
  planNote: string;
  /** 이동 메모: 이 장소를 떠나 다음 장소로 가는 길에 할 일·기억할 것. 일정에서 두 장소 사이에 보인다. */
  legNote: string;
  /** 이번 여행에서 못 가게 되어 계획에서 숨긴 장소. 경로·지도·도착 감지에서 빠진다. */
  skipped: boolean;
  /** 장소 종류 (아이콘). 구글 장소 유형에서 정한다. 모르면 null. */
  kind?: PlaceKind | null;
  /** 숙소·교통편 예약에서 만들어진 장소면 그 예약 id. 예약을 고치면 함께 바뀐다. */
  bookingId?: Id | null;
};

export type PlaceKind = 'food' | 'cafe' | 'bar' | 'sight' | 'museum' | 'park' | 'shop' | 'lodging' | 'airport' | 'station' | 'port' | 'other';

export type RouteOption = {
  id: Id;
  kind: 'default';
  polyline: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
};

export type Leg = {
  id: Id;
  fromStopId: Id;
  toStopId: Id;
  mode: TravelMode;
  options: RouteOption[];
  selectedOptionId: Id | null;
};

export type Photo = {
  id: Id;
  /** 장소 사진이면 그 장소 (이동 메모 사진이면 null) */
  stopId: Id | null;
  uri: string;
  takenAt: string;
  lat: number | null;
  lng: number | null;
  /** 사진첩에서 가져온 사진이면 그 사진의 id. 같은 사진을 두 번 보관하지 않으려고 둔다. */
  assetId?: string | null;
  /** 장소 화면 머리(히어로)에 쓸 사진으로 지정했는지 */
  cover?: boolean;
  /** 이동 메모에 붙인 사진이면 그 메모 id (장소 사진 목록에는 나오지 않는다) */
  noteId?: Id | null;
};

/**
 * 이동 메모: 가는 길의 할 일 하나. 장소와 같은 급의 카드로 그날 일정 안에 놓이고 (순서는 장소와 같은 줄을 쓴다),
 * 장소처럼 기록·사진·비용을 붙일 수 있다.
 */
export type Note = {
  id: Id;
  dayId: Id;
  /** 그날 일정 안의 자리. 장소의 order 와 같은 줄에서 센다. */
  order: number;
  text: string;
  done: boolean;
  /** 기록: 가는 길에 있었던 일 */
  memo: string;
};

export type Expense = {
  id: Id;
  tripId: Id;
  date: string;
  stopId: Id | null;
  amount: number;
  currency: string;
  category: Category;
  memo: string;
  /** 이동 메모에 붙인 비용이면 그 메모 id */
  noteId?: Id | null;
};

/** 그날 일정의 한 칸: 장소 또는 이동 메모 */
export type SeqItem = { kind: 'stop'; id: Id } | { kind: 'note'; id: Id };

export type BookingKind = 'lodging' | 'flight' | 'train' | 'ship' | 'bus';
export const TRANSPORT_KINDS: BookingKind[] = ['flight', 'train', 'ship', 'bus'];

/** 공항·역·항구·숙소 같은 예약의 장소 */
export type BookingPlace = { name: string; placeId: string | null; lat: number; lng: number; code?: string; address?: string };

/** 숙소·교통편 예약. 저장하면 날짜에 맞게 일정에 장소로 들어간다. */
export type Booking = {
  id: Id;
  tripId: Id;
  kind: BookingKind;
  /** 숙소 이름, 또는 편명·열차번호 */
  title: string;
  confirmation?: string;
  // 숙소
  place?: BookingPlace;
  checkIn?: string; // 'YYYY-MM-DD'
  checkOut?: string;
  checkInTime?: string; // 'HH:mm'
  checkOutTime?: string;
  // 교통편
  carrier?: string;
  from?: BookingPlace;
  to?: BookingPlace;
  departDate?: string;
  departTime?: string;
  arriveDate?: string;
  arriveTime?: string;
  terminal?: string;
  gate?: string;
  /** 좌석 (예: 32A, 12D) */
  seat?: string;
  /** 기차 호차 */
  car?: string;
  /** 기종·열차 종류·배 이름 (예: Boeing 787-9, KTX-산천) */
  vehicle?: string;
  /** 체크인 카운터 (예: K11-K16) */
  checkin?: string;
  /** 당일 운항 상태 (지연, 탑승중, 결항 …) */
  status?: string;
  /** 바뀐 출발 시각 'HH:mm' (지연 등) */
  estimated?: string;
  /** 당일 운항 정보를 마지막으로 확인한 시각 (ISO) */
  checkedAt?: string;
};

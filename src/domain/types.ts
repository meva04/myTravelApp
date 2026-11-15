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
};

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
  stopId: Id;
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
 * 이동 메모: 한 장소를 떠나 다음 장소로 가는 길의 할 일 하나. 일정에서 두 장소 사이에 카드로 보이고,
 * 장소처럼 기록·사진·비용을 붙일 수 있다.
 */
export type Note = {
  id: Id;
  /** 출발하는 장소 */
  stopId: Id;
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

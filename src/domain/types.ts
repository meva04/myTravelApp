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
  memo: string;
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
};

import type { Id, Leg, Stop } from './types';

const renumber = (stops: Stop[]): Stop[] => stops.map((s, i) => (s.order === i ? s : { ...s, order: i }));

export function reorder(stops: Stop[], from: number, to: number): Stop[] {
  if (from < 0 || from >= stops.length || to < 0 || to >= stops.length) return stops;
  const out = [...stops];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return renumber(out);
}

export function removeStop(stops: Stop[], id: Id): Stop[] {
  return renumber(stops.filter((s) => s.id !== id));
}

/** 방문지를 다른 날의 맨 끝으로 옮긴다. */
export function moveToDay(stop: Stop, fromStops: Stop[], toStops: Stop[], toDayId: Id): { from: Stop[]; to: Stop[] } {
  return {
    from: renumber(fromStops.filter((s) => s.id !== stop.id)),
    to: renumber([...toStops, { ...stop, dayId: toDayId }]),
  };
}

/** 이웃한 방문지 쌍마다 구간 하나. 이미 있는 쌍은 받아둔 경로를 그대로 둔다. 숨긴 장소는 건너뛴다. */
export function syncLegs(all: Stop[], legs: Leg[], newId: () => Id): Leg[] {
  const stops = all.filter((s) => !s.skipped);
  const byPair = new Map(legs.map((l) => [`${l.fromStopId}>${l.toStopId}`, l]));
  const out: Leg[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const from = stops[i].id;
    const to = stops[i + 1].id;
    out.push(
      byPair.get(`${from}>${to}`) ?? { id: newId(), fromStopId: from, toStopId: to, mode: 'walk', options: [], selectedOptionId: null },
    );
  }
  return out;
}

/** 보이는 방문지의 새 순서에 숨긴 방문지를 뒤에 붙여 그날 전체 목록을 만든다. */
export function withHidden(visible: Stop[], all: Stop[]): Stop[] {
  const hidden = all.filter((s) => s.skipped && !visible.some((v) => v.id === s.id));
  return renumber([...visible, ...hidden]);
}

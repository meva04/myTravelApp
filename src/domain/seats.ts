// 좌석 그림에 쓰는 계산: 좌석 번호 읽기, 기종별 좌석 배치, 창가·복도 구분.

export type Seat = { row: number; letter: string };
export type Layout = { name: string; blocks: string[][]; rows: number };

/** '32A', '32 A', '8-12' 같은 좌석 번호 */
export function parseSeat(s?: string): Seat | null {
  const m = s?.trim().toUpperCase().match(/^(\d{1,3})\s*-?\s*([A-Z]|\d{1,2})$/);
  return m ? { row: Number(m[1]), letter: m[2] } : null;
}

/** 기종 이름으로 이코노미 좌석 배치를 어림한다. */
export function aircraftLayout(model = ''): Layout {
  const m = model.toUpperCase();
  if (/A220|CS[13]00|BD-500/.test(m)) return { name: '소형 (2-3)', blocks: [['A', 'C'], ['D', 'E', 'F']], rows: 30 };
  if (/ATR|CRJ|E1[79]\d|ERJ|E-?JET|EMBRAER|Q400|DASH|DHC/.test(m)) return { name: '소형 (2-2)', blocks: [['A', 'C'], ['D', 'F']], rows: 22 };
  if (/777|747|A380|A340|A-?380/.test(m)) return { name: '대형 광동체 (3-4-3)', blocks: [['A', 'B', 'C'], ['D', 'E', 'F', 'G'], ['H', 'J', 'K']], rows: 55 };
  if (/787|A350|A330|A300|767|DREAMLINER/.test(m)) return { name: '광동체 (3-3-3)', blocks: [['A', 'B', 'C'], ['D', 'E', 'F'], ['H', 'J', 'K']], rows: 48 };
  return { name: '협동체 (3-3)', blocks: [['A', 'B', 'C'], ['D', 'E', 'F']], rows: 35 };
}

export const trainLayout: Layout = { name: '일반실 (2-2)', blocks: [['A', 'B'], ['C', 'D']], rows: 20 };
export const busLayout: Layout = { name: '버스 (2-2)', blocks: [['A', 'B'], ['C', 'D']], rows: 12 };

/** 창가 / 복도 / 가운데 */
export function seatSide(layout: Layout, letter: string): 'window' | 'aisle' | 'middle' | null {
  const first = layout.blocks[0];
  const last = layout.blocks[layout.blocks.length - 1];
  if (letter === first[0] || letter === last[last.length - 1]) return 'window';
  for (const b of layout.blocks) {
    const i = b.indexOf(letter);
    if (i < 0) continue;
    return i === 0 || i === b.length - 1 ? 'aisle' : 'middle';
  }
  return null;
}

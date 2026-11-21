// 하루 경로를 처음부터 끝까지 이어 그리는 애니메이션용 계산. 화면과 상관없는 순수 함수.
import type { LatLng } from '@/domain/types';

/** 두 점 사이 거리 (위도에 따라 경도 폭을 줄인 근사값, 비율 계산에만 쓴다) */
function dist(a: LatLng, b: LatLng): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dx = (b.lng - a.lng) * k;
  const dy = b.lat - a.lat;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 구간 경로들(하루 순서대로)을 한 줄로 이어 보고, 전체 길이의 progress(0~1)만큼만 남긴다.
 * 앞 구간이 다 그려진 뒤 다음 구간이 이어지고, 그리는 중인 구간은 끝점을 선 위에 보간해 부드럽게 늘어난다.
 * 아직 닿지 않은 구간은 빈 배열.
 */
export function drawnLines(lines: LatLng[][], progress: number): LatLng[][] {
  if (progress >= 1) return lines;
  const lengths = lines.map((line) => line.slice(1).reduce((sum, p, i) => sum + dist(line[i], p), 0));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return progress > 0 ? lines : lines.map(() => []);
  let left = Math.max(0, progress) * total;
  return lines.map((line, li) => {
    if (left <= 0) return [];
    if (left >= lengths[li]) {
      left -= lengths[li];
      return line;
    }
    const out: LatLng[] = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const d = dist(line[i - 1], line[i]);
      if (left >= d) {
        out.push(line[i]);
        left -= d;
        continue;
      }
      const t = d === 0 ? 0 : left / d;
      out.push({
        lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * t,
        lng: line[i - 1].lng + (line[i].lng - line[i - 1].lng) * t,
      });
      left = 0;
      break;
    }
    return out;
  });
}

/** 처음엔 빠르게, 끝에서 부드럽게 멈추는 속도 */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

const M_PER_DEG = 111_320;

/** 점 p 에서 선분 ab 까지 거리 (미터, 짧은 거리용 근사) */
function offLine(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos(a.lat * (Math.PI / 180));
  const ax = a.lng * k,
    ay = a.lat,
    bx = b.lng * k,
    by = b.lat,
    px = p.lng * k,
    py = p.lat;
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * M_PER_DEG;
}

/** 길에서 tol 미터 안쪽으로만 흔들리는 잔 꺾임을 걷어 낸다 (Douglas–Peucker). 첫·끝 점은 그대로. */
export function simplifyLine(line: LatLng[], tol = 6): LatLng[] {
  if (line.length < 3) return line;
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = keep[line.length - 1] = true;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let far = -1;
    let farD = tol;
    for (let i = s + 1; i < e; i++) {
      const d = offLine(line[i], line[s], line[e]);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = true;
      stack.push([s, far], [far, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** 꺾이는 모서리를 깎아 둥글게 만든다 (Chaikin). 첫·끝 점은 장소 핀에 붙어 있도록 그대로 둔다. */
export function roundCorners(line: LatLng[], rounds = 2): LatLng[] {
  let out = line;
  for (let r = 0; r < rounds && out.length > 2; r++) {
    const next: LatLng[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const p = out[i],
        q = out[i + 1];
      if (i > 0)
        next.push({
          lat: 0.75 * p.lat + 0.25 * q.lat,
          lng: 0.75 * p.lng + 0.25 * q.lng,
        });
      if (i < out.length - 2)
        next.push({
          lat: 0.25 * p.lat + 0.75 * q.lat,
          lng: 0.25 * p.lng + 0.75 * q.lng,
        });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/** 지도에 그릴 경로: 잔 꺾임을 걷어 내고 모서리를 둥글게 */
export const smoothLine = (line: LatLng[]): LatLng[] => roundCorners(simplifyLine(line));

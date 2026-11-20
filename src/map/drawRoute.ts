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
      out.push({ lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * t, lng: line[i - 1].lng + (line[i].lng - line[i - 1].lng) * t });
      left = 0;
      break;
    }
    return out;
  });
}

/** 처음엔 빠르게, 끝에서 부드럽게 멈추는 속도 */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

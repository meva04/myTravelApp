// 오늘 환율. 키 없이 쓰는 무료 공개 환율(open.er-api.com, 하루 한 번 갱신)을 쓴다.
import { OfflineError } from '@/google/errors';

export type FxRates = {
  /** 환율이 갱신된 날 'YYYY-MM-DD' */
  date: string;
  /** rates[cur] = 1 cur 가 기준 통화로 얼마인지 */
  rates: Record<string, number>;
};

export type Fx = {
  /** 기준 통화 기준 오늘 환율. 인터넷이 없으면 OfflineError. */
  latest(base: string): Promise<FxRates>;
};

/** 같은 기준 통화는 이만큼 동안 다시 받지 않는다 */
const CACHE_MS = 3 * 60 * 60 * 1000;

export function makeFx(fetchFn: typeof fetch, now: () => number = Date.now): Fx {
  const cache = new Map<string, { at: number; value: FxRates }>();
  return {
    async latest(base) {
      const hit = cache.get(base);
      if (hit && now() - hit.at < CACHE_MS) return hit.value;
      let res: Response;
      try {
        res = await fetchFn(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
      } catch {
        throw new OfflineError();
      }
      const body = (await res.json()) as { result?: string; time_last_update_unix?: number; rates?: Record<string, number> };
      if (!res.ok || body.result !== 'success' || !body.rates) throw new Error('fx unavailable');
      // 응답은 "기준 1 = cur 얼마" 이므로 뒤집어 "cur 1 = 기준 얼마" 로 둔다
      const rates: Record<string, number> = {};
      for (const [cur, v] of Object.entries(body.rates)) if (v > 0 && cur !== base) rates[cur] = 1 / v;
      const date = new Date((body.time_last_update_unix ?? now() / 1000) * 1000).toISOString().slice(0, 10);
      const value = { date, rates };
      cache.set(base, { at: now(), value });
      return value;
    },
  };
}

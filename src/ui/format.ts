export function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString('ko-KR')} ${currency}`;
}

export const formatKm = (meters: number): string => (meters / 1000).toFixed(1);

/** 구간 거리: 1km 미만은 '756m', 이상은 '1.1km'. */
export const formatDistance = (meters: number): string =>
  meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;

/** ISO 시각을 기기 현지 'HH:mm' 으로. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // 2027-02-31 같은 날짜를 거른다
}

/** 통화별 금액을 "20 EUR, 5 USD" 처럼 잇는다. */
export const formatAmounts = (byCurrency: Record<string, number> | undefined): string =>
  Object.entries(byCurrency ?? {})
    .map(([cur, amount]) => formatMoney(amount, cur))
    .join(', ');
export const isTime = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

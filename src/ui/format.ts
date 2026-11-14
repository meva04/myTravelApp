export function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString('ko-KR')} ${currency}`;
}

export const formatKm = (meters: number): string => (meters / 1000).toFixed(1);

/** ISO 시각을 기기 현지 'HH:mm' 으로. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const isDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const isTime = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

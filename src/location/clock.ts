const p = (n: number) => String(n).padStart(2, '0');

/** 기기 현지 날짜 'YYYY-MM-DD' */
export function localToday(d = new Date()): string {
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 기기 현지 시각 'YYYY-MM-DDTHH:mm' */
export function localNow(d = new Date()): string {
  return `${localToday(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

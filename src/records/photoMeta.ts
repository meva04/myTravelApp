export type PhotoMeta = { takenAt: string; lat: number | null; lng: number | null };

/** 사진 EXIF 에서 촬영 시각과 위치를 읽는다. 없거나 이상하면 지금 시각·위치 없음. */
export function photoMeta(exif: Record<string, unknown> | null | undefined, nowIso: string): PhotoMeta {
  let takenAt = nowIso;
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  const m = typeof raw === 'string' ? /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw) : null;
  if (m) {
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
    takenAt = new Date(y, mo - 1, d, h, mi, s).toISOString();
  }
  const lat = coord(exif?.GPSLatitude, exif?.GPSLatitudeRef, 'S');
  const lng = coord(exif?.GPSLongitude, exif?.GPSLongitudeRef, 'W');
  return lat === null || lng === null ? { takenAt, lat: null, lng: null } : { takenAt, lat, lng };
}

function coord(value: unknown, ref: unknown, negativeRef: string): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return ref === negativeRef ? -Math.abs(value) : value;
}

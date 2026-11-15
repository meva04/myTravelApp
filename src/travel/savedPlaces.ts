// 구글 지도에 저장한 장소 가져오기. 구글은 저장 목록을 앱에 열어 주는 API 가 없어서
// 구글 테이크아웃(takeout.google.com → 지도(내 장소) / 저장됨)으로 내려받은 파일을 읽는다.
//  - "Saved Places.json" (별표한 장소, GeoJSON): 좌표가 들어 있다.
//  - 저장 목록마다의 CSV (Title, Note, URL …): 좌표가 없어 이름으로 구글 검색해 위치를 찾는다.
// 네이버 지도는 아직 내보내기가 없어 같은 틀(SavedDraft)로 나중에 붙인다.

export type SavedDraft = { name: string; address: string; lat: number | null; lng: number | null; note: string; url: string };

type Feature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { Title?: string; location?: { name?: string; address?: string }; google_maps_url?: string; Comment?: string; comment?: string };
};

/** 구글 지도 링크 안의 좌표 (…/@51.5,-0.12,… 또는 ?q=51.5,-0.12) */
export function coordsFromUrl(url: string): [number, number] | null {
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? url.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/) ?? url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function parseTakeoutJson(text: string): SavedDraft[] {
  const data = JSON.parse(text) as { features?: Feature[] };
  return (data.features ?? [])
    .map((f): SavedDraft | null => {
      const p = f.properties ?? {};
      const url = p.google_maps_url ?? '';
      const name = p.location?.name ?? p.Title ?? '';
      let [lng, lat] = f.geometry?.coordinates ?? [0, 0];
      // 좌표가 0,0 으로 오는 항목은 링크에서 찾는다
      if (lat === 0 && lng === 0) {
        const c = coordsFromUrl(url);
        if (c) [lat, lng] = c;
      }
      if (!name && !url) return null;
      const known = !(lat === 0 && lng === 0);
      return { name: name || p.location?.address || '', address: p.location?.address ?? '', lat: known ? lat : null, lng: known ? lng : null, note: p.Comment ?? p.comment ?? '', url };
    })
    .filter((x): x is SavedDraft => x !== null && x.name !== '');
}

/** 따옴표·줄바꿈을 지원하는 간단한 CSV 읽기 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export function parseTakeoutCsv(text: string): SavedDraft[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const col = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name);
  const [ti, ni, ui, ci] = [col('title'), col('note'), col('url'), col('comment')];
  if (ti < 0) return [];
  return rows
    .map((r) => {
      const url = ui >= 0 ? (r[ui] ?? '') : '';
      const c = coordsFromUrl(url);
      const note = [ni >= 0 ? r[ni] : '', ci >= 0 ? r[ci] : ''].filter((x) => x && x.trim()).join(' · ');
      return { name: (r[ti] ?? '').trim(), address: '', lat: c?.[0] ?? null, lng: c?.[1] ?? null, note, url };
    })
    .filter((x) => x.name !== '');
}

/** 파일 이름으로 형식을 고른다. */
export function parseSavedFile(fileName: string, text: string): SavedDraft[] {
  return /\.csv$/i.test(fileName) ? parseTakeoutCsv(text) : parseTakeoutJson(text);
}

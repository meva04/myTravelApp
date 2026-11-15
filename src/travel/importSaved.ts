import type { SavedPlace } from '@/domain/types';
import type { Services } from '@/state/services';

import { parseSavedFile } from './savedPlaces';

/**
 * 테이크아웃 파일들을 읽어 저장한 장소로 둔다. 좌표가 없는 항목(목록 CSV)은 이름으로 구글에서 찾아 위치를 정한다.
 * 결과: 더한 개수, 위치를 못 찾은 개수
 */
export async function importSavedFiles(sv: Pick<Services, 'repo' | 'places'>, files: { name: string; text: string }[]): Promise<{ added: number; missing: number }> {
  const out: Omit<SavedPlace, 'id'>[] = [];
  let missing = 0;
  for (const f of files) {
    const list = f.name.replace(/\.(json|csv)$/i, '');
    for (const d of parseSavedFile(f.name, f.text)) {
      let { lat, lng } = d;
      let placeId: string | null = null;
      let address = d.address;
      if (lat === null || lng === null) {
        const hit = (await sv.places.search(d.name).catch(() => []))[0];
        if (!hit) {
          missing++;
          continue;
        }
        ({ lat, lng, placeId, address } = { lat: hit.lat, lng: hit.lng, placeId: hit.placeId, address: hit.address });
      }
      out.push({ source: 'google', list, name: d.name, address, lat, lng, placeId, note: d.note });
    }
  }
  return { added: await sv.repo.addSavedPlaces(out), missing };
}

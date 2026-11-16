// 테스트 전용: 메모리 DB 와 가짜 구글 클라이언트로 화면을 띄운다.
import { randomUUID } from 'crypto';
import type { ReactElement } from 'react';

import { makeRepo } from '@/db/repo';
import { makeTestDb } from '@/db/testDb';
import type { Places } from '@/google/places';
import type { Routes } from '@/google/routes';
import type { Flights } from '@/travel/flights';
import { OfflineError } from '@/google/errors';
import type { Fx } from '@/travel/fx';
import { ServicesContext } from '@/state/ServicesContext';
import type { Services } from '@/state/services';

export async function makeTestServices(over: Partial<Services> = {}): Promise<Services> {
  const repo = makeRepo(makeTestDb(), randomUUID);
  await repo.migrate();
  const places: Places = {
    search: async () => [],
    details: async (placeId) => ({ placeId, address: '', photoUrls: [], photoAuthors: [] }),
    fromMapsUrl: async () => null,
  };
  const routes: Routes = {
    compute: async () => ({ id: randomUUID(), kind: 'default', polyline: [], distanceMeters: 0, durationSeconds: 0 }),
  };
  const flights: Flights = { available: false, today: async () => null };
  // 기본은 오프라인: 환율은 여행에 저장된 것만 쓴다
  const fx: Fx = { latest: async () => { throw new OfflineError(); } };
  return { repo, places, routes, flights, fx, newId: randomUUID, onItineraryChanged: () => {}, ...over };
}

export function withServices(services: Services, ui: ReactElement) {
  return <ServicesContext.Provider value={services}>{ui}</ServicesContext.Provider>;
}

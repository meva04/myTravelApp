// 앱 전체가 함께 쓰는 저장소·구글 클라이언트. 백그라운드 도착 감지에서도 쓰이므로 화면 밖에 둔다.
import { randomUUID } from 'expo-crypto';

import { openExpoDb } from '@/db/expoDb';
import { makeRepo, type Repo } from '@/db/repo';
import { makePlaces, type Places } from '@/google/places';
import { makeRoutes, type Routes } from '@/google/routes';
import { makeFlights, type Flights } from '@/travel/flights';

export type Services = {
  repo: Repo;
  places: Places;
  routes: Routes;
  /** 인천공항 당일 운항 정보 (공공데이터포털 키가 없으면 available=false) */
  flights: Flights;
  newId: () => string;
  /** 일정이나 도착 상태가 바뀌었을 때 (도착 감지 대상을 다시 등록) */
  onItineraryChanged: () => void;
};

let ready: Promise<Services> | null = null;

export function getServices(): Promise<Services> {
  ready ??= (async () => {
    const repo = makeRepo(await openExpoDb(), randomUUID);
    await repo.migrate();
    const key = process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '';
    return {
      repo,
      places: makePlaces(fetch, key),
      routes: makeRoutes(fetch, key, randomUUID),
      flights: makeFlights(fetch, process.env.EXPO_PUBLIC_DATA_GO_KR_KEY ?? ''),
      newId: randomUUID,
      onItineraryChanged: () => {},
    };
  })();
  return ready;
}

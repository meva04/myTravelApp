// 앱 전체가 함께 쓰는 저장소·구글 클라이언트. 백그라운드 도착 감지에서도 쓰이므로 화면 밖에 둔다.
import { randomUUID } from 'expo-crypto';

import { openExpoDb } from '@/db/expoDb';
import { makeRepo, type Repo } from '@/db/repo';
import { makePlaces, type Places } from '@/google/places';
import { makeRoutes, type Routes } from '@/google/routes';

export type Services = { repo: Repo; places: Places; routes: Routes; newId: () => string };

let ready: Promise<Services> | null = null;

export function getServices(): Promise<Services> {
  ready ??= (async () => {
    const repo = makeRepo(await openExpoDb(), randomUUID);
    await repo.migrate();
    const key = process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '';
    return { repo, places: makePlaces(fetch, key), routes: makeRoutes(fetch, key, randomUUID), newId: randomUUID };
  })();
  return ready;
}

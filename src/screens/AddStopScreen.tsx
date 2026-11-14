import { useState } from 'react';

import { syncLegs } from '@/domain/itinerary';
import type { Stop } from '@/domain/types';
import { GoogleApiError, OfflineError } from '@/google/errors';
import type { PlaceHit } from '@/google/places';
import { t } from '@/i18n/ko';
import type { Services } from '@/state/services';
import { useServices } from '@/state/ServicesContext';
import { Button, Card, Field, Row, Screen, Txt } from '@/ui/kit';

/** 그 날의 맨 끝에 방문지를 추가하고 구간을 맞춘다. */
export async function appendStop(
  sv: Services,
  dayId: string,
  place: { placeId: string | null; name: string; lat: number; lng: number },
  extra: Partial<Stop> = {},
): Promise<Stop> {
  const stops = await sv.repo.listStops(dayId);
  const stop: Stop = {
    id: sv.newId(), dayId, order: stops.length, placeId: place.placeId, name: place.name, lat: place.lat, lng: place.lng,
    plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', ...extra,
  };
  const next = [...stops, stop];
  await sv.repo.saveStops(dayId, next);
  await sv.repo.saveLegs(dayId, syncLegs(next, await sv.repo.listLegs(dayId), sv.newId));
  sv.onItineraryChanged();
  return stop;
}

type Status = 'idle' | 'loading' | 'offline' | 'error' | 'none';

export function AddStopScreen({ dayId, onDone }: { dayId: string; onDone: () => void }) {
  const sv = useServices();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [status, setStatus] = useState<Status>('idle');

  const search = async () => {
    if (query.trim() === '') return;
    setStatus('loading');
    try {
      const stops = await sv.repo.listStops(dayId);
      const near = stops.length ? { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng } : undefined;
      const found = await sv.places.search(query.trim(), near);
      setHits(found);
      setStatus(found.length ? 'idle' : 'none');
    } catch (e) {
      setHits([]);
      if (e instanceof OfflineError) setStatus('offline');
      else if (e instanceof GoogleApiError) setStatus('error');
      else throw e;
    }
  };

  const pick = async (hit: PlaceHit) => {
    await appendStop(sv, dayId, hit);
    onDone();
  };

  return (
    <Screen>
      <Row>
        <Field style={{ flex: 1 }} placeholder={t('search.placeholder')} value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" />
        <Button label={t('search.go')} onPress={search} />
      </Row>
      {status === 'loading' && <Txt kind="soft">{t('common.loading')}</Txt>}
      {status === 'none' && <Txt kind="soft">{t('search.none')}</Txt>}
      {status === 'error' && <Txt kind="soft">{t('search.error')}</Txt>}
      {status === 'offline' && <Button kind="ghost" label={t('common.retryWhenOnline')} onPress={search} />}
      {hits.map((h) => (
        <Card key={h.placeId} onPress={() => pick(h)}>
          <Txt>{h.name}</Txt>
          <Txt kind="soft">{h.address}</Txt>
        </Card>
      ))}
    </Screen>
  );
}

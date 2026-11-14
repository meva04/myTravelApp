import { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';

import { markArrived } from '@/domain/arrival';
import { summarizeExpenses } from '@/domain/expenses';
import type { Photo, Stop } from '@/domain/types';
import { GoogleApiError, OfflineError } from '@/google/errors';
import type { PlaceDetails } from '@/google/places';
import { t } from '@/i18n/ko';
import { useLoad, useServices } from '@/state/ServicesContext';
import { radius, space } from '@/theme/tokens';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { formatMoney, formatTime, isTime } from '@/ui/format';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/ui/kit';
import { Stamp } from '@/ui/Stamp';

type Props = {
  stopId: string;
  pickPhoto: (source: 'library' | 'camera') => Promise<Omit<Photo, 'id' | 'stopId'> | null>;
  resolvePhoto: (uri: string) => string;
  openUrl: (url: string) => void;
  now?: () => string;
  onPhotoRemoved?: (uri: string) => void;
};

type Info = { state: 'loading' | 'offline' | 'error' | 'none' } | { state: 'ready'; details: PlaceDetails };

export function StopScreen({ stopId, pickPhoto, resolvePhoto, openUrl, now = () => new Date().toISOString(), onPhotoRemoved }: Props) {
  const sv = useServices();
  const { repo } = sv;
  const { data, reload } = useLoad(async () => {
    const stop = await repo.getStop(stopId);
    if (!stop) return null;
    const day = await repo.getDay(stop.dayId);
    const trip = day && (await repo.getTrip(day.tripId));
    if (!day || !trip) return null;
    const expenses = (await repo.listExpenses(trip.id)).filter((e) => e.stopId === stopId);
    return { stop, day, trip, expenses, photos: await repo.listPhotos(stopId) };
  }, [stopId]);

  const [memo, setMemo] = useState<string>();
  const [planned, setPlanned] = useState<string>();
  const [arrivalEdit, setArrivalEdit] = useState<string>();
  const [info, setInfo] = useState<Info>({ state: 'loading' });
  const placeId = data?.stop.placeId;

  useEffect(() => {
    if (placeId === undefined) return;
    if (placeId === null) return setInfo({ state: 'none' });
    let alive = true;
    sv.places.details(placeId).then(
      (details) => alive && setInfo({ state: 'ready', details }),
      (e) => {
        if (!alive) return;
        if (e instanceof OfflineError) setInfo({ state: 'offline' });
        else if (e instanceof GoogleApiError) setInfo({ state: 'error' });
        else throw e;
      },
    );
    return () => {
      alive = false;
    };
  }, [placeId, sv.places]);

  if (!data) return <Screen>{null}</Screen>;
  const { stop, day, trip, expenses, photos } = data;

  const save = async (next: Stop, itineraryChanged = false) => {
    await repo.updateStop(next);
    if (itineraryChanged) sv.onItineraryChanged();
    reload();
  };
  const arrive = () => save(markArrived(stop, now(), 'manual'), true);
  const saveArrivalTime = () => {
    if (!stop.arrivedAt || !arrivalEdit || !isTime(arrivalEdit)) return;
    const d = new Date(stop.arrivedAt);
    const [h, m] = arrivalEdit.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    setArrivalEdit(undefined);
    return save({ ...stop, arrivedAt: d.toISOString(), arrivalMethod: 'manual' });
  };
  const addPhoto = async (source: 'library' | 'camera') => {
    const picked = await pickPhoto(source);
    if (!picked) return;
    await repo.addPhoto({ ...picked, stopId });
    reload();
  };
  const removePhoto = async (p: Photo) => {
    await repo.deletePhoto(p.id);
    onPhotoRemoved?.(p.uri);
    reload();
  };

  const subtotal = summarizeExpenses(expenses, trip).byStop[stopId] ?? 0;

  return (
    <Screen>
      <Txt kind="title">{stop.name}</Txt>

      <Card>
        <Txt kind="heading">{t('stop.myRecord')}</Txt>
        {stop.arrivedAt ? (
          <Row>
            <Stamp arrivedAt={stop.arrivedAt} />
            <View style={{ flex: 1, gap: space.sm }}>
              <Txt kind="soft">{t('stop.arrivedAt', { time: formatTime(stop.arrivedAt) })}</Txt>
              <Field
                placeholder={t('stop.editArrival')}
                value={arrivalEdit ?? ''}
                onChangeText={setArrivalEdit}
                onBlur={saveArrivalTime}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </Row>
        ) : (
          <Button label={t('stop.arrive')} onPress={arrive} />
        )}
        <Field
          placeholder={t('stop.plannedTime')}
          value={planned ?? stop.plannedTime ?? ''}
          onChangeText={setPlanned}
          onBlur={() => planned !== undefined && (planned === '' || isTime(planned)) && save({ ...stop, plannedTime: planned || null })}
          keyboardType="numbers-and-punctuation"
        />
        <Field
          placeholder={t('stop.memoPlaceholder')}
          value={memo ?? stop.memo}
          onChangeText={setMemo}
          onBlur={() => memo !== undefined && memo !== stop.memo && save({ ...stop, memo })}
          multiline
        />
      </Card>

      <Card>
        <Txt kind="heading">{t('stop.photos')}</Txt>
        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {photos.map((p) => (
              <View key={p.id} style={{ gap: space.xs }}>
                <Image source={{ uri: resolvePhoto(p.uri) }} style={{ width: 120, height: 120, borderRadius: radius.md }} />
                <Chip label={t('common.delete')} onPress={() => void removePhoto(p)} />
              </View>
            ))}
          </ScrollView>
        )}
        <Row>
          <Button kind="ghost" label={t('stop.addPhoto')} onPress={() => void addPhoto('library')} />
          <Button kind="ghost" label={t('stop.takePhoto')} onPress={() => void addPhoto('camera')} />
        </Row>
      </Card>

      <Card>
        <Txt kind="heading">{t('stop.expenses')}</Txt>
        {expenses.map((e) => (
          <Row key={e.id}>
            <Txt style={{ flex: 1 }}>
              {t(`cat.${e.category}`)}
              {e.memo ? ` · ${e.memo}` : ''}
            </Txt>
            <Txt>{formatMoney(e.amount, e.currency)}</Txt>
            <Chip
              label={t('common.delete')}
              onPress={async () => {
                await repo.deleteExpense(e.id);
                reload();
              }}
            />
          </Row>
        ))}
        <Txt kind="soft">{t('stop.subtotal', { amount: formatMoney(subtotal, trip.baseCurrency) })}</Txt>
        <ExpenseForm
          defaultCurrency={trip.baseCurrency}
          onAdd={async (e) => {
            await repo.addExpense({ ...e, tripId: trip.id, date: day.date, stopId });
            reload();
          }}
        />
      </Card>

      {info.state !== 'none' && (
        <Card>
          <Txt kind="heading">{t('stop.placeInfo')}</Txt>
          {info.state === 'loading' && <Txt kind="soft">{t('common.loading')}</Txt>}
          {info.state === 'offline' && <Txt kind="soft">{t('stop.infoOffline')}</Txt>}
          {info.state === 'error' && <Txt kind="soft">{t('stop.infoError')}</Txt>}
          {info.state === 'ready' && (
            <>
              {info.details.rating !== null && <Txt>{t('stop.rating', { rating: info.details.rating, count: info.details.ratingCount ?? 0 })}</Txt>}
              {info.details.address !== '' && <Txt kind="soft">{info.details.address}</Txt>}
              {info.details.photoUrls.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                  {info.details.photoUrls.map((u) => (
                    <Image key={u} source={{ uri: u }} style={{ width: 160, height: 110, borderRadius: radius.md }} />
                  ))}
                </ScrollView>
              )}
              {info.details.openingHours.map((line) => (
                <Txt key={line} kind="soft">
                  {line}
                </Txt>
              ))}
              {info.details.website && <Button kind="ghost" label={t('stop.website')} onPress={() => openUrl(info.details.website!)} />}
              <Txt kind="small">{t('stop.source')}</Txt>
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

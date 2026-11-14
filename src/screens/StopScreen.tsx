import { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';

import { summarizeExpenses } from '@/domain/expenses';
import type { Photo } from '@/domain/types';
import { OfflineError } from '@/google/errors';
import type { PlaceDetails } from '@/google/places';
import { t } from '@/i18n/ko';
import { useLoad, useServices } from '@/state/ServicesContext';
import { radius, space } from '@/theme/tokens';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { formatAmounts, formatMoney, formatTime, isTime } from '@/ui/format';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/ui/kit';
import { Stamp } from '@/ui/Stamp';

type Props = {
  stopId: string;
  pickPhoto: (source: 'library' | 'camera') => Promise<Omit<Photo, 'id' | 'stopId'> | null>;
  resolvePhoto: (uri: string) => string;
  openUrl: (url: string) => void;
  now?: () => string;
  onPhotoRemoved?: (uri: string) => void;
  refreshKey?: number;
};

type Info = { state: 'loading' | 'offline' | 'error' | 'none' } | { state: 'ready'; details: PlaceDetails };

export function StopScreen({ stopId, pickPhoto, resolvePhoto, openUrl, now = () => new Date().toISOString(), onPhotoRemoved, refreshKey = 0 }: Props) {
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
  }, [stopId, refreshKey]);

  const [memo, setMemo] = useState<string>();
  const [planned, setPlanned] = useState<string>();
  const [arrivalEdit, setArrivalEdit] = useState<string>();
  const [info, setInfo] = useState<Info>({ state: 'loading' });
  const [infoTry, setInfoTry] = useState(0);
  const [badTime, setBadTime] = useState(false);
  const placeId = data?.stop.placeId;

  useEffect(() => {
    if (placeId === undefined) return;
    if (placeId === null) return setInfo({ state: 'none' });
    let alive = true;
    sv.places.details(placeId).then(
      (details) => alive && setInfo({ state: 'ready', details }),
      (e) => alive && setInfo({ state: e instanceof OfflineError ? 'offline' : 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [placeId, sv.places, infoTry]);

  if (!data) return <Screen>{null}</Screen>;
  const { stop, day, trip, expenses, photos } = data;

  // 화면의 옛 사본으로 다른 칸을 덮어쓰지 않도록, 바꾼 칸만 저장한다.
  const arrive = async () => {
    await repo.markStopArrived(stopId, now(), 'manual');
    sv.onItineraryChanged();
    reload();
  };
  const checkTime = (v: string) => {
    const ok = v === '' || isTime(v);
    setBadTime(!ok);
    return ok;
  };
  const saveArrivalTime = async () => {
    if (!stop.arrivedAt || !arrivalEdit || !checkTime(arrivalEdit)) return;
    const d = new Date(stop.arrivedAt);
    const [h, m] = arrivalEdit.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    setArrivalEdit(undefined);
    await repo.setStopArrivalTime(stopId, d.toISOString());
    reload();
  };
  const savePlanned = async () => {
    if (planned === undefined || !checkTime(planned)) return;
    await repo.setStopPlannedTime(stopId, planned || null);
    reload();
  };
  const saveMemo = async () => {
    if (memo === undefined || memo === stop.memo) return;
    await repo.setStopMemo(stopId, memo);
    reload();
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

  const summary = summarizeExpenses(expenses, trip);
  const subtotal = summary.byStop[stopId] ?? 0;
  const unconverted = formatAmounts(summary.unconvertedByStop[stopId]);

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
                onBlur={() => void saveArrivalTime()}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </Row>
        ) : (
          <Button label={t('stop.arrive')} onPress={() => void arrive()} />
        )}
        <Field
          placeholder={t('stop.plannedTime')}
          value={planned ?? stop.plannedTime ?? ''}
          onChangeText={setPlanned}
          onBlur={() => void savePlanned()}
          keyboardType="numbers-and-punctuation"
        />
        <Field
          placeholder={t('stop.memoPlaceholder')}
          value={memo ?? stop.memo}
          onChangeText={setMemo}
          onBlur={() => void saveMemo()}
          multiline
        />
        {badTime && <Txt kind="soft">{t('stop.badTime')}</Txt>}
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
        {unconverted !== '' && <Txt kind="soft">{`${t('expense.unconverted')}: ${unconverted}`}</Txt>}
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
          {info.state === 'offline' && (
            <>
              <Txt kind="soft">{t('stop.infoOffline')}</Txt>
              <Button kind="ghost" label={t('common.retryWhenOnline')} onPress={() => setInfoTry((n) => n + 1)} />
            </>
          )}
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

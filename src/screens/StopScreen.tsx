import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';

import { peopleOf, summarizeExpenses } from '@/domain/expenses';
import { parseChecklist, serializeChecklist, type CheckItem } from '@/domain/checklist';
import type { Photo } from '@/domain/types';
import { OfflineError } from '@/google/errors';
import type { PlaceDetails } from '@/google/places';
import { t } from '@/i18n/ko';
import { googleMapsUrl } from '@/map/directions';
import type { StopPrompt } from '@/location/promptsCore';
import { deleteStop, moveStop, setSkipped } from '@/state/itineraryOps';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, radius, space } from '@/theme/tokens';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { formatAmounts, formatMoney, formatTime } from '@/ui/format';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/ui/kit';
import { Checklist } from '@/ui/Checklist';
import { DateField, TimeField } from '@/ui/PickerField';
import { PlaceHero } from '@/ui/PlaceHero';
import { heroImages } from '@/ui/PlaceVisual';
import { SeatMap } from '@/ui/SeatMap';
import { bookingLine } from '@/domain/bookings';
import { Stamp } from '@/ui/Stamp';

type Props = {
  stopId: string;
  pickPhoto: (source: 'library' | 'camera') => Promise<Omit<Photo, 'id' | 'stopId'>[]>;
  resolvePhoto: (uri: string) => string;
  openUrl: (url: string) => void;
  now?: () => string;
  onPhotoRemoved?: (uri: string) => void;
  /** 근처에서 찍은 사진 고르기 화면을 연다. */
  onFindNearby?: () => void;
  /** 알림에서 열렸을 때 함께 띄울 질문 */
  prompt?: StopPrompt;
  /** 장소를 지운 뒤 (이전 화면으로 돌아가기) */
  onRemoved?: () => void;
  /** 예약으로 만든 장소면 그 예약을 고치는 화면을 연다 */
  onEditBooking?: (bookingId: string) => void;
  refreshKey?: number;
};

type Info = { state: 'loading' | 'offline' | 'error' | 'none' } | { state: 'ready'; details: PlaceDetails };

export function StopScreen({ stopId, pickPhoto, resolvePhoto, openUrl, now = () => new Date().toISOString(), onPhotoRemoved, onFindNearby, prompt, onRemoved, onEditBooking, refreshKey = 0 }: Props) {
  const sv = useServices();
  const { repo } = sv;
  const { data, reload } = useLoad(async () => {
    const stop = await repo.getStop(stopId);
    if (!stop) return null;
    const day = await repo.getDay(stop.dayId);
    const trip = day && (await repo.getTrip(day.tripId));
    if (!day || !trip) return null;
    const expenses = (await repo.listExpenses(trip.id)).filter((e) => e.stopId === stopId);
    const booking = stop.bookingId ? await repo.getBooking(stop.bookingId) : null;
    return { stop, day, trip, expenses, booking, days: await repo.listDays(trip.id), photos: await repo.listPhotos(stopId) };
  }, [stopId, refreshKey]);

  const [memo, setMemo] = useState<string>();
  const [question, setQuestion] = useState<StopPrompt | null>(prompt ?? null);
  // 화면을 보는 동안은 이 사본이 체크리스트의 기준이다 (입력 중 다시 불러와 칸이 흔들리지 않게).
  const [planItems, setPlanItems] = useState<CheckItem[]>();
  const [info, setInfo] = useState<Info>({ state: 'loading' });
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
  }, [placeId, sv.places, refreshKey]); // 화면에 다시 돌아오면 (연결이 돌아왔을 수 있으니) 다시 받는다

  const loadedStop = data?.stop;
  // "못 갈 거 같아요" 로 열렸으면 바로 숨길지 묻는다.
  useEffect(() => {
    if (question === 'skip' && loadedStop && !loadedStop.skipped) askSkip(loadedStop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, loadedStop?.id]);

  function askSkip(s: NonNullable<typeof loadedStop>) {
    Alert.alert(t('prompt.skipTitle'), t('prompt.skipBody'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => setQuestion(null) },
      {
        text: t('prompt.hide'),
        onPress: async () => {
          setQuestion(null);
          await setSkipped(sv, s, true);
          reload();
        },
      },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setQuestion(null);
          await deleteStop(sv, s);
          onRemoved?.();
        },
      },
    ]);
  }

  if (!data) return <Screen>{null}</Screen>;
  const { stop, day, trip, expenses, days, photos, booking } = data;
  const visited = stop.arrivedAt !== null;
  const details = info.state === 'ready' ? info.details : undefined;
  // 머리 사진: 내가 대표로 지정한 사진 > 방문해서 찍은 사진(슬라이드) > 구글 대표 사진
  const hero = heroImages(stop, photos, details?.photoUrls ?? [], resolvePhoto);
  const heroIsGoogle = hero.google;

  // 화면의 옛 사본으로 다른 칸을 덮어쓰지 않도록, 바꾼 칸만 저장한다.
  const arrive = async () => {
    setQuestion(null);
    await repo.markStopArrived(stopId, now(), 'manual');
    sv.onItineraryChanged();
    reload();
  };
  const saveArrivalTime = async (time: string) => {
    if (!stop.arrivedAt || !time) return;
    const d = new Date(stop.arrivedAt);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    await repo.setStopArrivalTime(stopId, d.toISOString());
    reload();
  };
  const savePlanned = async (time: string) => {
    await repo.setStopPlannedTime(stopId, time || null);
    sv.onItineraryChanged(); // 예정 시간 알림을 다시 맞춘다
    reload();
  };
  const saveMemo = async () => {
    if (memo === undefined || memo === stop.memo) return;
    await repo.setStopMemo(stopId, memo);
    reload();
  };
  const changePlan = (next: CheckItem[]) => {
    setPlanItems(next);
    void repo.setStopPlanNote(stopId, serializeChecklist(next));
  };
  const addPhoto = async (source: 'library' | 'camera') => {
    for (const picked of await pickPhoto(source)) await repo.addPhoto({ ...picked, stopId });
    reload();
  };
  const toggleCover = async (p: Photo) => {
    await repo.setPhotoCover(p.id, !p.cover);
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
      <PlaceHero
        images={hero.images}
        name={stop.name}
        address={details?.address}
        credit={heroIsGoogle ? details?.photoAuthors[0] : undefined}
        onOpenGoogle={() => openUrl(googleMapsUrl(stop))}
      />

      {booking && (
        <Card>
          <Txt kind="heading">{t('booking.info')}</Txt>
          {bookingLine(booking, stop.name) !== '' && <Txt>{bookingLine(booking, stop.name)}</Txt>}
          {booking.kind !== 'lodging' && booking.from && booking.to && (
            <Txt kind="soft">{`${booking.from.name} ${booking.departTime ?? ''} → ${booking.to.name} ${booking.arriveTime ?? ''}`}</Txt>
          )}
          <SeatMap booking={booking} />
          {onEditBooking && <Button kind="ghost" label={t('booking.edit')} onPress={() => onEditBooking(booking.id)} />}
        </Card>
      )}

      {stop.skipped && (
        <Card style={{ borderColor: colors.inkSoft }}>
          <Txt>{t('stop.hiddenBanner')}</Txt>
          <Row>
            <Button
              label={t('stop.unhide')}
              onPress={async () => {
                await setSkipped(sv, stop, false);
                reload();
              }}
            />
            <Button kind="danger" label={t('common.delete')} onPress={() => askSkip(stop)} />
          </Row>
        </Card>
      )}

      {!visited && !stop.skipped && question === 'arrival' && (
        <Card style={styles.ask}>
          <Txt kind="heading">{t('prompt.arrivalTitle', { name: stop.name })}</Txt>
          <Button label={t('prompt.arrived')} onPress={() => void arrive()} />
          <Button kind="ghost" label={t('prompt.onTheWay')} onPress={() => setQuestion(null)} />
        </Card>
      )}

      {!visited && !stop.skipped && question === 'overdue' && (
        <Card style={styles.ask}>
          <Txt kind="heading">{t('prompt.overdueTitle', { name: stop.name })}</Txt>
          <Txt kind="soft">{t('prompt.overdueBody')}</Txt>
          <Button label={t('prompt.reschedule')} onPress={() => setQuestion('reschedule')} />
          <Button kind="ghost" label={t('prompt.onTheWayShort')} onPress={() => setQuestion(null)} />
          <Button kind="ghost" label={t('prompt.skip')} onPress={() => setQuestion('skip')} />
        </Card>
      )}

      {!stop.skipped && question === 'reschedule' && (
        <Card style={styles.ask}>
          <Txt kind="heading">{t('prompt.rescheduleTitle')}</Txt>
          <Txt kind="soft">{t('prompt.rescheduleHint')}</Txt>
          <TimeField label={t('stop.plannedTime')} value={stop.plannedTime ?? ''} onChange={(v) => void savePlanned(v)} />
          {days.length > 1 && (
            <DateField
              label={t('stop.otherDay')}
              value={day.date}
              min={days[0].date}
              max={days[days.length - 1].date}
              onChange={async (date) => {
                const target = days.find((d) => d.date === date);
                if (target) await moveStop(sv, stop, target);
                reload();
              }}
            />
          )}
          <Button label={t('common.ok')} onPress={() => setQuestion(null)} />
        </Card>
      )}

      <Card>
        <Txt kind="heading">{t('stop.plan')}</Txt>
        <TimeField label={t('stop.plannedTime')} value={stop.plannedTime ?? ''} onChange={(v) => void savePlanned(v)} />
        <Checklist items={planItems ?? parseChecklist(stop.planNote)} onChange={changePlan} editable placeholder={t('stop.planNote')} />
      </Card>

      {!visited && !stop.skipped && (
        <Card>
          <Txt kind="soft">{t('stop.notVisited')}</Txt>
          <Button kind="ghost" label={t('prompt.arrived')} onPress={() => void arrive()} />
        </Card>
      )}

      {visited && (
        <>
          <Card>
            <Txt kind="heading">{t('stop.myRecord')}</Txt>
            {stop.arrivedAt && (
              <Row>
                <Stamp arrivedAt={stop.arrivedAt} />
                <View style={{ flex: 1, gap: space.sm }}>
                  <Txt kind="soft">{t('stop.arrivedAt', { time: formatTime(stop.arrivedAt) })}</Txt>
                  <TimeField label={t('stop.editArrival')} value={formatTime(stop.arrivedAt)} onChange={(v) => void saveArrivalTime(v)} />
                </View>
              </Row>
            )}
            <Field
              placeholder={t('stop.memoPlaceholder')}
              value={memo ?? stop.memo}
              onChangeText={setMemo}
              onBlur={() => void saveMemo()}
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
                    <Row>
                      <Chip label={p.cover ? t('stop.coverOn') : t('stop.cover')} selected={p.cover} onPress={() => void toggleCover(p)} />
                      <Chip label={t('common.delete')} onPress={() => void removePhoto(p)} />
                    </Row>
                  </View>
                ))}
              </ScrollView>
            )}
            {onFindNearby && <Button label={t('stop.fromNearby')} onPress={onFindNearby} />}
            <Row>
              <Button kind="ghost" label={t('stop.addPhoto')} onPress={() => void addPhoto('library')} />
              <Button kind="ghost" label={t('stop.takePhoto')} onPress={() => void addPhoto('camera')} />
            </Row>
          </Card>
        </>
      )}

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
          people={peopleOf(trip)}
          onAdd={async (e) => {
            await repo.addExpense({ ...e, tripId: trip.id, date: day.date, stopId });
            reload();
          }}
        />
      </Card>

    </Screen>
  );
}

const styles = StyleSheet.create({
  ask: { borderColor: colors.accent, borderWidth: 2, gap: space.sm },
});

import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { peopleOf, summarizeExpenses } from '@/domain/expenses';
import { parseChecklist, serializeChecklist, type CheckItem } from '@/domain/checklist';
import { isVideo, thumbOf } from '@/domain/media';
import type { Photo } from '@/domain/types';
import { OfflineError } from '@/google/errors';
import type { PlaceDetails } from '@/google/places';
import { t } from '@/i18n/ko';
import { googleMapsUrl } from '@/map/directions';
import type { StopPrompt } from '@/location/promptsCore';
import { deleteStop, moveStop, setSkipped } from '@/state/itineraryOps';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { currencyChoices, defaultCurrencyOf } from '@/domain/currency';
import { localToday } from '@/location/clock';
import { addExpense } from '@/state/expenseOps';
import { formatAmounts, formatMoney, formatTime } from '@/ui/format';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/ui/kit';
import { Checklist } from '@/ui/Checklist';
import { DateField, TimeField } from '@/ui/PickerField';
import { PhotoViewer } from '@/ui/PhotoViewer';
import { PlaceHero } from '@/ui/PlaceHero';
import { heroImages } from '@/ui/PlaceVisual';
import { SeatMap } from '@/ui/SeatMap';
import { bookingLine } from '@/domain/bookings';
import { Stamp } from '@/ui/Stamp';

type Props = {
  stopId: string;
  /** have: 이미 넣은 사진첩 사진 id (다시 고르지 않게) */
  pickPhoto: (source: 'library' | 'camera', have?: string[]) => Promise<Omit<Photo, 'id' | 'stopId'>[]>;
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
  // 크게 보는 중인 사진들과 처음 장
  const [viewing, setViewing] = useState<{ uris: string[]; start: number } | null>(null);
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
  // 도착 기록이 없어도 사진·글이 이미 있으면 (일기에서 편집하러 온 경우) 기록 칸을 보여 준다
  const visited = stop.arrivedAt !== null || photos.length > 0 || stop.memo !== '';
  const details = info.state === 'ready' ? info.details : undefined;
  // 머리 사진: 내가 대표로 지정한 사진 > 방문해서 찍은 사진(슬라이드) > 구글 대표 사진
  const hero = heroImages(stop, photos, details?.photoUrls ?? [], resolvePhoto);
  const heroIsGoogle = hero.google;
  const heroPhotos = photos.filter((p) => p.cover).length ? photos.filter((p) => p.cover) : photos;
  // 계획한 날이 지났으면 "도착했어요" 대신 "다녀왔어요"
  const arrivedLabel = localToday() > day.date ? t('prompt.wentThere') : t('prompt.arrived');

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
    const have = data ? data.photos.map((p) => p.assetId).filter((x): x is string => !!x) : [];
    for (const picked of await pickPhoto(source, have)) {
      if (picked.assetId && have.includes(picked.assetId)) continue; // 같은 사진은 한 번만
      await repo.addPhoto({ ...picked, stopId });
    }
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
        // 내 사진이면 눌러서 원본을 크게 본다
        onOpenImage={heroIsGoogle ? undefined : (i) => setViewing({ uris: heroPhotos.map((p) => resolvePhoto(p.uri)), start: i })}
      />

      {booking && (
        <Card>
          <Txt kind="heading">{t('booking.info')}</Txt>
          {bookingLine(booking, stop.name) !== '' && <Txt>{bookingLine(booking, stop.name)}</Txt>}
          {booking.kind !== 'lodging' && booking.from && booking.to && (
            <Txt kind="soft">{`${booking.from.name} ${booking.departTime ?? ''} → ${booking.to.name} ${booking.arriveTime ?? ''}`}</Txt>
          )}
          {booking.kind === 'lodging' && booking.price !== undefined && <Txt kind="soft">{`${t('booking.price')} ${formatMoney(booking.price, booking.priceCurrency ?? trip.baseCurrency)}`}</Txt>}
          {booking.memo ? <Txt kind="soft">{booking.memo}</Txt> : null}
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
          <Button kind="ghost" label={arrivedLabel} onPress={() => void arrive()} />
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingTop: 6, paddingRight: 6 }}>
                {photos.map((p, i) => (
                  <View key={p.id} style={styles.thumbBox}>
                    <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('diary.photoOpen')} onPress={() => setViewing({ uris: photos.map((x) => resolvePhoto(x.uri)), start: i })}>
                      {/* 목록은 작은 그림으로 빨리, 누르면 원본을 크게 */}
                      <Image source={{ uri: resolvePhoto(thumbOf(p.uri)) }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" recyclingKey={p.id} accessibilityIgnoresInvertColors />
                      {isVideo(p.uri) && <Text style={styles.play}>▶</Text>}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={p.cover ? t('stop.coverOn') : t('stop.cover')} accessibilityState={{ selected: !!p.cover }} onPress={() => void toggleCover(p)} hitSlop={6} style={[styles.cover, p.cover && styles.coverOn]}>
                      <Text style={[styles.coverText, p.cover && { color: '#fff' }]}>{p.cover ? t('stop.coverOn') : t('stop.cover')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${t('stop.photo')} ${t('common.delete')}`} onPress={() => void removePhoto(p)} hitSlop={8} style={styles.remove}>
                      <Text style={styles.removeText}>✕</Text>
                    </Pressable>
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
          defaultCurrency={defaultCurrencyOf(trip, localToday())}
          currencies={currencyChoices(trip)}
          people={peopleOf(trip)}
          onAdd={async (e) => {
            await addExpense(sv, trip, { ...e, date: day.date, stopId });
            reload();
          }}
        />
      </Card>

      {viewing && <PhotoViewer uris={viewing.uris} start={viewing.start} onClose={() => setViewing(null)} />}
    </Screen>
  );
}

const THUMB = 120;

const styles = StyleSheet.create({
  ask: { borderColor: colors.accent, borderWidth: 2, gap: space.sm },
  thumbBox: { width: THUMB, height: THUMB },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  play: { position: 'absolute', left: 0, right: 0, top: THUMB / 2 - 14, textAlign: 'center', fontSize: 24, color: '#fff' },
  remove: { position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cover: { position: 'absolute', left: space.xs, bottom: space.xs, paddingVertical: 2, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.9)' },
  coverOn: { backgroundColor: colors.accent },
  coverText: { fontSize: fonts.size.xs, fontWeight: '700', color: colors.ink },
});

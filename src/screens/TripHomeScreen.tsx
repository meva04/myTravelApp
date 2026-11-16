import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Sortable, { useItemContext } from 'react-native-sortables';

import { bookingLine } from '@/domain/bookings';
import { parseChecklist, serializeChecklist, type CheckItem } from '@/domain/checklist';
import { summarizeExpenses } from '@/domain/expenses';
import { removeStop } from '@/domain/itinerary';
import type { Booking, Day, Leg, Note, SeqItem, Stop, Trip, TravelMode } from '@/domain/types';
import { t } from '@/i18n/ko';
import { DayMap, type DayMapHandle } from '@/map/DayMap';
import { directionsUrl } from '@/map/directions';
import { selectedOption, type LegStatus } from '@/map/legRoutes';
import { allPoints, targetOf, type Selection } from '@/map/points';
import { useLegRoutes } from '@/map/useLegRoutes';
import { moveStop, saveDay, saveOrder, setSkipped } from '@/state/itineraryOps';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space, stopColor } from '@/theme/tokens';
import { Checklist, withDraft } from '@/ui/Checklist';
import { formatAmounts, formatDistance, formatKm, formatMoney, formatTime } from '@/ui/format';
import { Card, Chip, Row, Txt } from '@/ui/kit';
import { PlaceThumb } from '@/ui/PlaceVisual';
import { SheetModal } from '@/ui/SheetModal';
import { SwipeRow } from '@/ui/SwipeRow';

import { DiaryDay, type DiaryEntry } from './DiaryDay';

type Props = {
  tripId: string;
  onAddStop: (dayId: string) => void;
  onOpenStop: (stopId: string) => void;
  /** 이동 메모 화면을 연다 */
  onOpenNote?: (noteId: string) => void;
  onExpenses: () => void;
  onSettings: () => void;
  /** 여행을 읽었을 때 한 번 불린다 (머리글 제목용). */
  onTrip?: (trip: Trip) => void;
  /** 화면에 다시 돌아왔을 때 바뀌는 값. 바뀌면 다시 불러온다. */
  refreshKey?: number;
  /** 오늘 날짜 'YYYY-MM-DD'. 여행 중이면 그날 탭으로 연다. 지난 날은 일기 모드로 연다. */
  today?: string;
  /** 구글 지도 길찾기 링크를 연다 */
  openUrl?: (url: string) => void;
  /** 저장된 사진 파일 이름 → 화면에 쓸 주소 */
  resolvePhoto?: (uri: string) => string;
};

const MODES: TravelMode[] = ['walk', 'transit', 'drive'];
/** 시트 손잡이 높이. 시트는 내림(손잡이만) / 절반 / 꽉 찬 화면 세 자리에 멈춘다. */
const HANDLE = 28;
const MIDDLE = 0.5;
/** 이 너비부터 일정 판과 지도를 나란히 둔다 (펼친 아이폰 듀오는 669pt) */
const WIDE = 600;

type Item = { kind: 'stop'; id: string; stop: Stop; index: number } | { kind: 'note'; id: string; note: Note };

export function TripHomeScreen({ tripId, onAddStop, onOpenStop, onOpenNote = () => {}, onTrip, refreshKey = 0, today, openUrl = (url) => void Linking.openURL(url), resolvePhoto = (u) => u }: Props) {
  const sv = useServices();
  const { repo } = sv;
  const { data: trip } = useLoad(() => repo.getTrip(tripId), [tripId, refreshKey]);
  // 설정에서 여행 날짜를 바꾸고 돌아오면 날 목록도 다시 읽는다
  const { data: days } = useLoad(() => repo.listDays(tripId), [tripId, refreshKey]);
  const { data: expenses } = useLoad(() => repo.listExpenses(tripId), [tripId, refreshKey]);
  const [pickedDay, setDayId] = useState<string>();
  // 고른 날이 없으면 여행 중인 오늘, 아니면 첫날을 연다.
  const dayId = (pickedDay && days?.some((d) => d.id === pickedDay) ? pickedDay : undefined) ?? (days?.find((d) => d.date === today) ?? days?.[0])?.id;
  const [moving, setMoving] = useState<Stop | null>(null);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  // 날마다 고른 보기. 정하지 않았으면 지난 날은 일기, 아니면 계획.
  const [viewOf, setViewOf] = useState<Record<string, 'plan' | 'diary'>>({});
  const map = useRef<DayMapHandle>(null);
  const screen = useWindowDimensions();
  const [height, setHeight] = useState(screen.height * 0.85);
  const [sheetIndex, setSheetIndex] = useState(1);
  // 내린 시트도 아이폰 홈 인디케이터와 겹치지 않게 그 위로 넉넉히 띄운다
  const bottomSafe = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const collapsed = HANDLE + Math.max(bottomSafe, space.md) + space.lg;
  const day = days?.find((d) => d.id === dayId);
  const past0 = !!day && !!today && day.date < today;

  useEffect(() => {
    if (trip) onTrip?.(trip);
  }, [trip, onTrip]);

  // 날짜별 방문지·구간. 빠진 경로는 고른 이동 수단으로 구글에서 받아 채운다.
  const { stops: allStops, legs, status, loaded, setMode, retry } = useLegRoutes(dayId, refreshKey);
  // 못 가게 되어 숨긴 장소는 일정·지도·경로에서 빼고 맨 아래에 따로 모아 둔다.
  const stops = useMemo(() => allStops.filter((s) => !s.skipped), [allStops]);
  const hidden = useMemo(() => allStops.filter((s) => s.skipped), [allStops]);
  const [showHidden, setShowHidden] = useState(false);
  // 세로 연결선은 목록 뒤에 고정해 그린다 (끌어도 제자리). 첫 줄·마지막 줄의 높이로 점 가운데부터 가운데까지 잇는다.
  const [ends, setEnds] = useState({ top: 0, bottom: 0 });
  const measure = (which: 'top' | 'bottom', h: number) => setEnds((e) => (Math.abs(e[which] - h / 2) < 0.5 ? e : { ...e, [which]: h / 2 }));
  // 일정 순서(장소와 이동 메모가 한 줄), 이동 메모, 그날 사진, 예약
  const [bump, setBump] = useState(0);
  const { data: extra } = useLoad(
    async () =>
      dayId
        ? {
            dayId,
            seq: await repo.listSequence(dayId),
            notes: await repo.listNotesForDay(dayId),
            photos: await repo.listPhotosForDay(dayId),
            bookings: await repo.listBookings(tripId),
          }
        : undefined,
    [dayId, tripId, refreshKey, bump],
  );
  const current = extra?.dayId === dayId ? extra : undefined;
  const notes = useMemo(() => current?.notes ?? [], [current]);
  const photos = current?.photos ?? [];
  const bookings = useMemo(() => current?.bookings ?? [], [current]);

  // 화면에 보일 칸들 (숨긴 장소 제외). 장소 번호는 보이는 장소끼리 센다.
  const rows = useMemo<Item[]>(() => {
    const seq = current?.seq ?? stops.map((s) => ({ kind: 'stop', id: s.id }) as SeqItem);
    const out: Item[] = [];
    let n = 0;
    for (const it of seq) {
      if (it.kind === 'stop') {
        const stop = stops.find((s) => s.id === it.id);
        if (stop) out.push({ kind: 'stop', id: stop.id, stop, index: n++ });
      } else {
        const note = notes.find((x) => x.id === it.id);
        if (note) out.push({ kind: 'note', id: note.id, note });
      }
    }
    // 아직 순서에 반영되지 않은 새 장소
    for (const s of stops) if (!out.some((r) => r.id === s.id)) out.push({ kind: 'stop', id: s.id, stop: s, index: n++ });
    return out;
  }, [current, stops, notes]);

  const changed = () => {
    sv.onItineraryChanged();
    retry();
    setBump((b) => b + 1);
  };

  // 이동 메모를 더하는 중인 자리 (이 장소 다음, 다음 장소로 가는 길)
  const [noteFor, setNoteFor] = useState<Stop | null>(null);
  const [noteDraft, setNoteDraft] = useState<CheckItem[]>([]);
  const [noteTyping, setNoteTyping] = useState('');
  const noteNext = noteFor ? stops[stops.findIndex((s) => s.id === noteFor.id) + 1] : undefined;
  const saveNewNotes = async (s: Stop) => {
    const items = withDraft(noteDraft, noteTyping).filter((it) => it.text.trim());
    setNoteFor(null);
    if (items.length) await repo.addNotes(s.dayId, s.id, items.map((it) => it.text.trim()));
    setBump((b) => b + 1);
  };
  const checkNote = async (n: Note, done: boolean) => {
    await repo.updateNote(n.id, { done });
    setBump((b) => b + 1);
  };
  // 일정에서 바로 체크한다 (실행한 일 표시).
  const checkPlan = async (s: Stop, items: CheckItem[]) => {
    await repo.setStopPlanNote(s.id, serializeChecklist(items));
    retry();
  };
  const points = useMemo(() => allPoints(stops, legs), [stops, legs]);

  // 오늘 인천공항에서 뜨고 내리는 항공편은 게이트·카운터·지연 여부를 확인해 둔다 (10분에 한 번, 무료 공공데이터).
  useEffect(() => {
    if (!sv.flights.available || !today) return;
    const due = bookings.filter(
      (b) => b.kind === 'flight' && (b.departDate === today || b.arriveDate === today) && (!b.checkedAt || Date.now() - Date.parse(b.checkedAt) > 10 * 60000),
    );
    if (!due.length) return;
    let alive = true;
    (async () => {
      for (const b of due) {
        const info = await sv.flights.today(b.title).catch(() => null);
        const dep = info?.direction === 'departure';
        const next: Booking = {
          ...b,
          checkedAt: new Date().toISOString(),
          ...(info && dep ? { gate: info.gate ?? b.gate, terminal: info.terminal ?? b.terminal, checkin: info.checkin, status: info.status, estimated: info.estimated } : {}),
          ...(info && !info.carrier ? {} : info && !b.carrier ? { carrier: info.carrier } : {}),
        };
        await repo.saveBooking(next);
      }
      if (alive) setBump((x) => x + 1);
    })();
    return () => {
      alive = false;
    };
  }, [bookings, today, sv.flights, repo]);

  const changeDay = (id: string) => {
    followed.current = null;
    setDayId(id);
    setSelection(null);
    setMoving(null);
  };

  const select = (s: NonNullable<Selection>) => {
    setSelection(s);
    if (s.type === 'leg') {
      // 구간은 출발·도착과 경로가 모두 보이게 맞춘다.
      const leg = legs.find((l) => l.id === s.id);
      const ends = stops.filter((x) => x.id === leg?.fromStopId || x.id === leg?.toStopId);
      const pts = leg ? allPoints(ends, [leg]) : [];
      if (pts.length > 0) return map.current?.send({ type: 'fitAll', points: pts });
    }
    const target = targetOf(s, stops, legs);
    if (target) map.current?.send({ type: 'goToTarget', target });
  };
  // 목록을 스크롤하면 위 고정 바 바로 아래에 온 장소로 지도를 옮긴다 (확대 정도는 그대로).
  const sheet = useRef<BottomSheet>(null);
  const rowHeights = useRef<Record<string, number>>({});
  const stopHeights = useRef<Record<string, number>>({});
  const gridTop = useRef(0);
  const followed = useRef<string | null>(null);
  const follow = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (editing || !day || (viewOf[day.id] ?? (past0 ? 'diary' : 'plan')) !== 'plan') return;
    const y = e.nativeEvent.contentOffset.y;
    let top = gridTop.current;
    for (const r of rows) {
      const h = rowHeights.current[r.id] ?? 0;
      // 장소 카드가 절반 넘게 위로 지나가면 다음 장소로 넘어간다
      if (r.kind === 'stop' && top + (stopHeights.current[r.id] ?? h) * 0.5 > y) {
        if (followed.current !== r.id) {
          followed.current = r.id;
          select({ type: 'stop', id: r.id });
        }
        return;
      }
      top += h;
    }
  };

  const onDragEnd = async (data: Item[]) => {
    if (!day || !loaded) return;
    const order = data.map((r) => ({ kind: r.kind, id: r.id }) as SeqItem);
    if (order.every((x, i) => rows[i]?.id === x.id)) return;
    await saveOrder(sv, day.id, [...order, ...hidden.map((s) => ({ kind: 'stop', id: s.id }) as SeqItem)]);
    changed();
  };
  const removeStopAsk = (stop: Stop) => {
    Alert.alert(stop.name, t('day.deleteStop'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (!day || !loaded) return;
          await saveDay(sv, day.id, removeStop(allStops, stop.id));
          changed();
        },
      },
    ]);
  };
  const removeNoteAsk = (n: Note) => {
    Alert.alert(n.text, t('note.deleteTitle'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await repo.deleteNote(n.id);
          setBump((b) => b + 1);
        },
      },
    ]);
  };
  const moveTo = async (target: Day) => {
    if (!day || !moving || !loaded) return;
    await moveStop(sv, moving, target);
    setMoving(null);
    changed();
  };

  if (!trip || !days) return <View style={styles.fill} />;

  const summary = expenses ? summarizeExpenses(expenses, trip) : undefined;
  const spent = summary && day ? (summary.byDate[day.date] ?? 0) : 0;
  const unconverted = summary && day ? formatAmounts(summary.unconvertedByDate[day.date]) : '';
  const meters = legs.reduce((sum, l) => sum + (selectedOption(l)?.distanceMeters ?? 0), 0);
  // 화면이 넓으면 (펼친 아이폰 듀오 669pt, 가로 화면) 일정과 지도를 나란히 둔다
  const wide = screen.width >= WIDE;
  const panelWidth = Math.min(420, Math.max(340, Math.round(screen.width * 0.5)));
  // 지도 여백: 내리면 손잡이만큼, 절반이면 절반. 꽉 채우면 지도가 안 보이니 절반 그대로 둔다.
  const inset = sheetIndex === 0 ? collapsed : Math.round(height * MIDDLE);
  const past = !!day && !!today && day.date < today;
  const view = (day && viewOf[day.id]) ?? (past ? 'diary' : 'plan');
  const photosOf = (stopId: string) => photos.filter((p) => p.stopId === stopId && !p.noteId);
  const bookingOf = (s: Stop) => (s.bookingId ? bookings.find((b) => b.id === s.bookingId) : undefined);
  const dayLine = day ? t('day.summary', { stops: stops.length, km: formatKm(meters), spent: formatMoney(spent, trip.baseCurrency) }) : '';

  // 첫 줄과 마지막 줄은 높이를 재어 고정 연결선의 시작·끝을 맞춘다
  const endMeasure = (r: Item) => {
    const i = rows.indexOf(r);
    if (i === 0 && i === rows.length - 1) return undefined;
    if (i === 0) return (h: number) => measure('top', h);
    if (i === rows.length - 1) return (h: number) => measure('bottom', h);
    return undefined;
  };

  const renderRow = (r: Item) => {
    if (r.kind === 'note') {
      const n = r.note;
      if (editing) {
        return (
          <Card style={styles.editCard}>
            <Row>
              <Txt style={{ flex: 1 }}>{n.text}</Txt>
              <Chip label={t('common.delete')} onPress={() => removeNoteAsk(n)} />
            </Row>
          </Card>
        );
      }
      return (
          // 이동 메모는 장소와 같은 급의 카드. 누르면 메모 화면(기록·사진·비용)이 열린다.
          <NoteRow onPress={() => onOpenNote(n.id)} label={`${t('leg.note')} ${n.text}`} name={n.text} onDelete={() => removeNoteAsk(n)} onLayoutHeight={endMeasure(r)}>
            <View style={{ flex: 1, gap: 2 }}>
              <Checklist items={[{ id: n.id, text: n.text, done: n.done }]} onChange={([c]) => void checkNote(n, c.done)} compact />
              {n.memo !== '' && (
                <Text style={styles.noteMemo} numberOfLines={1}>
                  {n.memo}
                </Text>
              )}
            </View>
            <Text style={styles.chevronText}>›</Text>
          </NoteRow>
      );
    }
    const s = r.stop;
    if (editing) {
      return (
        <Card style={styles.editCard}>
          <Row>
            <Dot index={r.index} />
            <Txt style={{ flex: 1 }}>{s.name}</Txt>
          </Row>
          <Row>
            {days.length > 1 && <Chip label={t('day.moveTo')} onPress={() => setMoving(s)} />}
            <Chip label={t('common.delete')} onPress={() => removeStopAsk(s)} />
          </Row>
        </Card>
      );
    }
    const leg = legs.find((l) => l.fromStopId === s.id);
    const booking = bookingOf(s);
    return (
      <View>
          <StopRow
            onDelete={() => removeStopAsk(s)}
            stop={s}
            index={r.index}
            onLayoutHeight={(h) => {
              stopHeights.current[s.id] = h;
              endMeasure(r)?.(h);
            }}
            selected={selection?.type === 'stop' && selection.id === s.id}
            thumb={<PlaceThumb stop={s} photos={photosOf(s.id)} resolvePhoto={resolvePhoto} />}
            info={booking ? bookingLine(booking, s.name) : ''}
            onOpen={() => onOpenStop(s.id)}
            onCheck={(items) => void checkPlan(s, items)}
          />
        {leg && (
          <StayPut>
          <LegRow
            onAddNote={() => {
              setNoteFor(s);
              setNoteDraft([]);
              setNoteTyping('');
            }}
            onDirections={() => {
              const to = stops.find((x) => x.id === leg.toStopId);
              if (to) openUrl(directionsUrl(s, to, leg.mode));
            }}
            leg={leg}
            status={status[leg.id]}
            selected={selection?.type === 'leg' && selection.id === leg.id}
            onPress={() => select({ type: 'leg', id: leg.id })}
            onMode={(m) => leg.mode !== m && setMode(leg.id, m)}
            onRetry={retry}
          />
          </StayPut>
        )}
      </View>
    );
  };

  // 일기에는 장소만 (이동 메모는 숨긴다)
  const diaryEntries: DiaryEntry[] = rows.flatMap((r) => (r.kind === 'stop' ? [{ kind: 'stop' as const, stop: r.stop, photos: photosOf(r.stop.id) }] : []));

  const mapView = (
    <>
      {loaded && (
        <DayMap
          // 날을 바꾸거나 첫 방문지가 생기면 새로 그려 전체가 보이게 맞춘다.
          key={`${dayId}:${points.length > 0}`}
          ref={map}
          initialPoints={points}
          stops={stops}
          legs={legs}
          selection={selection}
          onSelect={(s) => s && select(s)}
          onRegion={() => {}}
          bottomInset={wide ? 0 : inset}
        />
      )}
      {points.length > 0 && (
        <View style={styles.mapButtons}>
          <MapButton label={t('map.fitAll')} onPress={() => map.current?.send({ type: 'fitAll', points })} />
        </View>
      )}
    </>
  );
  // 날짜 탭과 그날 요약은 스크롤하지 않고 위에 고정한다
  const header = (
    <View style={styles.header}>
      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flex: 1 }}>
          {days.map((d, i) => (
            <Chip key={d.id} label={t('day.label', { n: i + 1 })} selected={d.id === dayId} onPress={() => changeDay(d.id)} />
          ))}
        </ScrollView>
        {day && (
          <Chip
            label={view === 'diary' ? t('day.planView') : t('day.diaryView')}
            onPress={() => {
              const next = view === 'diary' ? 'plan' : 'diary';
              setViewOf({ ...viewOf, [day.id]: next });
              // 일기는 누르면 화면 가득 펼쳐 읽고, 계획으로 돌아오면 지도와 반반
              sheet.current?.snapToIndex(next === 'diary' ? 2 : 1);
            }}
          />
        )}
        {view === 'plan' && rows.length > 0 && <Chip label={editing ? t('day.editDone') : t('day.edit')} selected={editing} onPress={() => setEditing(!editing)} />}
      </View>
      {day && view === 'plan' && (
        <>
          <Txt kind="soft">{`${day.date} · ${dayLine}`}</Txt>
          {unconverted !== '' && <Txt kind="soft">{`${t('expense.unconverted')}: ${unconverted}`}</Txt>}
        </>
      )}
    </View>
  );
  const panel = (
    <>
      {day && view === 'diary' && (
        <DiaryDay
          date={day.date}
          dayNumber={days.indexOf(day) + 1}
          entries={diaryEntries}
          missed={stops.filter((s) => !s.arrivedAt && !s.bookingId && s.memo === '' && photosOf(s.id).length === 0)}
          summary={`${t('diary.summary', { n: stops.filter((s) => s.arrivedAt).length, km: formatKm(meters), photos: photos.length })}`}
          resolvePhoto={resolvePhoto}
          onOpenStop={onOpenStop}
          onOpenNote={onOpenNote}
          trip={trip}
          expenses={(expenses ?? []).filter((e) => e.date === day.date)}
        />
      )}

      {day && view === 'plan' && (
        <>
          {loaded && rows.length === 0 && (
            <Card>
              <Txt kind="soft">{t('day.empty')}</Txt>
            </Card>
          )}

          {/* 길게 눌러 끌면 장소와 이동 메모의 순서를 함께 바꾼다. 왼쪽으로 밀면 삭제. */}
          <View onLayout={(e) => (gridTop.current = e.nativeEvent.layout.y)}>
          {!editing && rows.length > 1 && <View pointerEvents="none" style={[styles.railLine, { top: ends.top, bottom: ends.bottom }]} />}
          <Sortable.Grid
            columns={1}
            rowGap={editing ? space.sm : 0}
            data={rows}
            keyExtractor={(r) => r.id}
            // 스크롤·누름과 헷갈리지 않게 조금 더 길게 눌러야 끌린다
            dragActivationDelay={600}
            activeItemScale={1.03}
            // 다른 칸을 반투명하게 하면 카드 뒤의 삭제 버튼이 비쳐 보이므로 그대로 둔다
            inactiveItemOpacity={1}
            // 끄는 동안 바탕은 비우고 장소 카드와 번호만 떠서 움직인다
            activeItemShadowOpacity={0}
            onDragEnd={({ data }) => void onDragEnd(data)}
            renderItem={({ item }) => (
              <View onLayout={(e) => (rowHeights.current[item.id] = e.nativeEvent.layout.height)}>{renderRow(item)}</View>
            )}
          />
          </View>
          {rows.length > 1 && <Txt kind="small">{t('day.dragHint')}</Txt>}

          {!editing && hidden.length > 0 && (
            <View style={{ gap: space.sm }}>
              <Pressable accessibilityRole="button" onPress={() => setShowHidden(!showHidden)}>
                <Text style={styles.legText}>{`${t('day.hidden', { n: hidden.length })} ${showHidden ? '▴' : '▾'}`}</Text>
              </Pressable>
              {showHidden &&
                hidden.map((s) => (
                  <Card key={s.id} style={styles.hiddenCard} onPress={() => onOpenStop(s.id)}>
                    <Row>
                      <Txt style={{ flex: 1, color: colors.inkSoft }}>{s.name}</Txt>
                      <Chip
                        label={t('stop.unhide')}
                        onPress={async () => {
                          await setSkipped(sv, s, false);
                          changed();
                        }}
                      />
                    </Row>
                  </Card>
                ))}
            </View>
          )}

          {moving && (
            <Card>
              <Txt>{t('day.moveToTitle')}</Txt>
              <Row style={{ flexWrap: 'wrap' }}>
                {days.map((d, i) => d.id !== day.id && <Chip key={d.id} label={t('day.label', { n: i + 1 })} onPress={() => void moveTo(d)} />)}
                <Chip label={t('common.cancel')} onPress={() => setMoving(null)} />
              </Row>
            </Card>
          )}
        </>
      )}
    </>
  );

  return (
    <View style={styles.fill} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {wide ? (
        // 펼친 폴더블(아이폰 듀오)·큰 화면: 일정은 왼쪽 판, 지도는 오른쪽에 나란히
        <View style={styles.split} testID="split-layout">
          <View style={[styles.panel, { width: panelWidth }]}>
            {header}
            <ScrollView contentContainerStyle={styles.sheet} onScroll={follow} scrollEventThrottle={32}>
              {panel}
            </ScrollView>
          </View>
          <View style={{ flex: 1 }}>{mapView}</View>
        </View>
      ) : (
        <>
          <View style={StyleSheet.absoluteFill}>{mapView}</View>
          <BottomSheet
            ref={sheet}
            snapPoints={[collapsed, Math.round(height * MIDDLE), Math.round(height)]}
            index={1}
            onChange={(i) => i >= 0 && setSheetIndex(i)}
            enableDynamicSizing={false}
            // 시트 크기는 손잡이로만 바꾸고, 안쪽은 어느 높이에서나 일정을 스크롤한다
            enableContentPanningGesture={false}
            handleStyle={styles.handle}
            // 옆으로 미는 동작(카드 밀어서 삭제)은 시트가 가져가지 않게 한다
            activeOffsetY={[-12, 12]}
            failOffsetX={[-8, 8]}
            backgroundStyle={styles.sheetBg}
            handleIndicatorStyle={{ backgroundColor: colors.line, width: 44 }}
          >
            {header}
            {/* 시트가 절반이면 아래 절반은 화면 밖이라, 그만큼 여백을 더해 마지막 장소까지 올려 볼 수 있게 한다 */}
            <BottomSheetScrollView contentContainerStyle={[styles.sheet, { paddingBottom: 120 + (sheetIndex === 1 ? Math.round(height * (1 - MIDDLE)) : 0) }]} onScroll={follow}>
              {panel}
            </BottomSheetScrollView>
          </BottomSheet>
        </>
      )}

      {noteFor && (
        <SheetModal
          title={`${t('note.addTitle')} · ${noteFor.name}${noteNext ? ` → ${noteNext.name}` : ''}`}
          onClose={() => setNoteFor(null)}
          footer={
            <Row>
              <Chip label={t('note.add')} selected onPress={() => void saveNewNotes(noteFor)} />
              <Chip label={t('common.cancel')} onPress={() => setNoteFor(null)} />
            </Row>
          }
        >
          <Checklist items={noteDraft} onChange={setNoteDraft} onDraft={setNoteTyping} editable placeholder={t('leg.notePlaceholder')} autoFocus />
        </SheetModal>
      )}

      {day && view === 'plan' && (
        <Pressable accessibilityRole="button" accessibilityLabel={t('day.addStop')} onPress={() => onAddStop(day.id)} style={({ pressed }) => [styles.fab, !wide && sheetIndex === 0 && { bottom: collapsed + space.md }, pressed && { opacity: 0.7 }]}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

function MapButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.mapButton, pressed && { opacity: 0.7 }]}>
      <Text style={styles.mapButtonText}>{label}</Text>
    </Pressable>
  );
}

function Dot({ index }: { index: number }) {
  return (
    <View style={[styles.dot, { backgroundColor: stopColor(index) }]}>
      <Text style={styles.dotText}>{index + 1}</Text>
    </View>
  );
}

/** 타임라인 왼쪽 세로줄. 위·아래 반쪽을 따로 그려 첫·마지막 칸에서 줄이 끊기게 한다. */
/** 왼쪽 세로 자리 (번호·점·거리). 연결선은 목록 뒤에 따로 고정해 그린다. */
function Rail({ children }: { children?: ReactNode }) {
  return <View style={styles.rail}>{children}</View>;
}

/** 끌리는 장소에서는 투명해져 따라가지 않는 것처럼 보이는 부분 (아래 구간 줄) */
function StayPut({ children }: { children: ReactNode }) {
  const { isActive, activationAnimationProgress } = useItemContext();
  const style = useAnimatedStyle(() => ({ opacity: isActive.value ? 1 - activationAnimationProgress.value : 1 }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

type StopRowProps = {
  stop: Stop;
  index: number;
  selected: boolean;
  thumb: ReactNode;
  /** 줄 높이를 알려 준다 (고정 연결선의 시작·끝 맞추기, 스크롤 따라 지도 옮기기) */
  onLayoutHeight?: (h: number) => void;
  /** 예약 정보 한 줄 (편명·게이트·좌석 등) */
  info: string;
  /** 누르면 장소 자세히 */
  onOpen: () => void;
  onCheck: (items: CheckItem[]) => void;
  /** 왼쪽으로 밀어 나온 삭제 버튼 */
  onDelete: () => void;
};

function StopRow({ stop, index, selected, thumb, info, onOpen, onCheck, onDelete, onLayoutHeight }: StopRowProps) {
  const plan = parseChecklist(stop.planNote);
  // 도착하면 예정 시간 대신 도착 시간을 보여 준다 (예정 시간은 장소 화면의 계획에 남는다).
  const time = stop.arrivedAt ? t('stop.arrivedAt', { time: formatTime(stop.arrivedAt) }) : stop.plannedTime;
  return (
    <View style={styles.row} onLayout={onLayoutHeight && ((e) => onLayoutHeight(e.nativeEvent.layout.height))}>
      <Rail>
        <Dot index={index} />
      </Rail>
      <View style={{ flex: 1 }}>
        <SwipeRow label={stop.name} onDelete={onDelete}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${stop.name} ${t('day.openStop')}`}
            onPress={onOpen}
            style={({ pressed }) => [styles.stopCard, selected && styles.stopCardOn, pressed && { opacity: 0.8 }]}
          >
            {thumb}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.stopName} numberOfLines={2}>
                {stop.name}
              </Text>
              {time ? <Text style={[styles.stopSub, stop.arrivedAt && styles.arrived]}>{time}</Text> : null}
              {info !== '' && <Text style={styles.info}>{info}</Text>}
              {plan.length > 0 && (
                <View style={styles.planNote}>
                  <Checklist items={plan} onChange={onCheck} max={4} compact />
                </View>
              )}
            </View>
            <Text style={styles.chevronText}>›</Text>
          </Pressable>
        </SwipeRow>
      </View>
    </View>
  );
}

/** 이동 메모 카드. 세로줄 위에 따로 점을 찍지 않고 카드만 둔다. */
function NoteRow({ children, onPress, label, name, onDelete, onLayoutHeight }: { children: ReactNode; onPress?: () => void; label?: string; name: string; onDelete: () => void; onLayoutHeight?: (h: number) => void }) {
  return (
    <View style={styles.row} onLayout={onLayoutHeight && ((e) => onLayoutHeight(e.nativeEvent.layout.height))}>
      <Rail />
      <View style={{ flex: 1 }}>
        <SwipeRow label={name} onDelete={onDelete}>
          <Pressable accessibilityLabel={label} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.noteCard, pressed && { opacity: 0.8 }]}>
            {children}
          </Pressable>
        </SwipeRow>
      </View>
    </View>
  );
}

/**
 * 두 장소 사이 구간. 왼쪽 줄 위의 거리를 누르면 구글 지도 길 안내가 열린다.
 * 이동 수단(도보·대중교통·차)은 세로로 쌓고, 그 오른쪽에 이동 메모를 더하는 칸을 둔다.
 */
function LegRow({ leg, status, selected, onPress, onMode, onRetry, onAddNote, onDirections }: { leg: Leg; status: LegStatus | undefined; selected: boolean; onPress: () => void; onMode: (m: TravelMode) => void; onRetry: () => void; onAddNote: () => void; onDirections: () => void }) {
  const option = selectedOption(leg);
  const loading = status === 'loading';
  const failed = status === 'offline' || status === 'error';
  const distance = option && !loading ? formatDistance(option.distanceMeters) : failed ? '—' : '…';
  const info = loading
    ? t('map.routeLoading')
    : option
      ? t('leg.minutes', { min: Math.round(option.durationSeconds / 60) })
      : status === 'offline'
        ? t('map.routeOffline')
        : status === 'error'
          ? t('map.routeError')
          : t('map.routeLoading');
  return (
    <View style={styles.row}>
      <Rail>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${distance} ${leg.mode === 'transit' ? t('leg.transitInfo') : t('leg.navigate')}`}
          onPress={onDirections}
          hitSlop={8}
          style={({ pressed }) => [styles.pill, selected && styles.pillOn, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.pillText, selected && { color: colors.card }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{`${distance} ↗`}</Text>
        </Pressable>
      </Rail>
      <View style={styles.legBody}>
        <View style={styles.modes} accessibilityRole="radiogroup">
          {MODES.map((m) => {
            const on = leg.mode === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t(`mode.${m}`)}
                onPress={() => !on && onMode(m)}
                style={[styles.mode, on && styles.modeOn]}
              >
                <Text style={[styles.modeText, on && styles.modeTextOn]}>{t(`mode.${m}`)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onPress} hitSlop={6}>
          <Text style={styles.legText}>{info}</Text>
        </Pressable>
        {failed && (
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={6}>
            <Text style={styles.retry}>{t('common.retry')}</Text>
          </Pressable>
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('leg.addNote')} onPress={onAddNote} style={({ pressed }) => [styles.addNote, pressed && { opacity: 0.7 }]}>
        <Text style={styles.addNotePlus}>+</Text>
        <Text style={styles.addNoteText}>{t('leg.note')}</Text>
      </Pressable>
    </View>
  );
}

const RAIL = 64;
const DOT = 30;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  split: { flex: 1, flexDirection: 'row' },
  panel: { backgroundColor: colors.paper, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  mapButtons: { position: 'absolute', right: space.md, top: space.md, flexDirection: 'row', gap: space.sm },
  mapButton: { paddingVertical: space.xs + 2, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  mapButtonText: { fontSize: fonts.size.xs, fontWeight: '600', color: colors.ink },
  handle: { height: HANDLE, paddingVertical: 0, justifyContent: 'center' },
  sheetBg: { backgroundColor: colors.paper, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4 },
  sheet: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: 120, gap: space.md },
  header: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: RAIL, alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', width: 2, left: RAIL / 2 - 1, backgroundColor: colors.line },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: colors.card, fontWeight: '700', fontSize: fonts.size.sm },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginVertical: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stopCardOn: { borderColor: colors.ink, borderWidth: 2 },
  stopName: { fontSize: fonts.size.md + 1, fontWeight: '700', color: colors.ink },
  stopSub: { fontSize: fonts.size.sm, color: colors.inkSoft },
  arrived: { color: colors.ok, fontWeight: '600' },
  info: { fontSize: fonts.size.xs, color: colors.route, fontWeight: '600' },
  planNote: { marginTop: space.xs },
  chevronText: { fontSize: fonts.size.lg, color: colors.inkSoft },
  pill: { maxWidth: RAIL - 4, paddingVertical: 3, paddingHorizontal: space.xs + 2, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  pillOn: { backgroundColor: colors.route, borderColor: colors.route },
  pillText: { fontSize: fonts.size.xs, fontWeight: '600', color: colors.ink },
  legBody: { paddingVertical: space.sm, gap: space.xs + 2, alignItems: 'flex-start' },
  mode: { paddingVertical: 5, paddingHorizontal: space.md, borderRadius: radius.md },
  modeOn: { backgroundColor: colors.ink },
  modeText: { fontSize: fonts.size.xs, color: colors.inkSoft, fontWeight: '600' },
  modeTextOn: { color: colors.card },
  retry: { fontSize: fonts.size.xs, color: colors.accent, fontWeight: '700' },
  legText: { fontSize: fonts.size.sm, color: colors.inkSoft },
  addNote: { flex: 1, alignSelf: 'stretch', marginVertical: space.sm, marginLeft: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, gap: 2 },
  addNotePlus: { fontSize: 22, lineHeight: 24, color: colors.ink, fontWeight: '300' },
  addNoteText: { fontSize: 11, color: colors.inkSoft, fontWeight: '600' },
  noteMemo: { fontSize: fonts.size.xs, color: colors.inkSoft, marginLeft: 24 },
  noteCard: { flexDirection: 'row', alignItems: 'center', marginVertical: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, gap: space.sm, borderWidth: 1, borderColor: colors.line },
  modes: { flexDirection: 'column', padding: 2, gap: 2, borderRadius: radius.md + 2, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  hiddenCard: { padding: space.md, borderStyle: 'dashed' },
  editCard: { padding: space.md },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.xxl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: colors.card, fontSize: 32, lineHeight: 36, fontWeight: '400' },
});

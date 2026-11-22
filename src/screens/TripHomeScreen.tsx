import BottomSheet, { BottomSheetScrollView, type BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Animated, { Extrapolation, FadeIn, FadeInLeft, FadeOut, interpolate, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming, ZoomIn, ZoomOut } from 'react-native-reanimated';
import Sortable, { useItemContext } from 'react-native-sortables';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { bookingLine } from '@/domain/bookings';
import { parseChecklist, serializeChecklist, type CheckItem } from '@/domain/checklist';
import { summarizeExpenses } from '@/domain/expenses';
import { removeStop } from '@/domain/itinerary';
import type { Booking, Leg, Note, SeqItem, Stop, Trip, TravelMode } from '@/domain/types';
import { t } from '@/i18n/ko';
import { DayMap, type DayMapHandle } from '@/map/DayMap';
import { directionsUrl } from '@/map/directions';
import { selectedOption, type LegStatus } from '@/map/legRoutes';
import { allPoints, targetOf, type Selection } from '@/map/points';
import { useLegRoutes } from '@/map/useLegRoutes';
import { saveDay, saveOrder, setSkipped } from '@/state/itineraryOps';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, fonts, glow, gradients, radius, space, stopColor } from '@/theme/tokens';
import { Checklist } from '@/ui/Checklist';
import { askWhenInUse, whereAmI } from '@/location/permissions';
import { Text } from '@/ui/Text';
import { formatAmounts, formatDistance, formatKm, formatTime } from '@/ui/format';
import { Card, Chip, Row, Txt } from '@/ui/kit';
import { PlaceThumb } from '@/ui/PlaceVisual';
import { SwipeRow } from '@/ui/SwipeRow';
import { SwipeToggle } from '@/ui/SwipeToggle';

import { DiaryDay, type DiaryEntry } from './DiaryDay';

type Props = {
  tripId: string;
  /** 장소 추가 화면을 연다. afterStopId 를 주면 그 장소(와 딸린 이동 메모) 바로 뒤에 넣는다. */
  onAddStop: (dayId: string, afterStopId?: string) => void;
  /** 교통 추가 페이지를 연다 (그날 날짜를 출발일로) */
  onAddTransport?: (dayId: string, date: string) => void;
  /** 이동 메모 추가 페이지를 연다. afterStopId 장소(와 딸린 메모) 바로 뒤에 넣는다. */
  onAddNote?: (dayId: string, afterStopId: string) => void;
  onOpenStop: (stopId: string) => void;
  /** 이동 메모 화면을 연다 */
  onOpenNote?: (noteId: string) => void;
  onExpenses: () => void;
  onSettings: () => void;
  /** 여행을 읽었을 때 한 번 불린다 (머리글 제목용). */
  onTrip?: (trip: Trip) => void;
  /** 지도 위에 띄우는 여행 이름 막대. 시트를 내리면 위로 밀려 올라가 지도가 화면을 채운다. */
  topBar?: (trip: Trip) => ReactNode;
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
const MIDDLE = 0.58;
/** 이 너비부터 일정 판과 지도를 나란히 둔다 (펼친 아이폰 듀오는 669pt) */
const WIDE = 600;

type Item = { kind: 'stop'; id: string; stop: Stop; index: number } | { kind: 'note'; id: string; note: Note };

export function TripHomeScreen({
  tripId,
  onAddStop,
  onAddTransport = () => {},
  onAddNote = () => {},
  onOpenStop,
  onOpenNote = () => {},
  onTrip,
  topBar,
  refreshKey = 0,
  today,
  openUrl = (url) => void Linking.openURL(url),
  resolvePhoto = (u) => u,
}: Props) {
  const sv = useServices();
  const { repo } = sv;
  const { data: trip } = useLoad(() => repo.getTrip(tripId), [tripId, refreshKey]);
  // 설정에서 여행 날짜를 바꾸고 돌아오면 날 목록도 다시 읽는다
  const { data: days } = useLoad(() => repo.listDays(tripId), [tripId, refreshKey]);
  const { data: expenses } = useLoad(() => repo.listExpenses(tripId), [tripId, refreshKey]);
  const [pickedDay, setDayId] = useState<string>();
  // 고른 날이 없으면 여행 중인 오늘, 아니면 첫날을 연다.
  const dayId = (pickedDay && days?.some((d) => d.id === pickedDay) ? pickedDay : undefined) ?? (days?.find((d) => d.date === today) ?? days?.[0])?.id;
  const [selection, setSelection] = useState<Selection>(null);
  // 날마다 고른 보기. 정하지 않았으면 지난 날은 일기, 아니면 계획.
  const [viewOf, setViewOf] = useState<Record<string, 'plan' | 'diary'>>({});
  const map = useRef<DayMapHandle>(null);
  // 그날 방문지가 지금 지도에 다 보이면 "한눈에 보기" 버튼을 숨긴다
  const screen = useWindowDimensions();
  const [height, setHeight] = useState(screen.height * 0.85);
  const [sheetIndex, setSheetIndex] = useState(1);
  // 내린 시트도 아이폰 홈 인디케이터와 겹치지 않게 그 위로 넉넉히 띄운다
  const bottomSafe = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  // 가장 내렸을 때도 날짜 탭은 다 보이게: 손잡이 + 날짜 탭 줄 높이(잰 값) + 위아래 여백 + 홈 인디케이터
  const [tabsH, setTabsH] = useState(80);
  const collapsed = HANDLE + space.xs + tabsH + space.sm + Math.max(bottomSafe, space.md);
  const topSafe = useContext(SafeAreaInsetsContext)?.top ?? 0;
  // 여행 이름 막대: 시트가 절반일 때는 보이고, 시트를 내릴수록 같이 위로 올라가 사라진다
  const [barH, setBarH] = useState(0);
  // 추가 모드: 오른쪽 아래 + 를 누르면 장소 사이·목록 끝의 + 가 나타난다. 평소엔 숨긴다.
  const [adding, setAdding] = useState(false);
  const fabTurn = useAnimatedStyle(() => ({
    transform: [{ rotate: withSpring(adding ? '45deg' : '0deg', { damping: 14 }) }],
  }));
  // 지도 앱처럼 '내 위치로' 버튼. 일정 시트 바로 위 오른쪽에 붙어 시트와 함께 오르내린다.
  const goToMe = async () => {
    if (!(await askWhenInUse())) {
      Alert.alert(t('map.noLocation'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('map.openSettings'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    const me = await whereAmI();
    if (me) map.current?.send({ type: 'goToMe', me });
    else Alert.alert(t('map.noFix'));
  };
  // 안내 말풍선은 + 버튼 뒤에서 왼쪽으로 펼쳐진다
  const hintStyle = useAnimatedStyle(() => ({ width: withTiming(adding ? HINT_W : 0, { duration: 260 }), opacity: withTiming(adding ? 1 : 0, { duration: 160 }) }));
  // 시트를 절반에서 아래로 내릴수록 위 버튼들이 함께 위로 밀려 사라지고, 지도가 화면을 다 채운다
  const sheetPos = useSharedValue(0);
  const barStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(sheetPos.value, [height * (1 - MIDDLE), height - collapsed], [0, -barH], Extrapolation.CLAMP),
      },
    ],
  }));
  // 내 위치로 버튼은 시트 윗변 바로 위에 붙어 함께 오르내린다. 시트를 끝까지 올리면 숨긴다.
  const meStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetPos.value - ME - space.md }], opacity: sheetPos.value < barH + ME * 2 ? 0 : 1 }));
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
    const due = bookings.filter((b) => b.kind === 'flight' && (b.departDate === today || b.arriveDate === today) && (!b.checkedAt || Date.now() - Date.parse(b.checkedAt) > 10 * 60000));
    if (!due.length) return;
    let alive = true;
    (async () => {
      for (const b of due) {
        const info = await sv.flights.today(b.title).catch(() => null);
        const dep = info?.direction === 'departure';
        const next: Booking = {
          ...b,
          checkedAt: new Date().toISOString(),
          ...(info && dep
            ? {
                gate: info.gate ?? b.gate,
                terminal: info.terminal ?? b.terminal,
                checkin: info.checkin,
                status: info.status,
                estimated: info.estimated,
              }
            : {}),
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
    setAdding(false);
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
  // 칸 높이가 바뀌면 이동 수단 칸(목록 위에 겹쳐 그림)을 다시 맞춘다. 끄는 동안에는 숨긴다.
  const [measured, setMeasured] = useState<{
    row: Record<string, number>;
    stop: Record<string, number>;
  }>({ row: {}, stop: {} });
  const [dragging, setDragging] = useState(false);
  const keepHeight = (which: 'row' | 'stop', id: string, h: number) => {
    (which === 'row' ? rowHeights : stopHeights).current[id] = h;
    setMeasured((m) => (Math.abs((m[which][id] ?? -1) - h) < 0.5 ? m : { ...m, [which]: { ...m[which], [id]: h } }));
  };
  const followed = useRef<string | null>(null);
  const follow = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!day || (viewOf[day.id] ?? (past0 ? 'diary' : 'plan')) !== 'plan') return;
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

  if (!trip || !days) return <View style={styles.fill} />;

  const summary = expenses ? summarizeExpenses(expenses, trip) : undefined;
  const unconverted = summary && day ? formatAmounts(summary.unconvertedByDate[day.date]) : '';
  const meters = legs.reduce((sum, l) => sum + (selectedOption(l)?.distanceMeters ?? 0), 0);
  // 화면이 넓으면 (펼친 아이폰 듀오 669pt, 가로 화면) 일정과 지도를 나란히 둔다
  const wide = screen.width >= WIDE;
  const panelWidth = Math.min(420, Math.max(340, Math.round(screen.width * 0.5)));
  // 지도 여백은 시트 높이와 상관없이 늘 '절반 시트' 기준으로 둔다. 바꾸면 구글 지도가 화면을 옮겨 버리므로,
  // 시트를 내리거나 올려도 지도는 있던 자리 그대로 있다.
  const inset = Math.round(height * MIDDLE);
  // 위 버튼들이 떠 있을 때는 지도 경로를 그 아래부터 맞춘다
  const mapTop = wide || !topBar ? 0 : barH;
  const bar = topBar ? topBar(trip) : null;
  const past = !!day && !!today && day.date < today;
  const view = (day && viewOf[day.id]) ?? (past ? 'diary' : 'plan');
  const photosOf = (stopId: string) => photos.filter((p) => p.stopId === stopId && !p.noteId);
  const bookingOf = (s: Stop) => (s.bookingId ? bookings.find((b) => b.id === s.bookingId) : undefined);

  // 첫 줄과 마지막 줄은 높이를 재어 고정 연결선의 시작·끝을 맞춘다
  /**
   * 구간마다 이동 수단 칸을 그릴 자리: 앞 장소 카드 바로 아래부터 다음 장소 칸 바로 위까지.
   * 칸 높이는 재어 둔 값(measured)으로 셈한다.
   */
  const legSpans = (() => {
    const out: { leg: Leg; top: number; height: number; measured: boolean }[] = [];
    let y = 0;
    let open: { leg: Leg; top: number } | null = null;
    // 아직 높이를 재지 않은 칸이 있으면 자리를 모르니 보이지 않게만 그려 둔다
    const known = rows.every((r) => measured.row[r.id] !== undefined);
    for (const r of rows) {
      const h = measured.row[r.id] ?? 0;
      if (r.kind === 'stop') {
        if (open)
          out.push({
            ...open,
            // 카드끼리 붙어 있으면 경계 가운데에 걸쳐 그린다
            ...(y - open.top >= LEG_LABEL ? { height: y - open.top } : { top: open.top + (y - open.top) / 2 - LEG_LABEL / 2, height: LEG_LABEL }),
            measured: known,
          });
        open = null;
        const leg = legs.find((l) => l.fromStopId === r.id);
        const stopH = measured.stop[r.id] ?? h;
        if (leg && rows.slice(rows.indexOf(r) + 1).some((x) => x.kind === 'stop')) open = { leg, top: y + stopH };
      }
      y += h;
    }
    return out;
  })();
  // 세로줄은 이동 구간 표시 자리만 비우고 조각조각 그린다 (표시에 박스를 깔지 않으므로).
  // 높이를 다 재기 전이나 끄는 중에는 한 줄로 잇는다.
  const railPieces = (() => {
    const known = rows.every((r) => measured.row[r.id] !== undefined);
    if (!known || dragging) return null;
    const total = rows.reduce((sum, r) => sum + (measured.row[r.id] ?? 0), 0);
    const from = ends.top;
    const to = total - ends.bottom;
    const gaps = legSpans.map((sp) => sp.top + sp.height / 2).sort((a, b) => a - b);
    const pieces: { top: number; height: number }[] = [];
    let y = from;
    for (const c of gaps) {
      const a = c - LEG_LABEL / 2;
      if (a > y) pieces.push({ top: y, height: a - y });
      y = Math.max(y, c + LEG_LABEL / 2);
    }
    if (to > y) pieces.push({ top: y, height: to - y });
    return pieces;
  })();
  const endMeasure = (r: Item) => {
    const i = rows.indexOf(r);
    if (i === 0 && i === rows.length - 1) return undefined;
    if (i === 0) return (h: number) => measure('top', h);
    if (i === rows.length - 1) return (h: number) => measure('bottom', h);
    return undefined;
  };

  /** 이 칸 앞쪽에서 가장 가까운 장소. 그 장소에서 출발하는 구간이 있으면 함께 돌려준다. */
  const legBefore = (i: number) => {
    for (let j = i - 1; j >= 0; j--) {
      const p = rows[j];
      if (p.kind === 'stop') return legs.some((l) => l.fromStopId === p.id) ? p.stop : undefined;
    }
    return undefined;
  };

  const renderRow = (r: Item) => {
    const at = rows.indexOf(r);
    const next = rows[at + 1];
    if (r.kind === 'note') {
      const n = r.note;
      // 구간의 마지막 메모 아래에 "+ 메모"를 둔다 (메모가 없으면 장소 바로 아래에 둔다)
      const legStop = next?.kind === 'stop' ? legBefore(at) : undefined;
      return (
        <View>
          {/* 이동 메모는 장소와 같은 급의 카드. 누르면 메모 화면(기록·사진·비용)이 열린다. */}
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
          {legStop && (
            <StayPut>
              <LegRow
                compact
                show={adding}
                onAddPlace={() => day && onAddStop(day.id, legStop.id)}
                onAddTransport={() => day && onAddTransport(day.id, day.date)}
                onAddNote={() => day && onAddNote(day.id, legStop.id)}
              />
            </StayPut>
          )}
        </View>
      );
    }
    const s = r.stop;
    const leg = legs.find((l) => l.fromStopId === s.id);
    const booking = bookingOf(s);
    return (
      <View>
        <StopRow
          onDelete={() => removeStopAsk(s)}
          stop={s}
          index={r.index}
          onLayoutHeight={(h) => {
            keepHeight('stop', s.id, h);
            endMeasure(r)?.(h);
          }}
          selected={selection?.type === 'stop' && selection.id === s.id}
          thumb={<PlaceThumb stop={s} photos={photosOf(s.id)} resolvePhoto={resolvePhoto} />}
          info={booking ? bookingLine(booking, s.name) : ''}
          onOpen={() => onOpenStop(s.id)}
            onFocus={() => select({ type: 'stop', id: s.id })}
          onCheck={(items) => void checkPlan(s, items)}
        />
        {leg && next?.kind !== 'note' && (
          <StayPut>
            <LegRow show={adding} onAddPlace={() => day && onAddStop(day.id, s.id)} onAddTransport={() => day && onAddTransport(day.id, day.date)} onAddNote={() => day && onAddNote(day.id, s.id)} />
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
          topInset={mapTop}
        />
      )}
    </>
  );
  const switchView = (next: 'plan' | 'diary') => {
    if (!day) return;
    setViewOf({ ...viewOf, [day.id]: next });
    // 일기는 누르면 화면 가득 펼쳐 읽고, 계획으로 돌아오면 지도와 반반
    sheet.current?.snapToIndex(next === 'diary' ? 2 : 1);
  };
  // 계획 | 일기 토글: 계획에서는 지난 날이면 장소 목록 맨 위(먼저 볼 것), 아니면 맨 아래. 일기에서는 맨 위.
  const viewToggle = (where: 'top' | 'bottom') => (
    <SwipeToggle
      options={[
        { value: 'plan', label: t('day.plan'), accessibilityLabel: t('day.planView') },
        { value: 'diary', label: t('day.diary'), accessibilityLabel: t('day.diaryView') },
      ]}
      value={view}
      onChange={switchView}
      style={where === 'top' ? styles.diaryTop : styles.diaryBottom}
    />
  );
  // 날짜 탭과 그날 요약은 스크롤하지 않고 위에 고정한다
  const header = (
    <View style={styles.header}>
      <View style={styles.tabs} onLayout={(e) => setTabsH(Math.round(e.nativeEvent.layout.height))}>
        {/* 고른 날의 그림자가 잘리지 않게, 여백을 스크롤 안쪽에 둔다 (화면 끝까지 스크롤되고 그림자도 끊기지 않는다) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll} style={{ flex: 1 }}>
          {days.map((d, i) => (
            <DayTile key={d.id} date={d.date} n={i + 1} selected={d.id === dayId} onPress={() => changeDay(d.id)} />
          ))}
        </ScrollView>
      </View>
      {day && view === 'plan' && unconverted !== '' && <Txt kind="soft" style={{ paddingHorizontal: space.lg }}>{`${t('expense.unconverted')}: ${unconverted}`}</Txt>}
    </View>
  );
  const panel = (
    <>
      {day && view === 'diary' && viewToggle('top')}
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
            <Card tone="well">
              <Txt kind="soft">{t('day.empty')}</Txt>
            </Card>
          )}

          {past && viewToggle('top')}

          {/* 길게 눌러 끌면 장소와 이동 메모의 순서를 함께 바꾼다. 왼쪽으로 밀면 삭제. */}
          <View style={styles.railShift} onLayout={(e) => (gridTop.current = e.nativeEvent.layout.y)}>
            {rows.length > 1 &&
              (railPieces ? (
                railPieces.map((p) => <View key={p.top} pointerEvents="none" style={[styles.railLine, { top: p.top, height: p.height }]} />)
              ) : (
                <View pointerEvents="none" style={[styles.railLine, { top: ends.top, bottom: ends.bottom }]} />
              ))}
            <Sortable.Grid
              columns={1}
              rowGap={0}
              data={rows}
              keyExtractor={(r) => r.id}
              // 스크롤·누름과 헷갈리지 않게 조금 더 길게 눌러야 끌린다
              dragActivationDelay={600}
              activeItemScale={1.03}
              // 다른 칸을 반투명하게 하면 카드 뒤의 삭제 버튼이 비쳐 보이므로 그대로 둔다
              inactiveItemOpacity={1}
              // 끄는 동안 바탕은 비우고 장소 카드와 번호만 떠서 움직인다
              activeItemShadowOpacity={0}
              onDragStart={() => setDragging(true)}
              onDragEnd={({ data }) => {
                setDragging(false);
                void onDragEnd(data);
              }}
              renderItem={({ item }) => <View onLayout={(e) => keepHeight('row', item.id, e.nativeEvent.layout.height)}>{renderRow(item)}</View>}
            />
            {/* 구간의 거리·이동 수단 칸은 목록 위에 겹쳐 그려, 사이에 든 이동 메모 높이만큼 늘어나게 한다 */}
            {!dragging && (
              <LegColumns
                spans={legSpans}
                status={status}
                selectedLeg={selection?.type === 'leg' ? selection.id : null}
                onSelect={select}
                onMode={setMode}
                onRetry={retry}
                stops={stops}
                openUrl={openUrl}
              />
            )}
          </View>
          {/* 목록 맨 끝에도 같은 + 를 둬서 마지막 장소 뒤·빈 날에도 장소·교통·메모를 넣는다 */}
          {loaded && adding && (
            <View style={styles.railShift}>
              <LegRow
                compact
                show
                title={t('day.addEnd')}
                onAddPlace={() => onAddStop(day.id)}
                onAddTransport={() => onAddTransport(day.id, day.date)}
                onAddNote={stops.length > 0 ? () => onAddNote(day.id, stops[stops.length - 1].id) : undefined}
              />
            </View>
          )}
          {!past && viewToggle('bottom')}
          {rows.length > 1 && <Txt kind="small">{t('day.dragHint')}</Txt>}

          {hidden.length > 0 && (
            <View style={{ gap: space.sm }}>
              <Pressable accessibilityRole="button" onPress={() => setShowHidden(!showHidden)}>
                <Text style={styles.legText}>{`${t('day.hidden', { n: hidden.length })} ${showHidden ? '▴' : '▾'}`}</Text>
              </Pressable>
              {showHidden &&
                hidden.map((s) => (
                  <Card key={s.id} tone="well" style={styles.hiddenCard} onPress={() => onOpenStop(s.id)}>
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
        </>
      )}
    </>
  );

  return (
    <View style={styles.fill} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {wide ? (
        // 펼친 폴더블(아이폰 듀오)·큰 화면: 일정은 왼쪽 판, 지도는 오른쪽에 나란히
        <View style={styles.fill}>
          {bar && <View style={[styles.topBar, { paddingTop: topSafe }]}>{bar}</View>}
          <View style={styles.split} testID="split-layout">
            <View style={[styles.panel, { width: panelWidth }]}>
              {header}
              <ScrollView contentContainerStyle={styles.sheet} onScroll={follow} scrollEventThrottle={32}>
                {panel}
              </ScrollView>
            </View>
            <View style={{ flex: 1 }}>
              {mapView}
              <View style={styles.meWide}>
                <View style={styles.meButton}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('map.goToMe')} onPress={() => void goToMe()} hitSlop={6} style={({ pressed }) => [styles.meTap, pressed && { opacity: 0.6 }]}>
                  <SymbolView name="location.fill" size={20} tintColor={colors.route} fallback={<Text style={{ color: colors.route }}>◎</Text>} />
                </Pressable>
              </View>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={StyleSheet.absoluteFill}>{mapView}</View>
          <Animated.View pointerEvents="box-none" style={[styles.meFloat, meStyle]}>
            <View style={styles.meButton}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('map.goToMe')} onPress={() => void goToMe()} hitSlop={6} style={({ pressed }) => [styles.meTap, pressed && { opacity: 0.6 }]}>
              <SymbolView name="location.fill" size={20} tintColor={colors.route} fallback={<Text style={{ color: colors.route }}>◎</Text>} />
            </Pressable>
          </View>
          </Animated.View>
          <BottomSheet
            ref={sheet}
            // 끝까지 올려도 여행 이름 막대 아래에서 멈춘다
            animatedPosition={sheetPos}
            snapPoints={[collapsed, Math.round(height * MIDDLE), Math.round(height - barH)]}
            index={1}
            onChange={(i) => i >= 0 && setSheetIndex(i)}
            enableDynamicSizing={false}
            // 시트 크기는 손잡이로만 바꾸고, 안쪽은 어느 높이에서나 일정을 스크롤한다
            enableContentPanningGesture={false}
            handleStyle={styles.handle}
            // 옆으로 미는 동작(카드 밀어서 삭제)은 시트가 가져가지 않게 한다
            activeOffsetY={[-12, 12]}
            failOffsetX={[-8, 8]}
            // 반투명 유리: 지도가 시트 아래까지 깔려 있어 흐리게 비친다
            backgroundComponent={SheetGlass}
            handleIndicatorStyle={{ backgroundColor: colors.line, width: 44 }}
          >
            {header}
            {/* 시트가 절반이면 아래 절반은 화면 밖이라, 그만큼 여백을 더해 마지막 장소까지 올려 볼 수 있게 한다 */}
            <BottomSheetScrollView
              contentContainerStyle={[
                styles.sheet,
                {
                  paddingBottom: 120 + (sheetIndex === 1 ? Math.round(height * (1 - MIDDLE)) : 0),
                },
              ]}
              onScroll={follow}
            >
              {panel}
            </BottomSheetScrollView>
          </BottomSheet>
          {bar && (
            <Animated.View pointerEvents="box-none" style={[styles.topBarFloat, { paddingTop: topSafe }, barStyle]} onLayout={(e) => setBarH(Math.round(e.nativeEvent.layout.height))}>
              {bar}
            </Animated.View>
          )}
        </>
      )}
      {day && view === 'plan' && (wide || sheetIndex !== 0) && (
        // 추가 모드 안내: + 버튼 뒤에서 왼쪽으로 펼쳐지는 작은 말풍선
        <Animated.View pointerEvents="none" style={[styles.addHint, hintStyle]}>
          <Text numberOfLines={1} style={styles.addHintText}>
            {t('day.addModeHint')}
          </Text>
        </Animated.View>
      )}
      {day && view === 'plan' && (wide || sheetIndex !== 0) && (
        // 추가 모드 켜고 끄기. 일정 시트를 가장 내리면 가린다. 켜면 + 가 × 로 돌아간다.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={adding ? t('day.addModeDone') : t('day.addMode')}
          onPress={() => setAdding(!adding)}
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <Animated.View style={fabTurn}>
            <Text style={styles.fabText}>+</Text>
          </Animated.View>
        </Pressable>
      )}
    </View>
  );
}

/** 일정 시트 바탕. 위 모서리를 크게 둥글린 흰 면. */
function SheetGlass({ style }: BottomSheetBackgroundProps) {
  return <View pointerEvents="none" style={[style, styles.sheetGlass]} />;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 날짜 탭: 날짜 숫자 위, 요일 아래. 고른 날만 흰 알약에 점 하나. 화면 읽기에는 n일차로 읽힌다. */
function DayTile({ date, n, selected, onPress }: { date: string; n: number; selected: boolean; onPress: () => void }) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('day.label', { n })}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.dayTile, selected && styles.dayTileOn, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.dayNum, selected && styles.dayOn]}>{d}</Text>
      <Text style={[styles.dayWeek, selected && styles.dayOn]}>{weekday}</Text>
      <View style={[styles.dayDot, selected && styles.dayDotOn]} />
    </Pressable>
  );
}

/** 타임라인의 번호 고리. 고른 장소는 차콜로 채운다. */
function Dot({ index, on }: { index: number; on?: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        on && {
          backgroundColor: stopColor(index),
          borderColor: stopColor(index),
        },
      ]}
    >
      <Text style={[styles.dotText, on && styles.dotTextOn]}>{index + 1}</Text>
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
  const style = useAnimatedStyle(() => ({
    opacity: isActive.value ? 1 - activationAnimationProgress.value : 1,
  }));
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
  /** 번호·사진·이름을 누르면 지도를 이 장소로 */
  onFocus: () => void;
  onCheck: (items: CheckItem[]) => void;
  /** 왼쪽으로 밀어 나온 삭제 버튼 */
  onDelete: () => void;
};

function StopRow({ stop, index, selected, thumb, info, onOpen, onFocus, onCheck, onDelete, onLayoutHeight }: StopRowProps) {
  const plan = parseChecklist(stop.planNote);
  // 도착하면 예정 시간 대신 도착 시간을 보여 준다 (예정 시간은 장소 화면의 계획에 남는다).
  const time = stop.arrivedAt ? t('stop.arrivedAt', { time: formatTime(stop.arrivedAt) }) : stop.plannedTime;
  return (
    <View style={styles.row} onLayout={onLayoutHeight && ((e) => onLayoutHeight(e.nativeEvent.layout.height))}>
      <Rail>
        <Pressable accessibilityRole="button" accessibilityLabel={`${stop.name} ${t('day.showOnMap')}`} onPress={onFocus} hitSlop={8}>
          <Dot index={index} on={selected} />
        </Pressable>
      </Rail>
      <View style={{ flex: 1 }}>
        <SwipeRow label={stop.name} onDelete={onDelete}>
          <Pressable
            accessibilityRole="button"
            // 카드(사진·이름)를 누르면 지도가 이 장소로 간다. 자세히 보기는 오른쪽 화살표만.
            accessibilityLabel={`${stop.name} ${t('day.showOnMap')}`}
            onPress={onFocus}
            style={({ pressed }) => [styles.stopCard, selected && styles.stopCardOn, pressed && { opacity: 0.8 }]}
          >
            {thumb}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.stopName, selected && styles.onInk]} numberOfLines={2}>
                {stop.name}
              </Text>
              {time ? <Text style={[styles.stopSub, selected && styles.onInkSoft, stop.arrivedAt && styles.arrived, stop.arrivedAt && selected && styles.arrivedOnInk]}>{time}</Text> : null}
              {info !== '' && <Text style={[styles.info, selected && styles.onInkSoft]}>{info}</Text>}
              {plan.length > 0 && (
                <View style={styles.planNote}>
                  <Checklist items={plan} onChange={onCheck} max={4} compact onDark={selected} />
                </View>
              )}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`${stop.name} ${t('day.openStop')}`} onPress={onOpen} hitSlop={{ top: 16, bottom: 16, left: 12, right: 12 }} style={({ pressed }) => [styles.openTap, pressed && { opacity: 0.5 }]}>
              <Text style={[styles.chevronText, selected && styles.onInk]}>›</Text>
            </Pressable>
          </Pressable>
        </SwipeRow>
      </View>
    </View>
  );
}

/** 이동 메모 카드. 세로줄 위에 따로 점을 찍지 않고 카드만 둔다. 끌어서 어디로든 옮길 수 있다. */
function NoteRow({
  children,
  onPress,
  label,
  name,
  onDelete,
  onLayoutHeight,
}: {
  children: ReactNode;
  onPress?: () => void;
  label?: string;
  name: string;
  onDelete: () => void;
  onLayoutHeight?: (h: number) => void;
}) {
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
 * 두 장소 사이 구간의 목록 칸. 왼쪽 줄 자리는 비워 두고(LegColumn 이 줄 위에 겹쳐 그린다) 오른쪽에 이동 메모 더하기 칸만 둔다.
 */
function LegRow({
  onAddPlace,
  onAddTransport,
  onAddNote,
  compact,
  show,
  title = t('leg.add'),
}: {
  onAddPlace: () => void;
  onAddTransport: () => void;
  onAddNote?: () => void;
  compact?: boolean;
  show?: boolean;
  title?: string;
}) {
  // 동그라미 + 를 누르면 그 자리에서 좌우로 장소·교통·메모가 펼쳐진다. 고르면 그 입력 페이지로 간다.
  // 메모는 앞 장소 뒤에 붙으므로, 장소가 하나도 없는 날에는 메모를 고를 수 없다.
  const [open, setOpen] = useState(false);
  const choices: [string, () => void][] = [
    [t('leg.addPlace'), onAddPlace],
    [t('leg.addTransport'), onAddTransport],
    ...(onAddNote ? [[t('leg.addNoteShort'), onAddNote] as [string, () => void]] : []),
  ];
  // 추가 모드가 아니면 + 없이 이동 구간 자리만 둔다 (메모 뒤 칸은 아예 없다)
  if (!show)
    return compact ? null : (
      <View style={[styles.row, { height: LEG_CLOSED }]}>
        <Rail />
      </View>
    );
  return (
    <Animated.View layout={LinearTransition.duration(220)} entering={FadeIn.duration(220)} style={[styles.row, { minHeight: compact ? LEG_ADD_COMPACT : LEG_ADD }]}>
      <Rail />
      <View style={styles.addWrap}>
        {open ? (
          <View style={styles.addMenu}>
            {choices.map(([label, go], i) => (
              <Animated.View key={label} entering={FadeInLeft.delay(i * 45).duration(200)} exiting={FadeOut.duration(120)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${title}: ${label}`}
                  onPress={() => {
                    setOpen(false);
                    go();
                  }}
                  style={({ pressed }) => [styles.addChoice, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.addChoiceText}>{label}</Text>
                </Pressable>
              </Animated.View>
            ))}
            <Animated.View entering={ZoomIn.delay(choices.length * 45).duration(180)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={() => setOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.addCircle, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.addCircleText}>×</Text>
              </Pressable>
            </Animated.View>
          </View>
        ) : (
          <Animated.View entering={ZoomIn.springify().damping(14)} exiting={ZoomOut.duration(150)}>
            <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => setOpen(true)} hitSlop={8} style={({ pressed }) => [styles.addCircle, pressed && { opacity: 0.6 }]}>
              <Text style={styles.addCircleText}>+</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

/** 구간마다 LegColumn 을 목록 위 제자리에 겹쳐 그린다. 이동 수단 고르기는 한 번에 하나만 펼친다. */
function LegColumns({
  spans,
  status,
  selectedLeg,
  onSelect,
  onMode,
  onRetry,
  stops,
  openUrl,
}: {
  spans: { leg: Leg; top: number; height: number; measured: boolean }[];
  status: Record<string, LegStatus | undefined>;
  selectedLeg: string | null;
  onSelect: (s: NonNullable<Selection>) => void;
  onMode: (legId: string, m: TravelMode) => void;
  onRetry: () => void;
  stops: Stop[];
  openUrl: (url: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {spans.map(({ leg, top, height, measured }) => (
        <LegColumn
          key={leg.id}
          hidden={!measured}
          leg={leg}
          top={top}
          height={height}
          status={status[leg.id]}
          selected={selectedLeg === leg.id}
          open={open === leg.id}
          onToggle={() => {
            setOpen(open === leg.id ? null : leg.id);
            onSelect({ type: 'leg', id: leg.id });
          }}
          onMode={(m) => {
            setOpen(null);
            if (leg.mode !== m) onMode(leg.id, m);
          }}
          onRetry={onRetry}
          onDirections={() => {
            setOpen(null);
            const from = stops.find((x) => x.id === leg.fromStopId);
            const to = stops.find((x) => x.id === leg.toStopId);
            if (from && to) openUrl(directionsUrl(from, to, leg.mode));
          }}
        />
      ))}
    </>
  );
}

const MODE_SYMBOL: Record<TravelMode, SFSymbol> = {
  walk: 'figure.walk',
  transit: 'tram.fill',
  drive: 'car.fill',
};
const MODE_TEXT: Record<TravelMode, string> = {
  walk: '도',
  transit: '대',
  drive: '차',
};

function ModeIcon({ mode, color, size = 14 }: { mode: TravelMode; color: string; size?: number }) {
  return <SymbolView name={MODE_SYMBOL[mode]} size={size} tintColor={color} fallback={<Text style={{ fontSize: size * 0.8, color }}>{MODE_TEXT[mode]}</Text>} />;
}

/**
 * 두 장소를 잇는 줄 위의 구간 버튼 (목록 위에 겹쳐 그린다). 앞 장소 카드 아래부터 다음 장소 카드 위까지의 가운데에 놓인다.
 * 평소에는 이동 수단 아이콘·거리·시간을 담은 버튼 하나. 누르면 옆으로 이동 수단 고르기와 구글 지도 길 안내가 펼쳐진다.
 */
function LegColumn({
  leg,
  status,
  selected,
  top,
  height,
  hidden,
  open,
  onToggle,
  onMode,
  onRetry,
  onDirections,
}: {
  hidden?: boolean;
  leg: Leg;
  status: LegStatus | undefined;
  selected: boolean;
  top: number;
  height: number;
  open: boolean;
  onToggle: () => void;
  onMode: (m: TravelMode) => void;
  onRetry: () => void;
  onDirections: () => void;
}) {
  const option = selectedOption(leg);
  const loading = status === 'loading';
  const failed = status === 'offline' || status === 'error';
  const distance = option && !loading ? formatDistance(option.distanceMeters) : failed ? '—' : '…';
  const time = option && !loading ? t('leg.minutes', { min: Math.round(option.durationSeconds / 60) }) : '';
  const on = selected || open;
  return (
    <View pointerEvents="box-none" style={[styles.legColumn, { top, height }, hidden && { opacity: 0 }, open && { zIndex: 10 }]} testID={`leg:${leg.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t(`mode.${leg.mode}`)} ${distance} ${time} ${t('leg.change')}`}
        onPress={onToggle}
        hitSlop={6}
        style={({ pressed }) => [styles.legButton, on && styles.legButtonOn, pressed && { opacity: 0.8 }]}
      >
        <ModeIcon mode={leg.mode} color={colors.route} />
        <Text style={[styles.legDistance, on && styles.legTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {distance}
        </Text>
        {time !== '' && (
          <Text style={[styles.legTime, on && styles.legTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {time}
          </Text>
        )}
      </Pressable>
      {failed && !open && (
        <Text style={[styles.retry, styles.legRetry]} onPress={onRetry}>
          {t('common.retry')}
        </Text>
      )}
      {open && (
        <View pointerEvents="box-none" style={styles.legMenuWrap}>
          <View style={styles.legMenu}>
            <View style={styles.legModes} accessibilityRole="radiogroup">
              {MODES.map((m) => {
                const sel = leg.mode === m;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={t(`mode.${m}`)}
                    onPress={() => onMode(m)}
                    style={[styles.legMode, sel && styles.modeOn]}
                  >
                    <ModeIcon mode={m} color={sel ? colors.card : colors.inkSoft} />
                    <Text style={[styles.modeText, sel && styles.modeTextOn]}>{t(`mode.${m}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${distance} ${leg.mode === 'transit' ? t('leg.transitInfo') : t('leg.navigate')}`}
              onPress={onDirections}
              style={({ pressed }) => [styles.legNav, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.legNavText}>{leg.mode === 'transit' ? t('leg.transitInfo') : t('leg.navigate')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const RAIL = 66;
/** 번호·세로줄 칸을 화면 왼쪽 끝까지 당긴다. 그러면 번호 왼쪽 여백(화면 끝~번호)과 오른쪽 여백(번호~카드)이 똑같이 (RAIL-30)/2 가 된다 */
const RAIL_SHIFT = 16;
/** 메모가 없을 때 구간 칸 높이 (줄 위 구간 버튼이 들어가는 높이) */
/** 추가 모드에서 + 가 들어갈 만큼 벌어진 구간 높이 */
const LEG_ADD = 60;
const LEG_ADD_COMPACT = 44;
/** 추가 모드가 아닐 때 장소 카드 사이 간격 (카드끼리 거의 붙는다) */
const LEG_CLOSED = 16;
/** 이동 구간 표시(아이콘·거리·시간) 높이. 카드 사이가 이보다 좁으면 경계 가운데에 걸쳐 그린다 */
const LEG_LABEL = 56;
const FAB = 60;
/** 내 위치로 버튼 크기 */
const ME = 44;
const HINT_H = 44;
const HINT_W = 250;
const DOT = 30;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  split: { flex: 1, flexDirection: 'row' },
  panel: {
    backgroundColor: colors.paper,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  topBar: { backgroundColor: colors.paper },
  // 투명해서 뒤의 지도가 보인다. 버튼만 떠 있다.
  topBarFloat: { position: 'absolute', left: 0, right: 0, top: 0 },
  handle: { height: HANDLE, paddingVertical: 0, justifyContent: 'center' },
  sheetGlass: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.card,
    shadowColor: '#6E6AF0',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
  },
  meFloat: { position: 'absolute', top: 0, right: space.lg },
  meWide: { position: 'absolute', right: space.lg, bottom: space.lg },
  meButton: { width: ME, height: ME, borderRadius: ME / 2, backgroundColor: colors.card, ...glow },
  meTap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 자세히 보기 화살표: 작은 글자지만 누르기 쉽게 넓게 잡는다
  openTap: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: space.sm },
  railShift: { marginLeft: -RAIL_SHIFT },
  sheet: {
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: 120,
    gap: space.md,
  },
  header: {
    gap: space.xs,
  },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: space.lg },
  tabsScroll: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm + 2 },
  dayTile: {
    width: 46,
    paddingTop: space.sm,
    paddingBottom: space.xs + 2,
    borderRadius: 23,
    alignItems: 'center',
    gap: 4,
  },
  // 그림자를 작게 해 날짜 줄 안에서 끊기지 않게 한다
  dayTileOn: { backgroundColor: colors.card, shadowColor: colors.brand, shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } },
  dayNum: { fontSize: fonts.size.md, fontWeight: '600', color: colors.inkSoft },
  dayWeek: { fontSize: fonts.size.sm, color: colors.inkSoft },
  dayOn: { color: colors.brand },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  dayDotOn: { backgroundColor: colors.brand },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  diaryTop: { marginBottom: space.md },
  diaryBottom: { marginTop: space.md },
  rail: { width: RAIL, alignItems: 'center', justifyContent: 'center' },
  railLine: {
    position: 'absolute',
    width: 2,
    left: RAIL / 2 - 1,
    backgroundColor: colors.line,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  dotText: { color: colors.ink, fontWeight: '700', fontSize: fonts.size.sm },
  dotTextOn: { color: colors.card },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginVertical: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.well,
    // 평소엔 테두리가 보이지 않고, 고르면 검정 테두리가 생긴다 (두께가 같아 글자가 움직이지 않는다)
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // 고른 장소는 브랜드 오렌지 카드로 뒤집는다
  stopCardOn: { borderColor: 'transparent', backgroundColor: colors.brand, experimental_backgroundImage: gradients.brand },
  onInk: { color: colors.card },
  onInkSoft: { color: colors.onBrandSoft },
  arrivedOnInk: { backgroundColor: colors.card, color: colors.brand },
  stopName: {
    fontSize: fonts.size.md + 1,
    fontWeight: '700',
    color: colors.ink,
  },
  stopSub: { fontSize: fonts.size.sm, color: colors.inkSoft },
  // 도착하면 검정 알약으로 표시한다
  arrived: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    marginVertical: 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    color: colors.card,
    fontWeight: '600',
    fontSize: fonts.size.xs,
  },
  info: { fontSize: fonts.size.xs, color: colors.route, fontWeight: '600' },
  planNote: { marginTop: space.xs },
  chevronText: { fontSize: fonts.size.lg, color: colors.inkSoft },
  pill: {
    maxWidth: RAIL - 4,
    paddingVertical: 3,
    paddingHorizontal: space.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  pillOn: { backgroundColor: colors.route, borderColor: colors.route },
  pillText: { fontSize: fonts.size.xs, fontWeight: '600', color: colors.ink },
  legColumn: {
    position: 'absolute',
    left: 0,
    width: RAIL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 줄을 잠깐 끊고 그 자리에 글자만 둔다: 바탕색으로 세로줄을 가리고 테두리는 없다
  // 줄을 가리는 작은 흰 알약 (시트가 반투명이라 바탕색으로는 가릴 수 없다)
  // 박스 없이 글자만. 세로줄은 이 자리에서 끊어 그린다 (railPieces)
  legButton: {
    width: RAIL - 10,
    alignItems: 'center',
    gap: 0,
    paddingVertical: 4,
  },
  legButtonOn: {},
  legTextOn: { color: colors.route },
  legDistance: { fontSize: 11, fontWeight: '600', color: colors.ink },
  legTime: { fontSize: 11, color: colors.inkSoft },
  legRetry: { marginTop: 4 },
  // 펼친 창은 구간 버튼과 같은 높이 가운데에, 내용만큼만
  legMenuWrap: {
    position: 'absolute',
    left: RAIL,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  legMenu: {
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.md + 2,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  legModes: { flexDirection: 'row', gap: 2 },
  legMode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  legNav: {
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.well,
    alignItems: 'center',
  },
  legNavText: { fontSize: fonts.size.xs, fontWeight: '600', color: colors.ink },
  modeOn: { backgroundColor: colors.brand },
  modeText: {
    fontSize: fonts.size.xs,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  modeTextOn: { color: colors.card },
  retry: { fontSize: fonts.size.xs, color: colors.accent, fontWeight: '700' },
  legText: { fontSize: fonts.size.sm, color: colors.inkSoft },
  // 두 장소 사이에 더하기: 장소 카드 가운데에 맞춘 작은 동그라미 +. 이동 정보보다 눈에 띄지 않게 한다
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.xxl,
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow,
  },
  addHint: {
    position: 'absolute',
    right: space.lg + FAB / 2,
    bottom: space.xxl + (FAB - HINT_H) / 2,
    height: HINT_H,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: FAB / 2 + space.sm,
    borderTopLeftRadius: HINT_H / 2,
    borderBottomLeftRadius: HINT_H / 2,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  // 펼쳐지는 동안 글자가 줄바꿈되지 않게 폭을 고정한다
  addHintText: { width: HINT_W - FAB / 2 - space.sm - space.lg, fontSize: fonts.size.sm, fontWeight: '600', color: colors.ink, textAlign: 'right' },
  fabText: {
    color: colors.brand,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '400',
  },
  addWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  addCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  addCircleText: { fontSize: 22, lineHeight: 24, color: colors.brand },
  addMenu: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  addChoice: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.well,
  },
  addChoiceText: {
    fontSize: fonts.size.md,
    fontWeight: '600',
    color: colors.ink,
  },
  noteMemo: { fontSize: fonts.size.xs, color: colors.inkSoft, marginLeft: 24 },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    gap: space.sm,
  },
  hiddenCard: { padding: space.md, borderStyle: 'dashed' },
});

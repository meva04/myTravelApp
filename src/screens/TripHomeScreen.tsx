import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Sortable from 'react-native-sortables';

import { summarizeExpenses } from '@/domain/expenses';
import { moveToDay, removeStop, reorder, syncLegs } from '@/domain/itinerary';
import type { Day, Leg, Stop, Trip, TravelMode } from '@/domain/types';
import { t } from '@/i18n/ko';
import { DayMap, type DayMapHandle } from '@/map/DayMap';
import { selectedOption, type LegStatus } from '@/map/legRoutes';
import { allPoints, targetOf, type Selection } from '@/map/points';
import { useLegRoutes } from '@/map/useLegRoutes';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space, stopColor } from '@/theme/tokens';
import { formatAmounts, formatDistance, formatKm, formatMoney, formatTime } from '@/ui/format';
import { Card, Chip, Row, Txt } from '@/ui/kit';

type Props = {
  tripId: string;
  onAddStop: (dayId: string) => void;
  onOpenMap: (dayId: string) => void;
  onOpenStop: (stopId: string) => void;
  onExpenses: () => void;
  onSettings: () => void;
  /** 여행을 읽었을 때 한 번 불린다 (머리글 제목용). */
  onTrip?: (trip: Trip) => void;
  /** 화면에 다시 돌아왔을 때 바뀌는 값. 바뀌면 다시 불러온다. */
  refreshKey?: number;
  /** 오늘 날짜 'YYYY-MM-DD'. 여행 중이면 그날 탭으로 연다. */
  today?: string;
};

const MODES: TravelMode[] = ['walk', 'transit', 'drive'];
/** 지도가 차지하는 화면 비율. 시트는 그 바로 아래에서 시작한다. */
const MAP_SHARE = 0.42;
const SHEET_OVERLAP = 20;

export function TripHomeScreen({ tripId, onAddStop, onOpenMap, onOpenStop, onTrip, refreshKey = 0, today }: Props) {
  const sv = useServices();
  const { repo } = sv;
  const { data: trip } = useLoad(() => repo.getTrip(tripId), [tripId, refreshKey]);
  const { data: days } = useLoad(() => repo.listDays(tripId), [tripId]);
  const { data: expenses } = useLoad(() => repo.listExpenses(tripId), [tripId, refreshKey]);
  const [pickedDay, setDayId] = useState<string>();
  // 고른 날이 없으면 여행 중인 오늘, 아니면 첫날을 연다.
  const dayId = pickedDay ?? (days?.find((d) => d.date === today) ?? days?.[0])?.id;
  const [moving, setMoving] = useState<Stop | null>(null);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [openLeg, setOpenLeg] = useState<string | null>(null);
  const map = useRef<DayMapHandle>(null);
  const screen = useWindowDimensions();
  const [height, setHeight] = useState(screen.height * 0.85);
  const day = days?.find((d) => d.id === dayId);

  useEffect(() => {
    if (trip) onTrip?.(trip);
  }, [trip, onTrip]);

  // 날짜별 방문지·구간. 빠진 경로는 고른 이동 수단으로 구글에서 받아 채운다.
  const { stops, legs, status, loaded, setMode, retry } = useLegRoutes(dayId, refreshKey);
  const points = useMemo(() => allPoints(stops, legs), [stops, legs]);

  const changeDay = (id: string) => {
    setDayId(id);
    setSelection(null);
    setOpenLeg(null);
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
  const pressStop = (stop: Stop) => {
    // 처음 누르면 지도에서 그 장소로 옮기고, 이미 고른 장소를 다시 누르면 자세히 연다.
    if (selection?.type === 'stop' && selection.id === stop.id) onOpenStop(stop.id);
    else select({ type: 'stop', id: stop.id });
  };
  const pressLeg = (leg: Leg) => {
    setOpenLeg(openLeg === leg.id ? null : leg.id);
    select({ type: 'leg', id: leg.id });
  };

  const saveDay = async (id: string, next: Stop[]) => {
    await repo.saveStops(id, next);
    await repo.saveLegs(id, syncLegs(next, await repo.listLegs(id), sv.newId));
  };
  const changed = () => {
    sv.onItineraryChanged();
    retry();
  };

  const onDragEnd = async (from: number, to: number) => {
    if (!day || !loaded || from === to) return;
    await saveDay(day.id, reorder(stops, from, to));
    changed();
  };
  const remove = (stop: Stop) => {
    Alert.alert(stop.name, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (!day || !loaded) return;
          await saveDay(day.id, removeStop(stops, stop.id));
          changed();
        },
      },
    ]);
  };
  const moveTo = async (target: Day) => {
    if (!day || !moving || !loaded) return;
    // 옮기는 방문지를 먼저 대상 날에 저장해야 사진·비용이 따라간다.
    const r = moveToDay(moving, stops, await repo.listStops(target.id), target.id);
    await saveDay(target.id, r.to);
    await saveDay(day.id, r.from);
    await repo.setExpenseDateForStop(moving.id, target.date);
    setMoving(null);
    changed();
  };

  if (!trip || !days) return <View style={styles.fill} />;

  const summary = expenses ? summarizeExpenses(expenses, trip) : undefined;
  const spent = summary && day ? (summary.byDate[day.date] ?? 0) : 0;
  const unconverted = summary && day ? formatAmounts(summary.unconvertedByDate[day.date]) : '';
  const meters = legs.reduce((sum, l) => sum + (selectedOption(l)?.distanceMeters ?? 0), 0);
  const mapHeight = Math.round(height * MAP_SHARE);

  return (
    <View style={styles.fill} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <View style={{ height: mapHeight }}>
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
          />
        )}
        <View style={[styles.mapButtons, { bottom: SHEET_OVERLAP + space.sm }]}>
          {points.length > 0 && <MapButton label={t('map.fitAll')} onPress={() => map.current?.send({ type: 'fitAll', points })} />}
          {day && <MapButton label={t('map.expand')} onPress={() => onOpenMap(day.id)} />}
        </View>
      </View>

      <BottomSheet
        snapPoints={[Math.max(height - mapHeight + SHEET_OVERLAP, 200), height * 0.92]}
        index={0}
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={{ backgroundColor: colors.line }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheet}>
          <View style={styles.tabs}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flex: 1 }}>
              {days.map((d, i) => (
                <Chip key={d.id} label={t('day.label', { n: i + 1 })} selected={d.id === dayId} onPress={() => changeDay(d.id)} />
              ))}
            </ScrollView>
            {stops.length > 0 && <Chip label={editing ? t('day.editDone') : t('day.edit')} selected={editing} onPress={() => setEditing(!editing)} />}
          </View>

          {day && (
            <>
              <Txt kind="soft">
                {`${day.date} · ${t('day.summary', { stops: stops.length, km: formatKm(meters), spent: formatMoney(spent, trip.baseCurrency) })}`}
              </Txt>
              {unconverted !== '' && <Txt kind="soft">{`${t('expense.unconverted')}: ${unconverted}`}</Txt>}

              {loaded && stops.length === 0 && (
                <Card>
                  <Txt kind="soft">{t('day.empty')}</Txt>
                </Card>
              )}

              {editing ? (
                <>
                  <Sortable.Grid
                    columns={1}
                    rowGap={space.sm}
                    data={stops}
                    keyExtractor={(s) => s.id}
                    onDragEnd={({ fromIndex, toIndex }) => void onDragEnd(fromIndex, toIndex)}
                    renderItem={({ item, index }) => (
                      <Card>
                        <Row>
                          <Dot index={index} />
                          <Txt style={{ flex: 1 }}>{item.name}</Txt>
                        </Row>
                        <Row>
                          {days.length > 1 && <Chip label={t('day.moveTo')} onPress={() => setMoving(item)} />}
                          <Chip label={t('common.delete')} onPress={() => remove(item)} />
                        </Row>
                      </Card>
                    )}
                  />
                  <Txt kind="small">{t('day.dragHint')}</Txt>
                </>
              ) : (
                <View>
                  {stops.map((s, i) => {
                    const leg = legs.find((l) => l.fromStopId === s.id);
                    return (
                      <Fragment key={s.id}>
                        <StopRow
                          stop={s}
                          index={i}
                          first={i === 0}
                          last={!leg}
                          selected={selection?.type === 'stop' && selection.id === s.id}
                          onPress={() => pressStop(s)}
                          onOpen={() => onOpenStop(s.id)}
                        />
                        {leg && (
                          <LegRow
                            leg={leg}
                            status={status[leg.id]}
                            open={openLeg === leg.id}
                            selected={selection?.type === 'leg' && selection.id === leg.id}
                            onPress={() => pressLeg(leg)}
                            onMode={(m) => leg.mode !== m && setMode(leg.id, m)}
                            onRetry={retry}
                          />
                        )}
                      </Fragment>
                    );
                  })}
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
        </BottomSheetScrollView>
      </BottomSheet>

      {day && (
        <Pressable accessibilityRole="button" accessibilityLabel={t('day.addStop')} onPress={() => onAddStop(day.id)} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.7 }]}>
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
function Rail({ top = true, bottom = true, children }: { top?: boolean; bottom?: boolean; children?: ReactNode }) {
  return (
    <View style={styles.rail}>
      <View style={[styles.railLine, styles.railTop, !top && styles.hidden]} />
      <View style={[styles.railLine, styles.railBottom, !bottom && styles.hidden]} />
      {children}
    </View>
  );
}

function StopRow({ stop, index, first, last, selected, onPress, onOpen }: { stop: Stop; index: number; first: boolean; last: boolean; selected: boolean; onPress: () => void; onOpen: () => void }) {
  const sub = [stop.plannedTime, stop.arrivedAt && t('stop.arrivedAt', { time: formatTime(stop.arrivedAt) })].filter(Boolean).join(' · ');
  return (
    <View style={[styles.row, selected && styles.rowOn]}>
      <Rail top={!first} bottom={!last}>
        <Dot index={index} />
      </Rail>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.stopCard, selected && styles.stopCardOn, pressed && { opacity: 0.8 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.stopName}>{stop.name}</Text>
          {sub !== '' && <Text style={styles.stopSub}>{sub}</Text>}
          {stop.memo !== '' && (
            <Text style={styles.stopMemo} numberOfLines={2}>
              {stop.memo}
            </Text>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${stop.name} ${t('day.openStop')}`} onPress={onOpen} hitSlop={12} style={styles.chevron}>
          <Text style={styles.chevronText}>›</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

function LegRow({ leg, status, open, selected, onPress, onMode, onRetry }: { leg: Leg; status: LegStatus | undefined; open: boolean; selected: boolean; onPress: () => void; onMode: (m: TravelMode) => void; onRetry: () => void }) {
  const option = selectedOption(leg);
  const failed = status === 'offline' || status === 'error';
  const distance = option ? formatDistance(option.distanceMeters) : failed ? '—' : '…';
  const info = option
    ? `${t(`mode.${leg.mode}`)} · ${Math.round(option.durationSeconds / 60)}분`
    : status === 'offline'
      ? t('map.routeOffline')
      : status === 'error'
        ? t('map.routeError')
        : t('map.routeLoading');
  return (
    <View>
      <View style={styles.row}>
        <Rail>
          <Pressable accessibilityRole="button" onPress={onPress} style={[styles.pill, selected && styles.pillOn]}>
            <Text style={[styles.pillText, selected && { color: colors.card }]}>{distance}</Text>
          </Pressable>
        </Rail>
        <Pressable onPress={onPress} style={styles.legInfo}>
          <Text style={styles.legText}>{`${info} ${open ? '▴' : '▾'}`}</Text>
        </Pressable>
      </View>
      {open && (
        <View style={styles.row}>
          <Rail />
          <Row style={styles.modes}>
            {MODES.map((m) => (
              <Chip key={m} label={t(`mode.${m}`)} selected={leg.mode === m} onPress={() => onMode(m)} />
            ))}
            {failed && <Chip label={t('common.retry')} onPress={onRetry} />}
          </Row>
        </View>
      )}
    </View>
  );
}

const RAIL = 64;
const DOT = 30;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  mapButtons: { position: 'absolute', right: space.md, flexDirection: 'row', gap: space.sm },
  mapButton: { paddingVertical: space.xs + 2, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  mapButtonText: { fontSize: fonts.size.xs, fontWeight: '600', color: colors.ink },
  sheetBg: { backgroundColor: colors.paper, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4 },
  sheet: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: 120, gap: space.md },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rowOn: {},
  rail: { width: RAIL, alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', width: 2, left: RAIL / 2 - 1, backgroundColor: colors.line },
  railTop: { top: 0, height: '50%' },
  railBottom: { bottom: 0, height: '50%' },
  hidden: { opacity: 0 },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: colors.card, fontWeight: '700', fontSize: fonts.size.sm },
  stopCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: space.xs,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stopCardOn: { borderColor: colors.ink, borderWidth: 2 },
  stopName: { fontSize: fonts.size.md + 1, fontWeight: '700', color: colors.ink },
  stopSub: { fontSize: fonts.size.sm, color: colors.inkSoft },
  stopMemo: { fontSize: fonts.size.sm, color: colors.ink, marginTop: space.xs },
  chevron: { paddingLeft: space.sm },
  chevronText: { fontSize: fonts.size.lg, color: colors.inkSoft },
  pill: { paddingVertical: 3, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  pillOn: { backgroundColor: colors.route, borderColor: colors.route },
  pillText: { fontSize: fonts.size.xs, fontWeight: '600', color: colors.ink },
  legInfo: { flex: 1, justifyContent: 'center', paddingVertical: space.md },
  legText: { fontSize: fonts.size.sm, color: colors.inkSoft },
  modes: { flex: 1, flexWrap: 'wrap', paddingBottom: space.sm },
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

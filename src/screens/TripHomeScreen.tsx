import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Sortable from 'react-native-sortables';

import { summarizeExpenses } from '@/domain/expenses';
import { removeStop, reorder, withHidden } from '@/domain/itinerary';
import { parseChecklist, serializeChecklist, type CheckItem } from '@/domain/checklist';
import type { Day, Leg, Note, Stop, Trip, TravelMode } from '@/domain/types';
import { t } from '@/i18n/ko';
import { DayMap, type DayMapHandle } from '@/map/DayMap';
import { selectedOption, type LegStatus } from '@/map/legRoutes';
import { directionsUrl } from '@/map/directions';
import { allPoints, targetOf, type Selection } from '@/map/points';
import { useLegRoutes } from '@/map/useLegRoutes';
import { moveStop, saveDay, setSkipped } from '@/state/itineraryOps';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space, stopColor } from '@/theme/tokens';
import { formatAmounts, formatDistance, formatKm, formatMoney, formatTime } from '@/ui/format';
import { Checklist } from '@/ui/Checklist';
import { SheetModal } from '@/ui/SheetModal';
import { Card, Chip, Row, Txt } from '@/ui/kit';

type Props = {
  tripId: string;
  onAddStop: (dayId: string) => void;
  onOpenMap: (dayId: string) => void;
  onOpenStop: (stopId: string) => void;
  /** 이동 메모 화면을 연다 */
  onOpenNote?: (noteId: string) => void;
  onExpenses: () => void;
  onSettings: () => void;
  /** 여행을 읽었을 때 한 번 불린다 (머리글 제목용). */
  onTrip?: (trip: Trip) => void;
  /** 화면에 다시 돌아왔을 때 바뀌는 값. 바뀌면 다시 불러온다. */
  refreshKey?: number;
  /** 오늘 날짜 'YYYY-MM-DD'. 여행 중이면 그날 탭으로 연다. */
  today?: string;
  /** 구글 지도 길찾기 링크를 연다 */
  openUrl?: (url: string) => void;
};

const MODES: TravelMode[] = ['walk', 'transit', 'drive'];
/** 지도가 차지하는 화면 비율. 시트는 그 바로 아래에서 시작한다. */
const MAP_SHARE = 0.42;
const SHEET_OVERLAP = 20;

export function TripHomeScreen({ tripId, onAddStop, onOpenMap, onOpenStop, onOpenNote = () => {}, onTrip, refreshKey = 0, today, openUrl = (url) => void Linking.openURL(url) }: Props) {
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
  const map = useRef<DayMapHandle>(null);
  const screen = useWindowDimensions();
  const [height, setHeight] = useState(screen.height * 0.85);
  const day = days?.find((d) => d.id === dayId);

  useEffect(() => {
    if (trip) onTrip?.(trip);
  }, [trip, onTrip]);

  // 날짜별 방문지·구간. 빠진 경로는 고른 이동 수단으로 구글에서 받아 채운다.
  const { stops: allStops, legs, status, loaded, setMode, retry } = useLegRoutes(dayId, refreshKey);
  // 못 가게 되어 숨긴 장소는 일정·지도·경로에서 빼고 맨 아래에 따로 모아 둔다.
  const stops = useMemo(() => allStops.filter((s) => !s.skipped), [allStops]);
  const hidden = useMemo(() => allStops.filter((s) => s.skipped), [allStops]);
  const [showHidden, setShowHidden] = useState(false);
  // 이동 메모: 장소 사이의 할 일 카드. 각각 기록·사진·비용을 가진다.
  const { data: dayNotes, reload: reloadNotes } = useLoad(async () => (dayId ? repo.listNotesForDay(dayId) : []), [dayId, refreshKey]);
  const notes = dayNotes ?? [];
  // 이동 메모를 더하는 중인 장소 (그 장소에서 다음 장소로 가는 길)
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<CheckItem[]>([]);
  const addNotesFor = (s: Stop) => {
    setNoteFor(s.id);
    setNoteDraft([]);
  };
  const noteStop = noteFor ? allStops.find((s) => s.id === noteFor) : undefined;
  const noteNext = noteStop ? stops[stops.findIndex((s) => s.id === noteStop.id) + 1] : undefined;
  const saveNewNotes = async (s: Stop, items: CheckItem[]) => {
    setNoteFor(null);
    for (const it of items) if (it.text.trim()) await repo.addNote(s.id, it.text.trim());
    reloadNotes();
  };
  const checkNote = async (n: Note, done: boolean) => {
    await repo.updateNote(n.id, { done });
    reloadNotes();
  };
  // 일정에서 바로 체크한다 (실행한 일 표시).
  const checkPlan = async (s: Stop, items: CheckItem[]) => {
    await repo.setStopPlanNote(s.id, serializeChecklist(items));
    retry();
  };
  const points = useMemo(() => allPoints(stops, legs), [stops, legs]);

  const changeDay = (id: string) => {
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
  const pressStop = (stop: Stop) => {
    // 처음 누르면 지도에서 그 장소로 옮기고, 이미 고른 장소를 다시 누르면 자세히 연다.
    if (selection?.type === 'stop' && selection.id === stop.id) onOpenStop(stop.id);
    else select({ type: 'stop', id: stop.id });
  };
  const pressLeg = (leg: Leg) => {
    select({ type: 'leg', id: leg.id });
  };

  const changed = () => {
    sv.onItineraryChanged();
    retry();
  };

  const onDragEnd = async (from: number, to: number) => {
    if (!day || !loaded || from === to) return;
    await saveDay(sv, day.id, withHidden(reorder(stops, from, to), allStops));
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
          await saveDay(sv, day.id, removeStop(allStops, stop.id));
          changed();
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
                          onCheck={(items) => void checkPlan(s, items)}
                        />
                        {notes
                          .filter((n) => n.stopId === s.id)
                          .map((n) => (
                            // 이동 메모는 하나하나가 각각의 카드. 누르면 메모 화면(기록·사진·비용)이 열린다.
                            <NoteRow key={n.id} onPress={() => onOpenNote(n.id)} label={`${t('leg.note')} ${n.text}`}>
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
                          ))}
                        {leg && (
                          <LegRow
                            onAddNote={() => addNotesFor(s)}
                            onDirections={() => {
                              const to = stops.find((x) => x.id === leg.toStopId);
                              if (to) openUrl(directionsUrl(s, to, leg.mode));
                            }}
                            leg={leg}
                            status={status[leg.id]}
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
                              retry();
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
        </BottomSheetScrollView>
      </BottomSheet>

      {noteStop && (
        <NoteEditor
          title={`${t('note.addTitle')} · ${noteStop.name}${noteNext ? ` → ${noteNext.name}` : ''}`}
          value={noteDraft}
          onChange={setNoteDraft}
          onSave={() => void saveNewNotes(noteStop, noteDraft)}
          onCancel={() => setNoteFor(null)}
        />
      )}

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

function StopRow({ stop, index, first, last, selected, onPress, onOpen, onCheck }: { stop: Stop; index: number; first: boolean; last: boolean; selected: boolean; onPress: () => void; onOpen: () => void; onCheck: (items: CheckItem[]) => void }) {
  const plan = parseChecklist(stop.planNote);
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
          {plan.length > 0 && (
            <View style={styles.planNote}>
              <Checklist items={plan} onChange={onCheck} max={4} compact />
            </View>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${stop.name} ${t('day.openStop')}`} onPress={onOpen} hitSlop={12} style={styles.chevron}>
          <Text style={styles.chevronText}>›</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

/** 이동 메모 추가 창. 일정 시트 안에서 쓰면 키보드에 가리므로 키보드 바로 위에 띄운다. 여러 개를 한 번에 적을 수 있다. */
function NoteEditor({ title, value, onChange, onSave, onCancel }: { title: string; value: CheckItem[]; onChange: (v: CheckItem[]) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <SheetModal
      title={title}
      onClose={onCancel}
      footer={
        <Row>
          <Chip label={t('note.add')} selected onPress={onSave} />
          <Chip label={t('common.cancel')} onPress={onCancel} />
        </Row>
      }
    >
      <Checklist items={value} onChange={onChange} editable placeholder={t('leg.notePlaceholder')} autoFocus />
    </SheetModal>
  );
}

/** 두 장소 사이의 이동 메모 카드. 세로줄 위에 작은 점을 찍어 장소 카드와 구분한다. */
function NoteRow({ children, onPress, label }: { children: ReactNode; onPress?: () => void; label?: string }) {
  return (
    <View style={styles.row}>
      <Rail>
        <View style={styles.noteDot} />
      </Rail>
      <Pressable accessibilityLabel={label} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.noteCard, pressed && { opacity: 0.8 }]}>
        {children}
      </Pressable>
    </View>
  );
}

/** 두 장소 사이 구간. 이동 수단은 상황에 따라 바뀔 수 있으니 늘 보이는 토글로 바로 바꾼다. */
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
        <Pressable accessibilityRole="button" onPress={onPress} style={[styles.pill, selected && styles.pillOn]}>
          <Text style={[styles.pillText, selected && { color: colors.card }]}>{distance}</Text>
        </Pressable>
      </Rail>
      <View style={styles.legBody}>
        <View style={styles.legLine}>
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
        <View style={styles.legLine}>
          <Pressable accessibilityRole="button" onPress={onDirections} hitSlop={6} style={styles.directions}>
            <Text style={styles.directionsText}>{leg.mode === 'transit' ? t('leg.transitInfo') : t('leg.navigate')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onAddNote} hitSlop={6} style={styles.addNote}>
            <Text style={styles.addNoteText}>{t('leg.addNote')}</Text>
          </Pressable>
        </View>
      </View>
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
  planNote: { marginTop: space.xs },
  chevron: { paddingLeft: space.sm },
  chevronText: { fontSize: fonts.size.lg, color: colors.inkSoft },
  pill: { paddingVertical: 3, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  pillOn: { backgroundColor: colors.route, borderColor: colors.route },
  pillText: { fontSize: fonts.size.xs, fontWeight: '600', color: colors.ink },
  legBody: { flex: 1, paddingVertical: space.sm, gap: space.xs + 2 },
  legLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  mode: { paddingVertical: 4, paddingHorizontal: space.sm, borderRadius: radius.pill },
  modeOn: { backgroundColor: colors.ink },
  modeText: { fontSize: fonts.size.xs, color: colors.inkSoft, fontWeight: '600' },
  modeTextOn: { color: colors.card },
  directions: { paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.route },
  directionsText: { fontSize: fonts.size.xs, color: colors.card, fontWeight: '700' },
  retry: { fontSize: fonts.size.xs, color: colors.accent, fontWeight: '700' },
  legText: { fontSize: fonts.size.sm, color: colors.inkSoft },
  addNote: { paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  addNoteText: { fontSize: fonts.size.xs, color: colors.inkSoft, fontWeight: '600' },
  noteMemo: { fontSize: fonts.size.xs, color: colors.inkSoft, marginLeft: 24 },
  noteDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.route },
  noteCard: { flex: 1, flexDirection: 'row', alignItems: 'center', marginVertical: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, gap: space.sm, borderWidth: 1, borderColor: colors.line },
  modes: { flexDirection: 'row', padding: 2, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  hiddenCard: { padding: space.md, borderStyle: 'dashed' },
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

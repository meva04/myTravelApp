import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { bearingTo, isOffscreen, type Region } from '@/domain/camera';
import type { LatLng, Leg, Stop, TravelMode } from '@/domain/types';
import { t } from '@/i18n/ko';
import { DayMap, type DayMapHandle, type Selection } from '@/map/DayMap';
import { selectedOption } from '@/map/legRoutes';
import { OffscreenHint } from '@/map/OffscreenHint';
import { useLegRoutes } from '@/map/useLegRoutes';
import { useServices } from '@/state/ServicesContext';
import { colors, space } from '@/theme/tokens';
import { formatKm, formatTime } from '@/ui/format';
import { Button, Card, Chip, Field, Row, Txt } from '@/ui/kit';

import { appendStop } from './AddStopScreen';

type Props = {
  dayId: string;
  refreshKey?: number;
  /** 현재 위치. 권한이 없거나 알 수 없으면 null. */
  getMe: () => Promise<LatLng | null>;
  onOpenStop: (stopId: string) => void;
  onAddStop: () => void;
};

const MODES: TravelMode[] = ['walk', 'transit', 'drive'];
const SNAP = ['18%', '50%', '88%'];

export function DayMapScreen({ dayId, refreshKey = 0, getMe, onOpenStop, onAddStop }: Props) {
  const sv = useServices();
  const { stops, legs, status, loaded, setMode, retry } = useLegRoutes(dayId, refreshKey);
  const map = useRef<DayMapHandle>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<{ at: LatLng; name: string } | null>(null);

  const points = useMemo(() => allPoints(stops, legs), [stops, legs]);

  // 그날의 지도를 처음 열 때의 전체 맞춤은 DayMap 의 시작 화면(initialPoints)으로 한다.
  // 그 뒤로는 방문지가 늘어도 사용자가 정한 화면을 건드리지 않는다.

  const select = (s: Selection) => {
    setSelection(s);
    map.current?.send({ type: 'selected' });
  };

  const target = selection ? targetOf(selection, stops, legs) : null;
  const offscreen = target && region ? isOffscreen(target, region) : false;

  const goToMe = async () => {
    const me = await getMe();
    if (me) map.current?.send({ type: 'goToMe', me });
  };
  const addDraft = async () => {
    if (!draft || draft.name.trim() === '') return;
    await appendStop(sv, dayId, { placeId: null, name: draft.name.trim(), lat: draft.at.lat, lng: draft.at.lng });
    setDraft(null);
    retry();
  };
  const recordHere = async () => {
    const me = await getMe();
    if (!me) return;
    const stop = await appendStop(sv, dayId, { placeId: null, name: t('stop.hereName'), lat: me.lat, lng: me.lng }, { arrivedAt: new Date().toISOString(), arrivalMethod: 'manual' });
    retry();
    onOpenStop(stop.id);
  };

  return (
    <View style={styles.fill}>
      {loaded && (
      <DayMap
        ref={map}
        initialPoints={points}
        stops={stops}
        legs={legs}
        selection={selection}
        onSelect={select}
        onRegion={setRegion}
        onLongPress={(at) => setDraft({ at, name: '' })}
      />
      )}

      {offscreen && target && region && (
        <OffscreenHint bearing={bearingTo(region, target)} onGo={() => map.current?.send({ type: 'goToTarget', target })} />
      )}

      <View style={styles.buttons}>
        <Button kind="ghost" label={t('map.fitAll')} onPress={() => map.current?.send({ type: 'fitAll', points })} />
        <Button kind="ghost" label={t('map.me')} onPress={goToMe} />
      </View>

      {draft && (
        <View style={styles.draft}>
          <Card>
            <Txt kind="soft">{t('map.newStopTitle')}</Txt>
            <Field placeholder={t('map.newStopName')} value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} autoFocus />
            <Row>
              <Button label={t('common.add')} onPress={addDraft} />
              <Button kind="ghost" label={t('common.cancel')} onPress={() => setDraft(null)} />
            </Row>
          </Card>
        </View>
      )}

      <BottomSheet snapPoints={SNAP} index={0} backgroundStyle={{ backgroundColor: colors.paper }} handleIndicatorStyle={{ backgroundColor: colors.line }}>
        <BottomSheetScrollView contentContainerStyle={styles.sheet}>
          {loaded && stops.length === 0 && <Txt kind="soft">{t('day.empty')}</Txt>}
          {stops.map((s, i) => {
            const leg = legs.find((l) => l.fromStopId === s.id);
            return (
              <View key={s.id} style={{ gap: space.sm }}>
                <Card
                  onPress={() => select({ type: 'stop', id: s.id })}
                  style={selection?.type === 'stop' && selection.id === s.id ? styles.on : undefined}
                >
                  <Row>
                    <Txt kind="heading">{i + 1}</Txt>
                    <View style={{ flex: 1 }}>
                      <Txt>{s.name}</Txt>
                      <Txt kind="soft">
                        {[s.plannedTime, s.arrivedAt && t('stop.arrivedAt', { time: formatTime(s.arrivedAt) })].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                    <Chip label="›" onPress={() => onOpenStop(s.id)} />
                  </Row>
                </Card>
                {leg && (
                  <Card
                    onPress={() => select({ type: 'leg', id: leg.id })}
                    style={[styles.leg, selection?.type === 'leg' && selection.id === leg.id ? styles.on : undefined]}
                  >
                    <Txt kind="soft">{legLabel(leg, status[leg.id])}</Txt>
                    <Row>
                      {MODES.map((m) => (
                        <Chip key={m} label={t(`mode.${m}`)} selected={leg.mode === m} onPress={() => leg.mode !== m && setMode(leg.id, m)} />
                      ))}
                      {(status[leg.id] === 'offline' || status[leg.id] === 'error') && <Chip label={t('common.retry')} onPress={retry} />}
                    </Row>
                  </Card>
                )}
              </View>
            );
          })}
          <Button label={t('day.addStop')} onPress={onAddStop} />
          <Button kind="ghost" label={t('map.hereNow')} onPress={recordHere} />
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

function legLabel(leg: Leg, status: string | undefined): string {
  const option = selectedOption(leg);
  if (option) return t('leg.info', { km: formatKm(option.distanceMeters), min: Math.round(option.durationSeconds / 60) });
  if (status === 'offline') return t('map.routeOffline');
  if (status === 'error') return t('map.routeError');
  return t('map.routeLoading');
}

function allPoints(stops: Stop[], legs: Leg[]): LatLng[] {
  const pts: LatLng[] = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  for (const l of legs) pts.push(...(selectedOption(l)?.polyline ?? []));
  return pts;
}

function targetOf(sel: NonNullable<Selection>, stops: Stop[], legs: Leg[]): LatLng | null {
  if (sel.type === 'stop') {
    const s = stops.find((x) => x.id === sel.id);
    return s ? { lat: s.lat, lng: s.lng } : null;
  }
  const leg = legs.find((l) => l.id === sel.id);
  if (!leg) return null;
  const line = selectedOption(leg)?.polyline;
  if (line?.length) return line[Math.floor(line.length / 2)];
  const from = stops.find((s) => s.id === leg.fromStopId);
  return from ? { lat: from.lat, lng: from.lng } : null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  buttons: { position: 'absolute', right: space.md, top: space.md, gap: space.sm },
  draft: { position: 'absolute', left: space.md, right: space.md, top: 110 },
  sheet: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  leg: { marginLeft: space.xl, padding: space.md },
  on: { borderColor: colors.accent, borderWidth: 2 },
});

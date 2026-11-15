import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { serializeChecklist, type CheckItem } from '@/domain/checklist';
import { syncLegs } from '@/domain/itinerary';
import type { Stop } from '@/domain/types';
import { GoogleApiError, OfflineError } from '@/google/errors';
import type { PlaceHit } from '@/google/places';
import { t } from '@/i18n/ko';
import type { Services } from '@/state/services';
import { useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Checklist } from '@/ui/Checklist';
import { Button, Field, Txt } from '@/ui/kit';
import { TimeField } from '@/ui/PickerField';
import { SheetModal } from '@/ui/SheetModal';

type NewPlace = { placeId: string | null; name: string; lat: number; lng: number };

/** 그 날의 맨 끝에 방문지들을 추가하고 구간을 맞춘다. */
export async function appendStops(sv: Services, dayId: string, places: { place: NewPlace; extra?: Partial<Stop> }[]): Promise<Stop[]> {
  const stops = await sv.repo.listStops(dayId);
  const added: Stop[] = places.map(({ place, extra }, i) => ({
    id: sv.newId(), dayId, order: stops.length + i, placeId: place.placeId, name: place.name, lat: place.lat, lng: place.lng,
    plannedTime: null, arrivedAt: null, arrivalMethod: null, memo: '', planNote: '', skipped: false, legNote: '', ...extra,
  }));
  const next = [...stops, ...added];
  await sv.repo.saveStops(dayId, next);
  await sv.repo.saveLegs(dayId, syncLegs(next, await sv.repo.listLegs(dayId), sv.newId));
  sv.onItineraryChanged();
  return added;
}

/** 그 날의 맨 끝에 방문지 하나를 추가한다. */
export async function appendStop(sv: Services, dayId: string, place: NewPlace, extra: Partial<Stop> = {}): Promise<Stop> {
  return (await appendStops(sv, dayId, [{ place, extra }]))[0];
}

type Status = 'idle' | 'loading' | 'offline' | 'error' | 'none';
/** 저장하기 전에 담아 둔 장소 */
type Picked = { key: string; hit: PlaceHit; time: string; todos: CheckItem[] };

/** 키보드 높이. 아래 고정 버튼을 키보드 위로 올리는 데 쓴다. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** 입력을 멈추고 이만큼 지나면 검색한다 (글자마다 구글에 묻지 않도록). */
const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

export function AddStopScreen({ dayId, onDone }: { dayId: string; onDone: () => void }) {
  const sv = useServices();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [editing, setEditing] = useState<Picked | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const keyboard = useKeyboardHeight();

  const search = async (q: string) => {
    const mine = ++seq.current; // 늦게 도착한 옛 검색 결과로 덮어쓰지 않게
    if (q.trim().length < MIN_CHARS) return;
    setStatus('loading');
    try {
      const stops = await sv.repo.listStops(dayId);
      const last = picked.length ? picked[picked.length - 1].hit : stops[stops.length - 1];
      const near = last ? { lat: last.lat, lng: last.lng } : undefined;
      const found = await sv.places.search(q.trim(), near);
      if (mine !== seq.current) return;
      setHits(found);
      setStatus(found.length ? 'idle' : 'none');
    } catch (e) {
      if (mine !== seq.current) return;
      setHits([]);
      if (e instanceof OfflineError) setStatus('offline');
      else if (e instanceof GoogleApiError) setStatus('error');
      else throw e;
    }
  };

  // 입력하는 대로 결과를 미리 보여 준다.
  useEffect(() => {
    if (query.trim().length < MIN_CHARS) return;
    const timer = setTimeout(() => void search(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const open = (hit: PlaceHit) => {
    setEditing(picked.find((p) => p.hit.placeId === hit.placeId) ?? { key: `${hit.placeId}:${++seq.current}`, hit, time: '', todos: [] });
  };
  const isPicked = (key: string) => picked.some((p) => p.key === key);
  const commit = () => {
    if (!editing) return;
    setPicked(isPicked(editing.key) ? picked.map((p) => (p.key === editing.key ? editing : p)) : [...picked, editing]);
    setEditing(null);
  };
  const unpick = () => {
    if (!editing) return;
    setPicked(picked.filter((p) => p.key !== editing.key));
    setEditing(null);
  };
  const save = async () => {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    try {
      await appendStops(
        sv,
        dayId,
        picked.map((p) => ({ place: p.hit, extra: { plannedTime: p.time || null, planNote: serializeChecklist(p.todos) } })),
      );
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const shownHits = query.trim().length >= MIN_CHARS ? hits : [];

  return (
    <View style={styles.fill}>
      <View style={styles.searchBar}>
        <Field
          placeholder={t('search.placeholder')}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void search(query)}
          returnKeyType="search"
          autoFocus
          clearButtonMode="while-editing"
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {picked.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Txt kind="soft">{t('add.picked', { n: picked.length })}</Txt>
            {picked.map((p, i) => (
              <Pressable key={p.key} accessibilityRole="button" onPress={() => setEditing(p)} style={({ pressed }) => [styles.picked, pressed && { opacity: 0.7 }]}>
                <Text style={styles.pickedNo}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.hit.name}</Text>
                  <Text style={styles.sub}>
                    {[p.time, p.todos.filter((x) => x.text.trim()).length ? t('add.todos', { n: p.todos.filter((x) => x.text.trim()).length }) : null]
                      .filter(Boolean)
                      .join(' · ') || t('add.tapToEdit')}
                  </Text>
                </View>
                <Text style={styles.edit}>{t('common.edit')}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {status === 'loading' && <Txt kind="soft">{t('common.loading')}</Txt>}
        {status === 'none' && shownHits.length === 0 && query.trim().length >= MIN_CHARS && <Txt kind="soft">{t('search.none')}</Txt>}
        {status === 'error' && <Txt kind="soft">{t('search.error')}</Txt>}
        {status === 'offline' && <Button kind="ghost" label={t('common.retryWhenOnline')} onPress={() => void search(query)} />}

        {shownHits.map((h) => {
          const already = picked.some((p) => p.hit.placeId === h.placeId);
          return (
            <Pressable key={h.placeId} accessibilityRole="button" onPress={() => open(h)} style={({ pressed }) => [styles.hit, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{h.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {h.address}
                </Text>
              </View>
              {already && <Text style={styles.badge}>{t('add.inList')}</Text>}
            </Pressable>
          );
        })}
      </ScrollView>

      {picked.length > 0 && (
        <View style={[styles.footer, keyboard > 0 && { bottom: keyboard + space.sm }]}>
          <Button label={t('add.save', { n: picked.length })} onPress={() => void save()} />
        </View>
      )}

      {editing && (
        <SheetModal
          title={editing.hit.name}
          subtitle={editing.hit.address}
          onClose={() => setEditing(null)}
          footer={
            <View style={{ gap: space.sm }}>
              <Button label={isPicked(editing.key) ? t('add.update') : t('add.add')} onPress={commit} />
              {isPicked(editing.key) && <Button kind="ghost" label={t('add.remove')} onPress={unpick} />}
            </View>
          }
        >
          <TimeField label={t('stop.plannedTime')} value={editing.time} onChange={(time) => setEditing({ ...editing, time })} />
          <Checklist items={editing.todos} onChange={(todos) => setEditing({ ...editing, todos })} editable placeholder={t('stop.planNote')} />
        </SheetModal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  searchBar: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  body: { paddingHorizontal: space.lg, paddingBottom: 120, gap: space.sm },
  hit: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  name: { fontSize: fonts.size.md, fontWeight: '600', color: colors.ink },
  sub: { fontSize: fonts.size.sm, color: colors.inkSoft, marginTop: 2 },
  badge: { fontSize: fonts.size.xs, color: colors.ok, fontWeight: '700' },
  picked: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  pickedNo: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, overflow: 'hidden', backgroundColor: colors.ink, color: colors.card, fontWeight: '700', fontSize: fonts.size.sm },
  edit: { fontSize: fonts.size.sm, color: colors.inkSoft },
  footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.xxl },
});

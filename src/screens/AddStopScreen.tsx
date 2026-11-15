import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { serializeChecklist, type CheckItem } from '@/domain/checklist';
import type { Stop } from '@/domain/types';
import { GoogleApiError, OfflineError } from '@/google/errors';
import { isMapsUrl, type PlaceHit } from '@/google/places';
import { t } from '@/i18n/ko';
import { addStops, type NewPlace } from '@/state/itineraryOps';
import type { Services } from '@/state/services';
import { useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Checklist, withDraft } from '@/ui/Checklist';
import { Button, Field, Txt } from '@/ui/kit';
import { TimeField } from '@/ui/PickerField';
import { KindIcon } from '@/ui/PlaceVisual';
import { SheetModal } from '@/ui/SheetModal';

/** 그 날 일정에 방문지들을 넣고 구간을 맞춘다. 시간이 있으면 시간 순서에 맞는 자리에. */
export async function appendStops(sv: Services, dayId: string, places: { place: NewPlace; extra?: Partial<Stop> }[]): Promise<Stop[]> {
  return addStops(sv, dayId, places);
}

/** 그 날 일정에 방문지 하나를 넣는다. */
export async function appendStop(sv: Services, dayId: string, place: NewPlace, extra: Partial<Stop> = {}): Promise<Stop> {
  return (await appendStops(sv, dayId, [{ place, extra }]))[0];
}

type Status = 'idle' | 'loading' | 'link' | 'linkNone' | 'offline' | 'error' | 'none';
/** 시간·할 일을 적는 중인 장소 */
type Editing = { hit: PlaceHit; time: string; todos: CheckItem[]; typing: string };

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

type Props = { dayId: string; onDone: () => void };

export function AddStopScreen({ dayId, onDone }: Props) {
  const sv = useServices();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [added, setAdded] = useState<Stop[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const keyboard = useKeyboardHeight();

  const open = (hit: PlaceHit) => setEditing({ hit, time: '', todos: [], typing: '' });
  const search = async (q: string) => {
    const mine = ++seq.current; // 늦게 도착한 옛 검색 결과로 덮어쓰지 않게
    if (q.trim().length < MIN_CHARS) return;
    // 구글 지도에서 복사한 링크면 그 장소를 바로 찾아 입력 창을 연다
    if (isMapsUrl(q)) {
      setStatus('link');
      setHits([]);
      try {
        const hit = await sv.places.fromMapsUrl(q);
        if (mine !== seq.current) return;
        if (!hit) return setStatus('linkNone');
        setStatus('idle');
        setHits([hit]);
        open(hit);
      } catch (e) {
        if (mine !== seq.current) return;
        setStatus(e instanceof OfflineError ? 'offline' : 'linkNone');
      }
      return;
    }
    setStatus('loading');
    try {
      const stops = await sv.repo.listStops(dayId);
      const last = stops[stops.length - 1];
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

  // "추가하기" 를 누르면 바로 일정에 들어간다 (따로 저장하기 단계가 없다).
  const add = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const { hit, time } = editing;
      const [stop] = await appendStops(sv, dayId, [
        {
          place: { placeId: hit.placeId || null, name: hit.name, lat: hit.lat, lng: hit.lng, kind: hit.kind ?? null },
          extra: { plannedTime: time || null, planNote: serializeChecklist(withDraft(editing.todos, editing.typing)) },
        },
      ]);
      setAdded((a) => [...a, stop]);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const shownHits = query.trim().length >= MIN_CHARS ? hits : [];
  const addedIds = new Set(added.map((s) => s.placeId).filter(Boolean));

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
        {query.trim() === '' && <Txt kind="small">{t('search.linkHint')}</Txt>}
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {added.length > 0 && (
          <View style={{ gap: space.xs }}>
            <Txt kind="soft">{t('add.added', { n: added.length })}</Txt>
            {added.map((s) => (
              <Text key={s.id} style={styles.addedName}>{`✓ ${s.name}${s.plannedTime ? ` · ${s.plannedTime}` : ''}`}</Text>
            ))}
          </View>
        )}

        {status === 'loading' && <Txt kind="soft">{t('common.loading')}</Txt>}
        {status === 'link' && <Txt kind="soft">{t('search.linkLoading')}</Txt>}
        {status === 'linkNone' && <Txt kind="soft">{t('search.linkNone')}</Txt>}
        {status === 'none' && shownHits.length === 0 && query.trim().length >= MIN_CHARS && <Txt kind="soft">{t('search.none')}</Txt>}
        {status === 'error' && <Txt kind="soft">{t('search.error')}</Txt>}
        {status === 'offline' && <Button kind="ghost" label={t('common.retryWhenOnline')} onPress={() => void search(query)} />}

        {shownHits.map((h) => (
          <Pressable key={h.placeId} accessibilityRole="button" onPress={() => open(h)} style={({ pressed }) => [styles.hit, pressed && { opacity: 0.7 }]}>
            <KindIcon kind={h.kind} size={16} color={colors.inkSoft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{h.name}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {h.address}
              </Text>
            </View>
            {addedIds.has(h.placeId) ? (
              <Text style={styles.badge}>{t('add.inList')}</Text>
            ) : h.category ? (
              <Text style={styles.category} numberOfLines={1}>
                {h.category}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      {added.length > 0 && !editing && (
        <View style={[styles.footer, keyboard > 0 && { bottom: keyboard + space.sm }]}>
          <Button label={t('add.done', { n: added.length })} onPress={onDone} />
        </View>
      )}

      {editing && (
        <SheetModal
          title={editing.hit.name}
          subtitle={editing.hit.address}
          onClose={() => setEditing(null)}
          footer={<Button label={t('add.add')} onPress={() => void add()} />}
        >
          <TimeField label={t('stop.plannedTime')} value={editing.time} onChange={(time) => setEditing({ ...editing, time })} />
          <Checklist
            items={editing.todos}
            onChange={(todos) => setEditing((e) => e && { ...e, todos })}
            onDraft={(typing) => setEditing((e) => e && { ...e, typing })}
            editable
            placeholder={t('stop.planNote')}
          />
        </SheetModal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  searchBar: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm },
  body: { paddingHorizontal: space.lg, paddingBottom: 120, gap: space.sm },
  hit: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  name: { fontSize: fonts.size.md, fontWeight: '600', color: colors.ink },
  sub: { fontSize: fonts.size.sm, color: colors.inkSoft, marginTop: 2 },
  badge: { fontSize: fonts.size.xs, color: colors.ok, fontWeight: '700' },
  category: { maxWidth: 110, fontSize: fonts.size.xs, color: colors.inkSoft, paddingVertical: 2, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  addedName: { fontSize: fonts.size.sm, color: colors.ok, fontWeight: '600' },
  footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.xxl, borderRadius: radius.md },
});

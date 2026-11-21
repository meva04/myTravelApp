import { useEffect, useRef, useState } from 'react';
import { Keyboard, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { serializeChecklist, type CheckItem } from '@/domain/checklist';
import type { Stop } from '@/domain/types';
import { GoogleApiError, OfflineError } from '@/google/errors';
import { isMapsUrl, type PlaceHit } from '@/google/places';
import { t } from '@/i18n/ko';
import { googleMapsUrl } from '@/map/directions';
import { addStops, type NewPlace } from '@/state/itineraryOps';
import type { Services } from '@/state/services';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Checklist, withDraft } from '@/ui/Checklist';
import { FormPage } from '@/ui/FormPage';
import { Text } from '@/ui/Text';
import { Button, Field, Row, Txt } from '@/ui/kit';
import { TimeField } from '@/ui/PickerField';
import { KindIcon } from '@/ui/PlaceVisual';

/** 그 날 일정에 방문지들을 넣고 구간을 맞춘다. 시간이 있으면 시간 순서에 맞는 자리에. */
export async function appendStops(sv: Services, dayId: string, places: { place: NewPlace; extra?: Partial<Stop>; afterStopId?: string }[]): Promise<Stop[]> {
  return addStops(sv, dayId, places);
}

/** 그 날 일정에 방문지 하나를 넣는다. */
export async function appendStop(sv: Services, dayId: string, place: NewPlace, extra: Partial<Stop> = {}): Promise<Stop> {
  return (await appendStops(sv, dayId, [{ place, extra }]))[0];
}

type Status = 'idle' | 'loading' | 'link' | 'linkNone' | 'offline' | 'error' | 'none';
/** 시간·할 일을 적는 중인 장소 */
type Editing = { hit: PlaceHit; time: string; todos: CheckItem[]; typing: string };

/** 입력을 멈추고 이만큼 지나면 검색한다 (글자마다 구글에 묻지 않도록). */
const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

type Props = {
  dayId: string;
  /** 두 장소 사이의 + 로 열었으면 이 장소 바로 뒤에 넣는다 */
  afterStopId?: string;
  onDone: () => void;
  /** 뒤로 (주지 않으면 onDone) */
  onBack?: () => void;
  openUrl?: (url: string) => void;
};

export function AddStopScreen({ dayId, afterStopId, onDone, onBack, openUrl = (url) => void Linking.openURL(url) }: Props) {
  const sv = useServices();
  // 검색 전에는 최근에 넣은 장소를 보여 준다 (낮·밤 두 번 가는 곳처럼 같은 곳을 다시 넣을 수 있게)
  const { data: recent } = useLoad(() => sv.repo.listRecentStops(12), [dayId]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  // 목록을 누르면 키보드를 내리고 아래에 장소 카드를 띄운다 (첫 누름이 키보드 내리기로 사라지지 않게 바로 연다)
  const open = (hit: PlaceHit) => {
    Keyboard.dismiss();
    setNotice('');
    setEditing({ hit, time: '', todos: [], typing: '' });
  };
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

  // "추가하기" 를 누르면 바로 일정에 넣고 일정 화면으로 돌아간다 (따로 완료·저장 단계가 없다).
  const add = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const { hit, time } = editing;
      await appendStops(sv, dayId, [
        {
          place: { placeId: hit.placeId || null, name: hit.name, lat: hit.lat, lng: hit.lng, kind: hit.kind ?? null },
          extra: { plannedTime: time || null, planNote: serializeChecklist(withDraft(editing.todos, editing.typing)) },
          afterStopId,
        },
      ]);
      setEditing(null);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const shownHits = query.trim().length >= MIN_CHARS ? hits : [];
  const fromStop = (s: Stop): PlaceHit => ({ placeId: s.placeId ?? '', name: s.name, address: '', lat: s.lat, lng: s.lng, kind: s.kind ?? null });

  const submit = () => {
    if (!editing) return setNotice(t('add.pickFirst'));
    void add();
  };

  return (
    <FormPage title={t('add.title')} onBack={onBack ?? onDone} submitLabel={t('add.add')} onSubmit={submit} notice={notice} scroll={false}>
      {editing ? (
        // 고른 장소: 구글에서 확인하고, 시간·할 일을 적는다. 추가는 아래 고정 버튼으로.
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card} testID="place-card">
            <Row style={{ alignItems: 'flex-start' }}>
              <KindIcon kind={editing.hit.kind} size={18} color={colors.ink} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{editing.hit.name}</Text>
                {editing.hit.address ? <Text style={styles.sub}>{editing.hit.address}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setEditing(null)} hitSlop={10}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </Row>
            <Pressable
              accessibilityRole="button"
              onPress={() => openUrl(googleMapsUrl({ name: editing.hit.name, lat: editing.hit.lat, lng: editing.hit.lng, placeId: editing.hit.placeId || null }))}
              style={({ pressed }) => [styles.google, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.googleText}>{t('hero.openGoogle')}</Text>
            </Pressable>
          </View>
          <TimeField label={t('stop.plannedTime')} value={editing.time} onChange={(time) => setEditing((e) => e && { ...e, time })} />
          <Checklist
            items={editing.todos}
            onChange={(todos) => setEditing((e) => e && { ...e, todos })}
            onDraft={(typing) => setEditing((e) => e && { ...e, typing })}
            editable
            placeholder={t('stop.planNote')}
          />
        </ScrollView>
      ) : (
        <>
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
            {query.trim() === '' && (recent?.length ?? 0) > 0 && (
              <View style={{ gap: 0 }}>
                <Txt kind="soft">{t('add.recent')}</Txt>
                {recent!.map((r) => (
                  <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${t('add.recent')} ${r.name}`} onPress={() => open(fromStop(r))} style={({ pressed }) => [styles.hit, pressed && { opacity: 0.7 }]}>
                    <KindIcon kind={r.kind} size={16} color={colors.inkSoft} />
                    <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.plus}>+</Text>
                  </Pressable>
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
                {h.category ? (
                  <Text style={styles.category} numberOfLines={1}>
                    {h.category}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </FormPage>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  searchBar: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  hit: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  name: { fontSize: fonts.size.md, fontWeight: '600', color: colors.ink },
  sub: { fontSize: fonts.size.sm, color: colors.inkSoft, marginTop: 2 },
  category: { maxWidth: 110, fontSize: fonts.size.xs, color: colors.inkSoft, paddingVertical: 2, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  plus: { fontSize: fonts.size.lg, color: colors.inkSoft, paddingHorizontal: space.sm },
  card: { padding: space.lg, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.card },
  cardName: { fontSize: fonts.size.lg, fontWeight: '700', color: colors.ink },
  close: { fontSize: fonts.size.md, color: colors.inkSoft },
  google: { alignSelf: 'flex-start', paddingVertical: space.xs + 2, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  googleText: { fontSize: fonts.size.xs, fontWeight: '700', color: colors.ink },
});

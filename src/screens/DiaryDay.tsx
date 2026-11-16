// 일기 모드: 지나간 날을 장소별 사진과 기록 중심으로 보여 준다.
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { currencyChoices } from '@/domain/currency';
import { summarizeExpenses } from '@/domain/expenses';
import type { Expense, Note, Photo, Stop, Trip } from '@/domain/types';
import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { formatMoney, formatTime } from '@/ui/format';
import { moneyIn, ShowInChips } from '@/ui/Money';
import { PhotoViewer } from '@/ui/PhotoViewer';
import { KindIcon } from '@/ui/PlaceVisual';

export type DiaryEntry = { kind: 'stop'; stop: Stop; photos: Photo[] } | { kind: 'note'; note: Note; photos: Photo[] };

type Props = {
  date: string;
  dayNumber: number;
  entries: DiaryEntry[];
  /** 가지 못한 곳 */
  missed: Stop[];
  summary: string;
  resolvePhoto: (uri: string) => string;
  onOpenStop: (id: string) => void;
  onOpenNote: (id: string) => void;
  /** 그 날 쓴 돈 (마지막 "쓴 돈 보기" 에 쓴다) */
  expenses?: Expense[];
  trip?: Trip;
};

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
// 날짜·숫자는 세리프로 (한글은 시스템 글꼴로 이어진다)
const SERIF = 'Georgia';

/** '2027-03-01' → '3월 1일 월요일' */
export function diaryDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`;
}

export function DiaryDay({ date, dayNumber, entries, missed, summary, resolvePhoto, onOpenStop, onOpenNote, expenses = [], trip }: Props) {
  // 다녀온 곳과 기록·사진이 있는 이동 메모만 남긴다
  const shown = entries.filter((e) => (e.kind === 'stop' ? e.stop.arrivedAt !== null || e.photos.length > 0 || e.stop.memo !== '' : e.note.memo !== '' || e.photos.length > 0));
  // 크게 보기에서 넘길 순서: 일기에 보이는 순서대로 그 날의 모든 사진
  const all = shown.flatMap((e) => ordered(e.photos));
  const [viewing, setViewing] = useState<number | null>(null);
  const open = (p: Photo) => setViewing(Math.max(0, all.findIndex((x) => x.id === p.id)));
  return (
    <View style={styles.page} testID="diary">
      <View style={styles.head}>
        <Text style={styles.dayNo}>{`DAY ${dayNumber}`}</Text>
        <Text style={styles.date}>{diaryDate(date)}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>

      {shown.length === 0 && <Text style={styles.empty}>{t('diary.empty')}</Text>}

      {shown.map((e, i) =>
        e.kind === 'stop' ? (
          <Pressable key={e.stop.id} accessibilityRole="button" onPress={() => onOpenStop(e.stop.id)} style={styles.entry}>
            <View style={styles.timeline}>
              <Text style={styles.time}>{e.stop.arrivedAt ? formatTime(e.stop.arrivedAt) : (e.stop.plannedTime ?? '')}</Text>
              {i < shown.length - 1 && <View style={styles.thread} />}
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <KindIcon kind={e.stop.kind} size={14} color={colors.inkSoft} />
                <Text style={styles.place}>{e.stop.name}</Text>
              </View>
              <Photos photos={e.photos} resolvePhoto={resolvePhoto} onOpen={open} />
              {e.stop.memo !== '' && <Text style={styles.memo}>{e.stop.memo}</Text>}
            </View>
          </Pressable>
        ) : (
          <Pressable key={e.note.id} accessibilityRole="button" onPress={() => onOpenNote(e.note.id)} style={styles.entry}>
            <View style={styles.timeline}>{i < shown.length - 1 && <View style={styles.thread} />}</View>
            <View style={[styles.body, styles.noteBody]}>
              <Text style={styles.noteTitle}>{`${t('leg.note')} · ${e.note.text}`}</Text>
              <Photos photos={e.photos} resolvePhoto={resolvePhoto} onOpen={open} small />
              {e.note.memo !== '' && <Text style={styles.noteMemo}>{`“${e.note.memo}”`}</Text>}
            </View>
          </Pressable>
        ),
      )}

      {missed.length > 0 && <Text style={styles.missed}>{t('diary.missed', { names: missed.map((s) => s.name).join(', ') })}</Text>}

      {trip && <DaySpending expenses={expenses} trip={trip} />}

      {viewing !== null && <PhotoViewer uris={all.map((p) => resolvePhoto(p.uri))} start={viewing} onClose={() => setViewing(null)} />}
    </View>
  );
}

/** 대표 사진을 먼저, 나머지는 그 뒤로 */
function ordered(photos: Photo[]): Photo[] {
  const cover = photos.find((p) => p.cover) ?? photos[0];
  return cover ? [cover, ...photos.filter((p) => p.id !== cover.id)] : [];
}

/** 일기 맨 아래: 눌러서 그 날 쓴 돈을 펼쳐 본다 */
function DaySpending({ expenses, trip }: { expenses: Expense[]; trip: Trip }) {
  const [open, setOpen] = useState(false);
  const [showIn, setShowIn] = useState(trip.baseCurrency);
  const s = summarizeExpenses(expenses, trip);
  const other = Object.entries(s.unconverted).map(([c, a]) => formatMoney(a, c));
  const total = moneyIn(s.total, showIn, trip);
  return (
    <View style={styles.spend}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={({ pressed }) => [styles.spendButton, pressed && { opacity: 0.7 }]}>
        <Text style={styles.spendLabel}>{t('diary.spent')}</Text>
        <Text style={styles.spendTotal}>{`${expenses.length ? total : t('diary.spentNone')} ${open ? '▴' : '▾'}`}</Text>
      </Pressable>
      {open && expenses.length > 0 && (
        <View style={styles.spendBody} testID="diary-spending">
          <ShowInChips choices={currencyChoices(trip)} value={showIn} onChange={setShowIn} />
          {expenses.map((e) => (
            <View key={e.id} style={styles.spendRow}>
              <Text style={styles.spendItem} numberOfLines={1}>
                {e.memo ? `${t(`cat.${e.category}`)} · ${e.memo}` : t(`cat.${e.category}`)}
              </Text>
              <Text style={styles.spendAmount}>{formatMoney(e.amount, e.currency)}</Text>
            </View>
          ))}
          {other.length > 0 && <Text style={styles.spendNote}>{`${t('expense.unconverted')}: ${other.join(', ')}`}</Text>}
        </View>
      )}
    </View>
  );
}

/** 첫 사진은 크게, 나머지는 가로로 작게 */
function Photos({ photos, resolvePhoto, onOpen, small = false }: { photos: Photo[]; resolvePhoto: (uri: string) => string; onOpen: (p: Photo) => void; small?: boolean }) {
  if (photos.length === 0) return null;
  const [cover, ...rest] = ordered(photos);
  return (
    <View style={{ gap: space.xs }}>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('diary.photoOpen')} onPress={() => onOpen(cover)}>
        <Image source={{ uri: resolvePhoto(cover.uri) }} style={[styles.big, small && styles.bigSmall]} contentFit="cover" transition={300} accessibilityIgnoresInvertColors />
      </Pressable>
      {rest.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          {rest.map((p) => (
            <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel={t('diary.photoOpen')} onPress={() => onOpen(p)}>
              <Image source={{ uri: resolvePhoto(p.uri) }} style={styles.small} contentFit="cover" accessibilityIgnoresInvertColors />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg, paddingTop: space.sm },
  head: { alignItems: 'center', gap: 4, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  dayNo: { fontSize: fonts.size.xs, letterSpacing: 3, color: colors.accent, fontWeight: '700' },
  date: { fontFamily: SERIF, fontSize: 24, color: colors.ink },
  summary: { fontSize: fonts.size.xs, color: colors.inkSoft },
  empty: { fontFamily: SERIF, fontSize: fonts.size.md, color: colors.inkSoft, textAlign: 'center', paddingVertical: space.xl },
  entry: { flexDirection: 'row', gap: space.md },
  timeline: { width: 44, alignItems: 'center' },
  time: { fontSize: fonts.size.xs, color: colors.inkSoft, fontVariant: ['tabular-nums'], marginTop: 3 },
  thread: { flex: 1, width: 1, backgroundColor: colors.line, marginTop: space.xs },
  body: { flex: 1, gap: space.sm, paddingBottom: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  place: { fontFamily: SERIF, fontSize: fonts.size.lg, color: colors.ink, flexShrink: 1 },
  big: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  bigSmall: { aspectRatio: 16 / 9 },
  small: { width: 72, height: 72, borderRadius: radius.md },
  memo: { fontFamily: SERIF, fontSize: fonts.size.md, lineHeight: 26, color: colors.ink },
  noteBody: { paddingLeft: space.md, borderLeftWidth: 2, borderColor: colors.accentSoft },
  noteTitle: { fontSize: fonts.size.xs, color: colors.route, fontWeight: '600' },
  noteMemo: { fontFamily: SERIF, fontSize: fonts.size.sm, lineHeight: 22, color: colors.inkSoft, fontStyle: 'italic' },
  spend: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingTop: space.md, gap: space.sm },
  spendButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  spendLabel: { fontSize: fonts.size.sm, color: colors.ink, fontWeight: '600' },
  spendTotal: { fontFamily: SERIF, fontSize: fonts.size.md, color: colors.ink, fontVariant: ['tabular-nums'] },
  spendBody: { gap: space.xs, paddingHorizontal: space.xs },
  spendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  spendItem: { flex: 1, fontSize: fonts.size.sm, color: colors.inkSoft },
  spendAmount: { fontSize: fonts.size.sm, color: colors.ink, fontVariant: ['tabular-nums'] },
  spendNote: { fontSize: fonts.size.xs, color: colors.inkSoft },
  missed: { fontSize: fonts.size.xs, color: colors.inkSoft, textAlign: 'center', paddingBottom: space.md },
});

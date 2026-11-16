// 일기 모드: 지나간 날을 장소별 사진과 기록 중심으로 보여 준다.
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { currencyChoices } from '@/domain/currency';
import { summarizeExpenses } from '@/domain/expenses';
import { isVideo, thumbOf } from '@/domain/media';
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

export function DiaryDay({ date, dayNumber, entries, missed, summary, resolvePhoto, onOpenStop, expenses = [], trip }: Props) {
  // 일기에는 다녀온 곳(기록·사진이 있는 곳)만 남긴다. 이동 메모는 보이지 않는다.
  const shown = entries.filter((e): e is Extract<DiaryEntry, { kind: 'stop' }> => e.kind === 'stop' && (e.stop.arrivedAt !== null || e.photos.length > 0 || e.stop.memo !== ''));
  // 크게 보기는 그 장소의 사진끼리만 넘긴다
  const [viewing, setViewing] = useState<{ uris: string[]; start: number } | null>(null);
  return (
    <View style={styles.page} testID="diary">
      <View style={styles.head}>
        <Text style={styles.dayNo}>{`DAY ${dayNumber}`}</Text>
        <Text style={styles.date}>{diaryDate(date)}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>

      {shown.length === 0 && <Text style={styles.empty}>{t('diary.empty')}</Text>}

      {shown.map((e, i) => {
        const list = ordered(e.photos);
        const time = e.stop.arrivedAt ? formatTime(e.stop.arrivedAt) : (e.stop.plannedTime ?? '');
        return (
          <View key={e.stop.id}>
            {/* 장소 블럭과 블럭은 가운데 세로줄로 잇는다 */}
            {i > 0 && <View style={styles.thread} />}
            <Pressable accessibilityRole="button" onPress={() => onOpenStop(e.stop.id)} style={styles.entry}>
              <Mosaic photos={list} resolvePhoto={resolvePhoto} onOpen={(k) => setViewing({ uris: list.map((p) => resolvePhoto(p.uri)), start: k })} />
              <View style={styles.titleRow}>
                <KindIcon kind={e.stop.kind} size={14} color={colors.inkSoft} />
                <Text style={styles.place}>{e.stop.name}</Text>
                {time !== '' && <Text style={styles.time}>{time}</Text>}
              </View>
              {e.stop.memo !== '' && <Text style={styles.memo}>{e.stop.memo}</Text>}
            </Pressable>
          </View>
        );
      })}

      {missed.length > 0 && <Text style={styles.missed}>{t('diary.missed', { names: missed.map((s) => s.name).join(', ') })}</Text>}

      {trip && <DaySpending expenses={expenses} trip={trip} />}

      {viewing && <PhotoViewer uris={viewing.uris} start={viewing.start} onClose={() => setViewing(null)} />}
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

/**
 * 사진 모자이크: 큰 사진 한 장 → 중간·작은 두 장 → 작은 세 장 → 같은 크기 두 장 순서로 줄을 바꿔 가며 섞는다.
 * 줄마다 높이를 비율로 정해 두어 따로 재지 않아도 된다.
 */
const PATTERN: { weights: number[]; ratio: number }[] = [
  { weights: [1], ratio: 4 / 3 },
  { weights: [2, 1], ratio: 3 / 2 },
  { weights: [1, 1, 1], ratio: 3 },
  { weights: [1, 1], ratio: 2 },
];

/** 사진들을 줄로 나눈다 (마지막 줄은 남은 장 수에 맞춘다) */
export function mosaicRows<T>(items: T[]): { items: T[]; weights: number[]; ratio: number }[] {
  const rows: { items: T[]; weights: number[]; ratio: number }[] = [];
  let i = 0;
  let k = 0;
  while (i < items.length) {
    const left = items.length - i;
    let p = PATTERN[k % PATTERN.length];
    if (p.weights.length > left) p = left === 1 ? PATTERN[0] : left === 2 ? PATTERN[3] : p;
    rows.push({ items: items.slice(i, i + p.weights.length), weights: p.weights, ratio: p.ratio });
    i += p.weights.length;
    k++;
  }
  return rows;
}

function Mosaic({ photos, resolvePhoto, onOpen }: { photos: Photo[]; resolvePhoto: (uri: string) => string; onOpen: (index: number) => void }) {
  if (photos.length === 0) return null;
  let n = 0;
  return (
    <View style={{ gap: GAP }}>
      {mosaicRows(photos).map((row, r) => (
        <View key={r} style={[styles.mRow, { aspectRatio: row.ratio }]}>
          {row.items.map((p, j) => {
            const at = n++;
            return (
              <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel={t('diary.photoOpen')} onPress={() => onOpen(at)} style={{ flex: row.weights[j] }}>
                <Image source={{ uri: resolvePhoto(thumbOf(p.uri)) }} style={styles.mImg} contentFit="cover" transition={200} recyclingKey={p.id} accessibilityIgnoresInvertColors />
                {isVideo(p.uri) && <Text style={styles.play}>▶</Text>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const GAP = 3;

const styles = StyleSheet.create({
  page: { gap: space.md, paddingTop: space.sm },
  head: { alignItems: 'center', gap: 4, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  dayNo: { fontSize: fonts.size.xs, letterSpacing: 3, color: colors.accent, fontWeight: '700' },
  date: { fontFamily: SERIF, fontSize: 24, color: colors.ink },
  summary: { fontSize: fonts.size.xs, color: colors.inkSoft },
  empty: { fontFamily: SERIF, fontSize: fonts.size.md, color: colors.inkSoft, textAlign: 'center', paddingVertical: space.xl },
  entry: { gap: space.sm },
  thread: { alignSelf: 'center', width: 1.5, height: 36, backgroundColor: colors.line, marginVertical: space.sm },
  time: { fontSize: fonts.size.xs, color: colors.inkSoft, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  place: { fontFamily: SERIF, fontSize: fonts.size.lg, color: colors.ink, flexShrink: 1 },
  mRow: { flexDirection: 'row', gap: GAP, width: '100%' },
  mImg: { width: '100%', height: '100%', borderRadius: radius.sm, backgroundColor: colors.accentSoft },
  play: { position: 'absolute', left: 0, right: 0, top: '42%', textAlign: 'center', fontSize: 22, color: '#fff' },
  memo: { fontFamily: SERIF, fontSize: fonts.size.md, lineHeight: 26, color: colors.ink },
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

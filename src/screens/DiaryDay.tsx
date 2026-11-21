// 일기 모드: 지나간 날을 장소별 사진과 기록 중심으로 보여 준다.
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { currencyChoices } from '@/domain/currency';
import { summarizeExpenses } from '@/domain/expenses';
import { isVideo, thumbOf } from '@/domain/media';
import type { Expense, Note, Photo, Stop, Trip } from '@/domain/types';
import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Text } from '@/ui/Text';
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
            {/* 장소명·사진·글을 카드 하나로 묶는다 */}
            <View style={styles.card} testID={`diary-card:${e.stop.id}`}>
              {/* 장소와 시간은 가운데, 사진 위. 편집은 장소 상세(기록·사진)로 간다. */}
              <View style={styles.titleBlock}>
                <View style={styles.titleRow}>
                  <KindIcon kind={e.stop.kind} size={14} color={colors.inkSoft} />
                  <Text style={styles.place}>{e.stop.name}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('diary.editLabel', { name: e.stop.name })} onPress={() => onOpenStop(e.stop.id)} hitSlop={8} style={({ pressed }) => [styles.edit, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.editText}>{t('diary.edit')}</Text>
                  </Pressable>
                </View>
                {time !== '' && <Text style={styles.time}>{time}</Text>}
              </View>
              <PhotoGrid photos={list}resolvePhoto={resolvePhoto} onOpen={(k) => setViewing({ uris: list.map((p) => resolvePhoto(p.uri)), start: k })} />
              {e.stop.memo !== '' ? (
                <Text style={styles.memo}>{e.stop.memo}</Text>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => onOpenStop(e.stop.id)} style={({ pressed }) => pressed && { opacity: 0.6 }}>
                  <Text style={styles.prompt}>{t('diary.writePrompt')}</Text>
                </Pressable>
              )}
            </View>
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
 * 사진 배치 (애플 일기 앱 참고).
 * - 대표 사진은 언제나 맨 위에 한 칼럼으로.
 * - 나머지는 최대 다섯 장씩 묶음으로, 장 수에 따라 모양을 달리한다.
 *   1장: 한 칼럼 / 2장: 좌우 / 3장: 왼쪽 큰 것 + 오른쪽 위아래 / 4장: 왼쪽 큰 것 + 오른쪽 위 하나·아래 둘 / 5장: 오른쪽 위도 둘로
 * - 대표 + 다섯 장 묶음 둘 = 11칸. 사진은 10장까지만 보이고, 더 있으면 11번째 칸이 "+N" 이 된다.
 */
export type Tile = { index: number; more?: number };
export type BlockKind = 'cover' | 'one' | 'two' | 'three' | 'four' | 'five';
export type Block = { kind: BlockKind; tiles: Tile[] };

const MAX_SHOWN = 10;
const PER_BLOCK = 5;
const KIND_BY_COUNT: BlockKind[] = ['one', 'one', 'two', 'three', 'four', 'five'];

export function photoBlocks(count: number): Block[] {
  if (count <= 0) return [];
  const blocks: Block[] = [{ kind: 'cover', tiles: [{ index: 0 }] }];
  const rest: Tile[] = [];
  for (let i = 1; i < Math.min(count, MAX_SHOWN); i++) rest.push({ index: i });
  if (count > MAX_SHOWN) rest.push({ index: MAX_SHOWN, more: count - MAX_SHOWN });
  for (let i = 0; i < rest.length; i += PER_BLOCK) {
    const tiles = rest.slice(i, i + PER_BLOCK);
    blocks.push({ kind: KIND_BY_COUNT[tiles.length], tiles });
  }
  return blocks;
}

function PhotoGrid({ photos, resolvePhoto, onOpen }: { photos: Photo[]; resolvePhoto: (uri: string) => string; onOpen: (index: number) => void }) {
  const tile = (tl: Tile, style?: object) => {
    const p = photos[tl.index];
    return (
      <Pressable
        key={p.id}
        accessibilityRole="imagebutton"
        accessibilityLabel={tl.more ? t('diary.morePhotos', { n: tl.more }) : t('diary.photoOpen')}
        onPress={() => onOpen(tl.index)}
        style={[styles.tile, style]}
      >
        <Image source={{ uri: resolvePhoto(thumbOf(p.uri)) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} recyclingKey={p.id} accessibilityIgnoresInvertColors />
        {isVideo(p.uri) && !tl.more && <Text style={styles.play}>▶</Text>}
        {tl.more ? (
          <View style={styles.more}>
            <Text style={styles.moreText}>{`+${tl.more}`}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };
  const col = (children: ReactNode[]) => <View style={styles.col}>{children}</View>;
  const row = (children: ReactNode[], key = 'r') => (
    <View key={key} style={styles.row}>
      {children}
    </View>
  );
  return (
    <View style={{ gap: GAP }}>
      {photoBlocks(photos.length).map((b, i) => {
        const [a, c, d, e, f] = b.tiles;
        switch (b.kind) {
          case 'cover':
            return <View key={i} style={{ aspectRatio: 4 / 3 }}>{tile(a, { flex: 1 })}</View>;
          case 'one':
            return <View key={i} style={{ aspectRatio: 3 / 2 }}>{tile(a, { flex: 1 })}</View>;
          case 'two':
            return <View key={i} style={[styles.row, { aspectRatio: 2 }]}>{tile(a)}{tile(c)}</View>;
          case 'three':
            return <View key={i} style={[styles.row, { aspectRatio: 2 }]}>{tile(a)}{col([tile(c), tile(d)])}</View>;
          case 'four':
            return <View key={i} style={[styles.row, { aspectRatio: 2 }]}>{tile(a)}{col([tile(c), row([tile(d), tile(e)])])}</View>;
          case 'five':
            return <View key={i} style={[styles.row, { aspectRatio: 2 }]}>{tile(a)}{col([row([tile(c), tile(d)], 'top'), row([tile(e), tile(f)], 'bottom')])}</View>;
        }
      })}
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
  card: {
    gap: space.sm,
    padding: space.sm,
    paddingBottom: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  thread: { alignSelf: 'center', width: 1.5, height: 28, backgroundColor: colors.line },
  row: { flex: 1, flexDirection: 'row', gap: GAP },
  col: { flex: 1, gap: GAP },
  tile: { flex: 1, overflow: 'hidden', borderRadius: radius.sm, backgroundColor: colors.accentSoft },
  more: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#fff', fontSize: fonts.size.lg, fontWeight: '700' },
  titleBlock: { alignItems: 'center', gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%' },
  place: { fontFamily: SERIF, fontSize: fonts.size.lg, color: colors.ink, flexShrink: 1, textAlign: 'center' },
  time: { fontSize: fonts.size.xs, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  edit: { paddingVertical: 2, paddingHorizontal: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  editText: { fontSize: fonts.size.xs, color: colors.inkSoft },
  prompt: { fontFamily: SERIF, fontSize: fonts.size.md, lineHeight: 26, color: colors.inkSoft, fontStyle: 'italic', textAlign: 'center', paddingVertical: space.xs },
  play: { position: 'absolute', left: 0, right: 0, top: '42%', textAlign: 'center', fontSize: 22, color: '#fff' },
  memo: { fontFamily: SERIF, fontSize: fonts.size.md, lineHeight: 26, color: colors.ink, paddingHorizontal: space.xs },
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

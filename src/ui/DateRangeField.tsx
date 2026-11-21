// 기간 입력 (숙소 체크인~체크아웃). 입력칸은 둘이지만 어느 칸을 눌러도 같은 달력이 열려
// 첫 날과 마지막 날을 차례로 누른다.
// 지난 날(기록)이든 1년 뒤(예약)든 제한 없이 고를 수 있고, 달·연도를 앞뒤로 넘길 수 있다.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Text } from '@/ui/Text';

import { Button, Row } from './kit';
import { SheetModal } from './SheetModal';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** 두 날짜 사이 밤 수 */
export function nightsBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** 한 달 달력 칸 (앞쪽 빈칸은 null) */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const out: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= count; d++) out.push(ymd(year, month, d));
  while (out.length % 7) out.push(null);
  return out;
}

/** 누른 날을 기간에 반영한다: 처음은 시작, 다음은 끝. 끝보다 앞을 누르면 시작을 다시 고른다. */
export function tapRange(range: { from?: string; to?: string }, day: string): { from?: string; to?: string } {
  if (!range.from || range.to) return { from: day, to: undefined };
  if (day <= range.from) return { from: day, to: undefined };
  return { from: range.from, to: day };
}

type Props = {
  /** 달력 창 제목 */
  label: string;
  /** 입력칸 두 개의 이름 (예: 체크인 / 체크아웃). 어느 칸을 눌러도 같은 달력이 열린다. */
  startLabel: string;
  endLabel: string;
  from?: string;
  to?: string;
  /** 처음 열 달 (값이 없을 때). 'YYYY-MM-DD' */
  openAt?: string;
  onChange: (from: string, to: string) => void;
};

export function DateRangeField({ label, startLabel, endLabel, from, to, openAt, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from?: string; to?: string }>({ from, to });
  const start = from ?? openAt ?? new Date().toISOString().slice(0, 10);
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  /** which: 누른 칸. 체크아웃 칸을 눌렀으면 체크아웃이 있는 달부터 보여 준다. */
  const show = (which: 'start' | 'end') => {
    setDraft({ from, to });
    const s = (which === 'end' ? to ?? from : from) ?? openAt ?? new Date().toISOString().slice(0, 10);
    setView({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 });
    setOpen(true);
  };
  const shift = (months: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + months, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const ready = !!draft.from && !!draft.to;
  const nights = from && to ? t('range.nights', { n: nightsBetween(from, to) }) : '';
  const field = (which: 'start' | 'end', name: string, value?: string, extra?: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => show(which)} style={({ pressed }) => [styles.field, pressed && { opacity: 0.7 }]}>
      <Text style={styles.label}>{name}</Text>
      <Text style={[styles.value, !value && styles.empty]} numberOfLines={1}>
        {value ? `${value.replaceAll('-', '. ')}${extra ? ` · ${extra}` : ''}` : t('picker.choose')}
      </Text>
    </Pressable>
  );
  return (
    <>
      {field('start', startLabel, from)}
      {field('end', endLabel, to, nights)}
      {open && (
        <SheetModal
          title={label}
          subtitle={!draft.from ? t('range.pickStart') : !draft.to ? t('range.pickEnd') : `${draft.from} → ${draft.to} · ${t('range.nights', { n: nightsBetween(draft.from, draft.to) })}`}
          onClose={() => setOpen(false)}
          footer={
            <Button
              label={t('picker.done')}
              style={!ready && { opacity: 0.4 }}
              onPress={() => {
                if (!draft.from || !draft.to) return;
                onChange(draft.from, draft.to);
                setOpen(false);
              }}
            />
          }
        >
          <View style={styles.nav}>
            <Nav label="«" a11y={t('range.prevYear')} onPress={() => shift(-12)} />
            <Nav label="‹" a11y={t('range.prevMonth')} onPress={() => shift(-1)} />
            <Text style={styles.month}>{t('range.month', { y: view.y, m: view.m + 1 })}</Text>
            <Nav label="›" a11y={t('range.nextMonth')} onPress={() => shift(1)} />
            <Nav label="»" a11y={t('range.nextYear')} onPress={() => shift(12)} />
          </View>
          <View style={styles.grid}>
            {WEEK.map((w, i) => (
              <Text key={w} style={[styles.week, i === 0 && { color: colors.danger }]}>
                {w}
              </Text>
            ))}
            {monthCells(view.y, view.m).map((d, i) => {
              if (!d) return <View key={`b${i}`} style={styles.cell} />;
              const edge = d === draft.from || d === draft.to;
              const inside = !!draft.from && !!draft.to && d > draft.from && d < draft.to;
              return (
                <Pressable key={d} accessibilityRole="button" accessibilityLabel={d} accessibilityState={{ selected: edge }} onPress={() => setDraft(tapRange(draft, d))} style={[styles.cell, inside && styles.inside]}>
                  <View style={[styles.dayDot, edge && styles.edge]}>
                    <Text style={[styles.dayText, edge && { color: colors.card, fontWeight: '700' }]}>{Number(d.slice(8))}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Row>
            <Text style={styles.hint}>{t('range.hint')}</Text>
          </Row>
        </SheetModal>
      )}
    </>
  );
}

function Nav({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={8} style={styles.navBtn}>
      <Text style={styles.navText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, borderRadius: radius.md, backgroundColor: colors.well, padding: space.md },
  label: { fontSize: fonts.size.md, color: colors.inkSoft },
  value: { flexShrink: 1, fontSize: fonts.size.md, color: colors.ink, fontWeight: '600' },
  empty: { color: colors.inkSoft, fontWeight: '400' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  navText: { fontSize: fonts.size.lg, color: colors.ink },
  month: { fontSize: fonts.size.md, fontWeight: '700', color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: `${100 / 7}%`, textAlign: 'center', fontSize: fonts.size.xs, color: colors.inkSoft, paddingVertical: space.xs },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  inside: { backgroundColor: colors.accentSoft },
  dayDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  edge: { backgroundColor: colors.ink },
  dayText: { fontSize: fonts.size.md, color: colors.ink, fontVariant: ['tabular-nums'] },
  hint: { flex: 1, fontSize: fonts.size.xs, color: colors.inkSoft },
});

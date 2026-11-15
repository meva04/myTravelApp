// 날짜·시간 입력칸. 누르면 아래에서 iOS 기본 선택기(시간은 휠, 날짜는 달력)가 올라온다.
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, labelsHidden } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';

import { Button, Row } from './kit';
import { SheetModal } from './SheetModal';

const pad = (n: number) => String(n).padStart(2, '0');
const toHHmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD' 를 기기 현지 자정 Date 로 */
const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** 'HH:mm' 을 오늘 그 시각의 Date 로 (선택기에 보여줄 시작값) */
const fromHHmm = (s: string) => {
  const d = new Date();
  const [h, m] = s.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

type Base = { label: string; onChange: (v: string) => void };

/** 'HH:mm' 시간 입력. 비울 수 있다. */
export function TimeField({ label, value, onChange, defaultTime = '10:00' }: Base & { value: string; defaultTime?: string }) {
  return <PickerField label={label} value={value} onChange={onChange} kind="time" initial={fromHHmm(value || defaultTime)} clearable />;
}

/** 'YYYY-MM-DD' 날짜 입력 (달력). min/max 로 고를 수 있는 날을 정한다. */
export function DateField({ label, value, onChange, min, max }: Base & { value: string; min?: string; max?: string }) {
  return <PickerField label={label} value={value} onChange={onChange} kind="date" initial={value ? fromYmd(value) : min ? fromYmd(min) : new Date()} min={min} max={max} />;
}

function PickerField({ label, value, onChange, kind, initial, min, max, clearable = false }: Base & { value: string; kind: 'time' | 'date'; initial: Date; min?: string; max?: string; clearable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const show = () => {
    setDraft(initial);
    setOpen(true);
  };
  const done = () => {
    onChange(kind === 'time' ? toHHmm(draft) : toYmd(draft));
    setOpen(false);
  };
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={show} style={({ pressed }) => [styles.field, pressed && { opacity: 0.7 }]}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !value && styles.empty]}>{value ? (kind === 'date' ? value.replaceAll('-', '. ') : value) : t('picker.choose')}</Text>
      </Pressable>
      {open && (
        <SheetModal
          title={label}
          onClose={() => setOpen(false)}
          footer={
            <Row>
              <Button label={t('picker.done')} onPress={done} style={{ flex: 1 }} />
              {clearable && value !== '' && (
                <Button
                  kind="ghost"
                  label={t('picker.clear')}
                  onPress={() => {
                    onChange('');
                    setOpen(false);
                  }}
                />
              )}
            </Row>
          }
        >
          <Host matchContents style={{ alignSelf: 'center' }}>
            <DatePicker
              title={label}
              selection={draft}
              displayedComponents={[kind === 'time' ? 'hourAndMinute' : 'date']}
              range={min || max ? { start: min ? fromYmd(min) : undefined, end: max ? fromYmd(max) : undefined } : undefined}
              onDateChange={setDraft}
              modifiers={[datePickerStyle(kind === 'time' ? 'wheel' : 'graphical'), labelsHidden()]}
            />
          </Host>
        </SheetModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: space.md,
  },
  label: { fontSize: fonts.size.md, color: colors.inkSoft },
  value: { fontSize: fonts.size.md, color: colors.ink, fontWeight: '600' },
  empty: { color: colors.inkSoft, fontWeight: '400' },
});

// 체크리스트 부품. editable 이면 항목을 고치고 지우고 더할 수 있고, 아니면 체크만 할 수 있다.
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { toggleItem, type CheckItem } from '@/domain/checklist';
import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';

type Props = {
  items: CheckItem[];
  onChange: (items: CheckItem[]) => void;
  editable?: boolean;
  /** 새 항목 칸의 안내 문구 (editable 일 때) */
  placeholder?: string;
  /** 보기 모드에서 이만큼만 보이고 나머지는 "외 N개" */
  max?: number;
  compact?: boolean;
  /** 처음 열 때 새 항목 칸에 바로 입력 */
  autoFocus?: boolean;
};

export function Checklist({ items, onChange, editable = false, placeholder, max, compact = false, autoFocus = false }: Props) {
  // 마지막의 빈 칸에 글자를 치면 그 칸이 그대로 새 항목이 된다 (같은 key 라 입력 중 포커스가 유지된다).
  const seq = useRef(0);
  const [newId, setNewId] = useState(() => `n${Date.now()}`);
  const newInput = useRef<ComponentRef<typeof TextInput>>(null);

  const shown = !editable && max !== undefined ? items.slice(0, max) : items;
  const rest = items.length - shown.length;
  const update = (id: string, text: string) => onChange(items.map((it) => (it.id === id ? { ...it, text } : it)));
  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));
  const addFrom = (text: string) => {
    if (text === '') return;
    onChange([...items, { id: newId, text, done: false }]);
    setNewId(`n${Date.now()}-${++seq.current}`);
  };

  return (
    <View style={{ gap: compact ? 2 : space.xs }}>
      {[...shown, ...(editable ? [null] : [])].map((it) =>
        it ? (
          <View key={it.id} style={styles.row}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: it.done }}
              accessibilityLabel={it.text}
              hitSlop={8}
              onPress={() => onChange(toggleItem(items, it.id))}
              style={[styles.box, compact && styles.boxSmall, it.done && styles.boxOn]}
            >
              {it.done && <Text style={[styles.tick, compact && { fontSize: 10 }]}>✓</Text>}
            </Pressable>
            {editable ? (
              <TextInput
                style={[styles.text, styles.input, it.done && styles.done]}
                value={it.text}
                onChangeText={(v) => update(it.id, v)}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => newInput.current?.focus()}
              />
            ) : (
              <Text style={[styles.text, compact && styles.textSmall, it.done && styles.done]}>{it.text}</Text>
            )}
            {editable && (
              <Pressable accessibilityRole="button" accessibilityLabel={`${it.text} ${t('common.delete')}`} hitSlop={8} onPress={() => remove(it.id)}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            )}
          </View>
        ) : (
          // 새 항목 칸. 글자를 치면 같은 key 의 항목으로 바뀌어 입력 칸이 그대로 이어진다.
          <View key={newId} style={styles.row}>
            <Pressable disabled style={[styles.box, styles.boxNew]} />
            <TextInput
              ref={newInput}
              style={[styles.text, styles.input]}
              placeholder={placeholder ?? t('check.add')}
              placeholderTextColor={colors.inkSoft}
              value=""
              onChangeText={addFrom}
              autoFocus={autoFocus}
              returnKeyType="done"
            />
          </View>
        ),
      )}
      {rest > 0 && <Text style={styles.more}>{t('check.more', { n: rest })}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  box: { width: 20, height: 20, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  boxSmall: { width: 16, height: 16 },
  boxOn: { backgroundColor: colors.ok, borderColor: colors.ok },
  boxNew: { borderStyle: 'dashed', borderColor: colors.line },
  tick: { color: colors.card, fontSize: 12, fontWeight: '700' },
  text: { flex: 1, fontSize: fonts.size.sm, color: colors.ink },
  textSmall: { fontSize: fonts.size.sm - 1 },
  input: { paddingVertical: space.xs },
  done: { color: colors.inkSoft, textDecorationLine: 'line-through' },
  remove: { fontSize: fonts.size.sm, color: colors.inkSoft, paddingHorizontal: space.xs },
  more: { fontSize: fonts.size.xs, color: colors.inkSoft, marginLeft: 28 },
});

// 이동 메모 화면. 장소 화면과 같은 구성이되 구글 장소 정보만 없다: 할 일, 기록, 사진, 비용.
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { peopleOf, summarizeExpenses } from '@/domain/expenses';
import type { Photo } from '@/domain/types';
import { t } from '@/i18n/ko';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { currencyChoices, defaultCurrencyOf } from '@/domain/currency';
import { localToday } from '@/location/clock';
import { addExpense } from '@/state/expenseOps';
import { Text, TextInput } from '@/ui/Text';
import { formatAmounts, formatMoney } from '@/ui/format';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/ui/kit';

type Props = {
  noteId: string;
  pickPhoto: (source: 'library' | 'camera') => Promise<Omit<Photo, 'id' | 'stopId'>[]>;
  resolvePhoto: (uri: string) => string;
  onPhotoRemoved?: (uri: string) => void;
  /** 메모를 지운 뒤 (이전 화면으로 돌아가기) */
  onRemoved?: () => void;
  refreshKey?: number;
};

export function NoteScreen({ noteId, pickPhoto, resolvePhoto, onPhotoRemoved, onRemoved, refreshKey = 0 }: Props) {
  const sv = useServices();
  const { repo } = sv;
  const { data, reload } = useLoad(async () => {
    const note = await repo.getNote(noteId);
    const day = note && (await repo.getDay(note.dayId));
    const trip = day && (await repo.getTrip(day.tripId));
    if (!note || !day || !trip) return null;
    // 일정에서 이 메모 바로 앞·뒤의 장소 (가는 길)
    const stops = await repo.listStops(day.id);
    const seq = await repo.listSequence(day.id);
    const at = seq.findIndex((x) => x.id === noteId);
    const visible = (id: string) => stops.find((s) => s.id === id && !s.skipped);
    const from = seq.slice(0, at).reverse().map((x) => (x.kind === 'stop' ? visible(x.id) : undefined)).find(Boolean);
    const to = seq.slice(at + 1).map((x) => (x.kind === 'stop' ? visible(x.id) : undefined)).find(Boolean);
    const expenses = (await repo.listExpenses(trip.id)).filter((e) => e.noteId === noteId);
    return { note, from, to, day, trip, expenses, photos: await repo.listNotePhotos(noteId) };
  }, [noteId, refreshKey]);
  const [text, setText] = useState<string>();
  const [memo, setMemo] = useState<string>();

  if (!data) return <Screen>{null}</Screen>;
  const { note, from, to, day, trip, expenses, photos } = data;

  // 화면의 옛 사본으로 다른 칸을 덮어쓰지 않도록, 바꾼 칸만 저장한다.
  const saveText = async () => {
    if (text === undefined || text.trim() === '' || text === note.text) return;
    await repo.updateNote(noteId, { text: text.trim() });
    reload();
  };
  const saveMemo = async () => {
    if (memo === undefined || memo === note.memo) return;
    await repo.updateNote(noteId, { memo });
    reload();
  };
  const toggle = async () => {
    await repo.updateNote(noteId, { done: !note.done });
    reload();
  };
  const addPhoto = async (source: 'library' | 'camera') => {
    for (const picked of await pickPhoto(source)) await repo.addPhoto({ ...picked, stopId: null, noteId });
    reload();
  };
  const removePhoto = async (p: Photo) => {
    await repo.deletePhoto(p.id);
    onPhotoRemoved?.(p.uri);
    reload();
  };
  const remove = () =>
    Alert.alert(t('note.deleteTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          for (const uri of await repo.deleteNote(noteId)) onPhotoRemoved?.(uri);
          onRemoved?.();
        },
      },
    ]);

  // 이 메모에 붙인 비용만의 합계
  const summary = summarizeExpenses(expenses, trip);
  const subtotal = summary.total;
  const unconverted = formatAmounts(summary.unconverted);

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.route}>{from && to ? t('note.route', { from: from.name, to: to.name }) : from ? t('note.from', { from: from.name }) : to ? t('note.to', { to: to.name }) : t('leg.note')}</Text>
        <View style={styles.titleRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: note.done }}
            accessibilityLabel={note.text}
            hitSlop={8}
            onPress={() => void toggle()}
            style={[styles.box, note.done && styles.boxOn]}
          >
            {note.done && <Text style={styles.tick}>✓</Text>}
          </Pressable>
          <TextInput
            style={[styles.title, note.done && styles.done]}
            value={text ?? note.text}
            onChangeText={setText}
            onBlur={() => void saveText()}
            multiline
          />
        </View>
      </View>

      <Card>
        <Txt kind="heading">{t('note.record')}</Txt>
        <Field placeholder={t('note.memoPlaceholder')} value={memo ?? note.memo} onChangeText={setMemo} onBlur={() => void saveMemo()} multiline />
      </Card>

      <Card>
        <Txt kind="heading">{t('stop.photos')}</Txt>
        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {photos.map((p) => (
              <View key={p.id} style={{ gap: space.xs }}>
                <Image source={{ uri: resolvePhoto(p.uri) }} style={styles.photo} />
                <Chip label={t('common.delete')} onPress={() => void removePhoto(p)} />
              </View>
            ))}
          </ScrollView>
        )}
        <Row>
          <Button kind="ghost" label={t('stop.addPhoto')} onPress={() => void addPhoto('library')} />
          <Button kind="ghost" label={t('stop.takePhoto')} onPress={() => void addPhoto('camera')} />
        </Row>
      </Card>

      <Card>
        <Txt kind="heading">{t('stop.expenses')}</Txt>
        {expenses.map((e) => (
          <Row key={e.id}>
            <Txt style={{ flex: 1 }}>
              {t(`cat.${e.category}`)}
              {e.memo ? ` · ${e.memo}` : ''}
            </Txt>
            <Txt>{formatMoney(e.amount, e.currency)}</Txt>
            <Chip
              label={t('common.delete')}
              onPress={async () => {
                await repo.deleteExpense(e.id);
                reload();
              }}
            />
          </Row>
        ))}
        <Txt kind="soft">{t('stop.subtotal', { amount: formatMoney(subtotal, trip.baseCurrency) })}</Txt>
        {unconverted !== '' && <Txt kind="soft">{`${t('expense.unconverted')}: ${unconverted}`}</Txt>}
        <ExpenseForm
          defaultCurrency={defaultCurrencyOf(trip, localToday())}
          currencies={currencyChoices(trip)}
          people={peopleOf(trip)}
          onAdd={async (e) => {
            await addExpense(sv, trip, { ...e, date: day.date, stopId: null, noteId });
            reload();
          }}
        />
      </Card>

      <Button kind="danger" label={t('note.delete')} onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm },
  route: { fontSize: fonts.size.sm, color: colors.route, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  box: { width: 26, height: 26, marginTop: 4, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  boxOn: { backgroundColor: colors.ok, borderColor: colors.ok },
  tick: { color: colors.card, fontWeight: '700' },
  title: { flex: 1, fontSize: fonts.size.xl, fontWeight: '700', color: colors.ink, padding: 0 },
  done: { color: colors.inkSoft, textDecorationLine: 'line-through' },
  photo: { width: 120, height: 120, borderRadius: radius.md },
});

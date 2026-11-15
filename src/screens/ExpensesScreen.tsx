import { useState } from 'react';
import { Alert } from 'react-native';

import { peopleOf, settle, splitOf, summarizeExpenses } from '@/domain/expenses';
import { CATEGORIES, ME, type Expense } from '@/domain/types';
import { t } from '@/i18n/ko';
import { useLoad, useServices } from '@/state/ServicesContext';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { formatMoney, isDate } from '@/ui/format';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/ui/kit';
import { DateField } from '@/ui/PickerField';

export function ExpensesScreen({ tripId, onEditRates, refreshKey = 0, today }: { tripId: string; onEditRates: () => void; refreshKey?: number; today?: string }) {
  const { repo, newId } = useServices();
  const { data, reload } = useLoad(async () => {
    const trip = await repo.getTrip(tripId);
    return trip ? { trip, expenses: await repo.listExpenses(tripId) } : null;
  }, [tripId, refreshKey]);
  const [date, setDate] = useState<string>();
  const [badDate, setBadDate] = useState(false);
  const [name, setName] = useState('');

  if (!data) return <Screen>{null}</Screen>;
  const { trip, expenses } = data;
  const s = summarizeExpenses(expenses, trip);
  const base = trip.baseCurrency;
  const unconverted = Object.entries(s.unconverted);
  // 여행 중이면 오늘, 아니면 첫날을 기본값으로 둔다.
  const defaultDate = today && today >= trip.startDate && today <= trip.endDate ? today : trip.startDate;
  const looseDate = date ?? defaultDate;
  const people = peopleOf(trip);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '나';
  const st = settle(expenses, trip);
  const me = st.people.find((p) => p.id === ME)!;
  const shared = people.length > 1;
  // 비용 줄에 붙는 "민수 냄 · 3명"
  const tagOf = (e: Expense) => (shared ? ` · ${t('split.tag', { payer: nameOf(e.paidBy ?? ME), n: splitOf(e, trip).length })}` : '');

  const addPerson = async () => {
    const n = name.trim();
    if (!n || people.some((p) => p.name === n)) return setName('');
    await repo.updateTrip({ ...trip, members: [...(trip.members ?? []), { id: newId(), name: n }] });
    setName('');
    reload();
  };
  const removePerson = async (id: string) => {
    if (expenses.some((e) => e.paidBy === id || splitOf(e, trip).includes(id))) return Alert.alert(nameOf(id), t('split.inUse'));
    await repo.updateTrip({ ...trip, members: (trip.members ?? []).filter((m) => m.id !== id) });
    reload();
  };

  const remove = (id: string) =>
    Alert.alert(t('expense.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await repo.deleteExpense(id);
          reload();
        },
      },
    ]);

  return (
    <Screen>
      <Card>
        <Txt kind="soft">{t('expense.total')}</Txt>
        <Txt kind="title">{formatMoney(s.total, base)}</Txt>
        {expenses.length === 0 && <Txt kind="soft">{t('expense.none')}</Txt>}
      </Card>

      <Card>
        <Txt kind="heading">{t('split.people')}</Txt>
        <Txt kind="small">{t('split.peopleHint')}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {people.map((p) =>
            p.id === ME ? (
              <Chip key={p.id} label={p.name} selected onPress={() => {}} />
            ) : (
              <Chip key={p.id} label={`${p.name} ✕`} accessibilityLabel={`${p.name} ${t('common.delete')}`} onPress={() => void removePerson(p.id)} />
            ),
          )}
        </Row>
        <Row>
          <Field style={{ flex: 1 }} placeholder={t('split.addName')} value={name} onChangeText={setName} onSubmitEditing={() => void addPerson()} returnKeyType="done" />
          <Chip label={t('split.add')} onPress={() => void addPerson()} />
        </Row>
      </Card>

      {shared && (
        <Card>
          <Txt kind="heading">{t('split.title')}</Txt>
          <Txt kind="soft">{me.balance < -0.5 ? t('split.mine') : me.balance > 0.5 ? t('split.mineGet') : t('split.even')}</Txt>
          {Math.abs(me.balance) > 0.5 && <Txt kind="title">{formatMoney(Math.abs(me.balance), base)}</Txt>}
          {st.transfers.map((tr, i) => (
            <Txt key={i}>{t('split.transfer', { from: nameOf(tr.from), to: nameOf(tr.to), amount: formatMoney(tr.amount, base) })}</Txt>
          ))}
          {st.people.map((p) => (
            <Row key={p.id}>
              <Txt style={{ flex: 1 }}>{p.name}</Txt>
              <Txt kind="soft">{t('split.row', { paid: formatMoney(p.paid, base), share: formatMoney(p.share, base) })}</Txt>
            </Row>
          ))}
          {Object.keys(st.unconverted).length > 0 && (
            <Txt kind="small">{t('split.skipped', { list: Object.entries(st.unconverted).map(([c, a]) => formatMoney(a, c)).join(', ') })}</Txt>
          )}
        </Card>
      )}

      {unconverted.length > 0 && (
        <Card>
          <Txt kind="heading">{t('expense.unconverted')}</Txt>
          {unconverted.map(([cur, amount]) => (
            <Txt key={cur}>{formatMoney(amount, cur)}</Txt>
          ))}
          <Button kind="ghost" label={t('expense.setRate')} onPress={onEditRates} />
        </Card>
      )}

      <Card>
        <Txt kind="heading">{t('expense.byDate')}</Txt>
        {[...new Set(expenses.map((e) => e.date))].sort().map((d) => (
          <Card key={d}>
            <Row>
              <Txt kind="heading" style={{ flex: 1 }}>
                {d}
              </Txt>
              <Txt>{formatMoney(s.byDate[d] ?? 0, base)}</Txt>
            </Row>
            {expenses
              .filter((e) => e.date === d)
              .map((e) => (
                <Row key={e.id}>
                  <Txt kind="soft" style={{ flex: 1 }}>
                    {(e.memo ? `${t(`cat.${e.category}`)} · ${e.memo}` : t(`cat.${e.category}`)) + tagOf(e)}
                  </Txt>
                  <Txt kind="soft">{formatMoney(e.amount, e.currency)}</Txt>
                  <Chip label="×" accessibilityLabel={t('expense.deleteLabel', { name: e.memo || t(`cat.${e.category}`) })} onPress={() => remove(e.id)} />
                </Row>
              ))}
          </Card>
        ))}
      </Card>

      <Card>
        <Txt kind="heading">{t('expense.byCategory')}</Txt>
        {CATEGORIES.filter((c) => s.byCategory[c] > 0).map((c) => (
          <Row key={c}>
            <Txt style={{ flex: 1 }}>{t(`cat.${c}`)}</Txt>
            <Txt>{formatMoney(s.byCategory[c], base)}</Txt>
          </Row>
        ))}
      </Card>

      <Card>
        <Txt kind="heading">{t('expense.addLoose')}</Txt>
        <DateField label={t('expense.date')} value={looseDate} onChange={setDate} min={trip.startDate} max={trip.endDate} />
        {badDate && <Txt kind="soft">{t('expense.badDate')}</Txt>}
        <ExpenseForm
          defaultCurrency={base}
          people={people}
          onAdd={async (e) => {
            const ok = isDate(looseDate) && looseDate >= trip.startDate && looseDate <= trip.endDate;
            setBadDate(!ok);
            if (!ok) return false;
            await repo.addExpense({ ...e, tripId, date: looseDate, stopId: null });
            reload();
          }}
        />
      </Card>
    </Screen>
  );
}

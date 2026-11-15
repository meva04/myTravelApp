import { useState } from 'react';
import { Alert } from 'react-native';

import { summarizeExpenses } from '@/domain/expenses';
import { CATEGORIES } from '@/domain/types';
import { t } from '@/i18n/ko';
import { useLoad, useServices } from '@/state/ServicesContext';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { formatMoney, isDate } from '@/ui/format';
import { Button, Card, Chip, Row, Screen, Txt } from '@/ui/kit';
import { DateField } from '@/ui/PickerField';

export function ExpensesScreen({ tripId, onEditRates, refreshKey = 0, today }: { tripId: string; onEditRates: () => void; refreshKey?: number; today?: string }) {
  const { repo } = useServices();
  const { data, reload } = useLoad(async () => {
    const trip = await repo.getTrip(tripId);
    return trip ? { trip, expenses: await repo.listExpenses(tripId) } : null;
  }, [tripId, refreshKey]);
  const [date, setDate] = useState<string>();
  const [badDate, setBadDate] = useState(false);

  if (!data) return <Screen>{null}</Screen>;
  const { trip, expenses } = data;
  const s = summarizeExpenses(expenses, trip);
  const base = trip.baseCurrency;
  const unconverted = Object.entries(s.unconverted);
  // 여행 중이면 오늘, 아니면 첫날을 기본값으로 둔다.
  const defaultDate = today && today >= trip.startDate && today <= trip.endDate ? today : trip.startDate;
  const looseDate = date ?? defaultDate;
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
                    {e.memo ? `${t(`cat.${e.category}`)} · ${e.memo}` : t(`cat.${e.category}`)}
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

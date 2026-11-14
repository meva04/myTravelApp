import { useState } from 'react';

import { summarizeExpenses } from '@/domain/expenses';
import { CATEGORIES } from '@/domain/types';
import { t } from '@/i18n/ko';
import { useLoad, useServices } from '@/state/ServicesContext';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { formatMoney, isDate } from '@/ui/format';
import { Button, Card, Field, Row, Screen, Txt } from '@/ui/kit';

export function ExpensesScreen({ tripId, onEditRates, refreshKey = 0 }: { tripId: string; onEditRates: () => void; refreshKey?: number }) {
  const { repo } = useServices();
  const { data, reload } = useLoad(async () => {
    const trip = await repo.getTrip(tripId);
    return trip ? { trip, expenses: await repo.listExpenses(tripId) } : null;
  }, [tripId, refreshKey]);
  const [date, setDate] = useState('');

  if (!data) return <Screen>{null}</Screen>;
  const { trip, expenses } = data;
  const s = summarizeExpenses(expenses, trip);
  const base = trip.baseCurrency;
  const unconverted = Object.entries(s.unconverted);
  const looseDate = isDate(date) ? date : trip.startDate;

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
        {Object.keys(s.byDate).sort().map((d) => (
          <Row key={d}>
            <Txt style={{ flex: 1 }}>{d}</Txt>
            <Txt>{formatMoney(s.byDate[d], base)}</Txt>
          </Row>
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
        <Field placeholder={t('expense.date')} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <ExpenseForm
          defaultCurrency={base}
          onAdd={async (e) => {
            await repo.addExpense({ ...e, tripId, date: looseDate, stopId: null });
            reload();
          }}
        />
      </Card>
    </Screen>
  );
}

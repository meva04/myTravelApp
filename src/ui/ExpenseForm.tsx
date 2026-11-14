import { useState } from 'react';

import { CATEGORIES, type Category } from '@/domain/types';
import { t } from '@/i18n/ko';

import { Button, Chip, Field, Row, Txt } from './kit';

export type ExpenseInput = { amount: number; currency: string; category: Category; memo: string };

export function ExpenseForm({ defaultCurrency, onAdd }: { defaultCurrency: string; onAdd: (e: ExpenseInput) => Promise<void> | void }) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [category, setCategory] = useState<Category>('food');
  const [memo, setMemo] = useState('');
  const [invalid, setInvalid] = useState(false);

  const add = async () => {
    const value = Number(amount.replace(/,/g, ''));
    const cur = currency.trim().toUpperCase();
    const ok = amount.trim() !== '' && Number.isFinite(value) && value > 0 && /^[A-Z]{3}$/.test(cur);
    setInvalid(!ok);
    if (!ok) return;
    await onAdd({ amount: value, currency: cur, category, memo: memo.trim() });
    setAmount('');
    setMemo('');
  };

  return (
    <>
      <Row>
        <Field style={{ flex: 2 }} placeholder={t('expense.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Field style={{ flex: 1 }} placeholder={t('expense.currency')} value={currency} onChangeText={setCurrency} autoCapitalize="characters" />
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={t(`cat.${c}`)} selected={c === category} onPress={() => setCategory(c)} />
        ))}
      </Row>
      <Field placeholder={t('expense.memo')} value={memo} onChangeText={setMemo} />
      {invalid && <Txt kind="soft">{t('expense.invalid')}</Txt>}
      <Button kind="ghost" label={t('expense.add')} onPress={add} />
    </>
  );
}

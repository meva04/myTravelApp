import { useState } from 'react';

import { CATEGORIES, ME, type Category, type Id } from '@/domain/types';
import { t } from '@/i18n/ko';

import { Button, Chip, Field, Row, Txt } from './kit';

export type ExpenseInput = { amount: number; currency: string; category: Category; memo: string; paidBy: Id | null; splitWith: Id[] | null };

type Props = {
  defaultCurrency: string;
  /** 여행에 함께하는 사람들 (나 포함). 둘 이상이면 낸 사람·나눌 사람을 고른다. */
  people?: { id: Id; name: string }[];
  onAdd: (e: ExpenseInput) => Promise<void | false> | void | false;
};

export function ExpenseForm({ defaultCurrency, people = [], onAdd }: Props) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [category, setCategory] = useState<Category>('food');
  const [memo, setMemo] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [paidBy, setPaidBy] = useState<Id>(ME);
  // 처음에는 모두와 나눈다. 빼고 싶은 사람을 누르면 빠진다.
  const [out, setOut] = useState<Id[]>([]);
  const shared = people.length > 1;
  const split = people.map((p) => p.id).filter((id) => !out.includes(id));

  const add = async () => {
    const value = Number(amount.replace(/,/g, ''));
    const cur = currency.trim().toUpperCase();
    const ok = amount.trim() !== '' && Number.isFinite(value) && value > 0 && /^[A-Z]{3}$/.test(cur) && (!shared || split.length > 0);
    setInvalid(!ok);
    if (!ok) return;
    const input: ExpenseInput = {
      amount: value,
      currency: cur,
      category,
      memo: memo.trim(),
      paidBy: shared && paidBy !== ME ? paidBy : null,
      splitWith: shared && out.length ? split : null, // 모두와 나누면 저장하지 않는다 (나중에 사람이 늘어도 모두)
    };
    if ((await onAdd(input)) === false) return; // 바깥에서 거절하면 입력을 남겨둔다
    setAmount('');
    setMemo('');
    setPaidBy(ME);
    setOut([]);
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
      {shared && (
        <>
          <Txt kind="small">{t('split.paidBy')}</Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            {people.map((p) => (
              <Chip key={p.id} label={p.name} selected={paidBy === p.id} accessibilityLabel={`${t('split.paidBy')} ${p.name}`} onPress={() => setPaidBy(p.id)} />
            ))}
          </Row>
          <Txt kind="small">{t('split.with', { n: split.length })}</Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            {people.map((p) => {
              const on = !out.includes(p.id);
              return (
                <Chip
                  key={p.id}
                  label={on ? `✓ ${p.name}` : p.name}
                  selected={on}
                  accessibilityLabel={`${t('split.withLabel')} ${p.name}`}
                  onPress={() => setOut(on ? [...out, p.id] : out.filter((x) => x !== p.id))}
                />
              );
            })}
          </Row>
        </>
      )}
      {invalid && <Txt kind="soft">{t(shared && split.length === 0 ? 'split.nobody' : 'expense.invalid')}</Txt>}
      <Button kind="ghost" label={t('expense.add')} onPress={add} />
    </>
  );
}

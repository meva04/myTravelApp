// 돈을 원화·현지 통화·달러로 바꿔 보기, 나라·도시 이름으로 현지 통화 정하기
import { useState } from 'react';

import { currencyFromInput, fromBase } from '@/domain/currency';
import type { Trip } from '@/domain/types';
import { t } from '@/i18n/ko';

import { formatMoney } from './format';
import { Chip, Field, Row, Txt } from './kit';

/** 기준 통화 금액을 고른 통화로 적는다. 환율을 모르면 기준 통화로. */
export function moneyIn(amountBase: number, cur: string, trip: Pick<Trip, 'baseCurrency' | 'rates'>): string {
  const v = fromBase(amountBase, cur, trip);
  return v === null ? formatMoney(amountBase, trip.baseCurrency) : formatMoney(v, cur);
}

/** 볼 통화 고르기 (원화 / 현지 / 달러) */
export function ShowInChips({ choices, value, onChange }: { choices: string[]; value: string; onChange: (c: string) => void }) {
  if (choices.length < 2) return null;
  return (
    <Row style={{ flexWrap: 'wrap' }}>
      {choices.map((c) => (
        <Chip key={c} label={c} selected={c === value} accessibilityLabel={`${t('expense.showIn')} ${c}`} onPress={() => onChange(c)} />
      ))}
    </Row>
  );
}

/** 고른 통화의 환율 한 줄 ("1 JPY = 9.1 KRW") */
export function RateLine({ cur, trip }: { cur: string; trip: Pick<Trip, 'baseCurrency' | 'rates'> }) {
  if (cur === trip.baseCurrency) return null;
  const r = trip.rates[cur];
  const rate = r ? (r >= 100 ? Math.round(r).toLocaleString('ko-KR') : String(Math.round(r * 100) / 100)) : '';
  return <Txt kind="small">{r ? t('settings.rateNow', { cur, rate, base: trip.baseCurrency }) : t('expense.rateNone', { cur })}</Txt>;
}

/** 나라·도시 이름이나 통화 코드를 적으면 현지 통화를 찾아 정한다 */
export function LocalCurrencyField({ value, onChange }: { value: string | null | undefined; onChange: (cur: string) => void }) {
  const [q, setQ] = useState('');
  const found = q.trim() ? currencyFromInput(q) : null;
  return (
    <>
      <Txt kind="small">{value ? t('currency.local', { cur: value }) : t('currency.localNone')}</Txt>
      <Row>
        <Field style={{ flex: 1 }} placeholder={t('currency.search')} value={q} onChangeText={setQ} returnKeyType="done" onSubmitEditing={() => found && (onChange(found), setQ(''))} />
        {found && (
          <Chip
            label={t('currency.use', { cur: found })}
            selected
            onPress={() => {
              onChange(found);
              setQ('');
            }}
          />
        )}
      </Row>
      {q.trim() !== '' && !found && <Txt kind="small">{t('currency.notFound')}</Txt>}
    </>
  );
}

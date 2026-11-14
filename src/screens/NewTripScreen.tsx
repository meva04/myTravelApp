import { useState } from 'react';

import { t } from '@/i18n/ko';
import { useServices } from '@/state/ServicesContext';
import { isDate } from '@/ui/format';
import { Button, Field, Screen, Txt } from '@/ui/kit';

const MAX_DAYS = 90;

export function NewTripScreen({ onDone }: { onDone: (tripId: string) => void }) {
  const { repo } = useServices();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [baseCurrency, setCur] = useState('KRW');
  const [invalid, setInvalid] = useState(false);

  const save = async () => {
    const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
    const ok = name.trim() !== '' && isDate(startDate) && isDate(endDate) && days >= 0 && days < MAX_DAYS && /^[A-Za-z]{3}$/.test(baseCurrency.trim());
    setInvalid(!ok);
    if (!ok) return;
    const trip = await repo.createTrip({
      name: name.trim(), city: city.trim(), startDate, endDate, baseCurrency: baseCurrency.trim().toUpperCase(),
    });
    onDone(trip.id);
  };

  return (
    <Screen>
      <Field placeholder={t('trip.name')} value={name} onChangeText={setName} />
      <Field placeholder={t('trip.city')} value={city} onChangeText={setCity} />
      <Field placeholder={t('trip.startDate')} value={startDate} onChangeText={setStart} keyboardType="numbers-and-punctuation" />
      <Field placeholder={t('trip.endDate')} value={endDate} onChangeText={setEnd} keyboardType="numbers-and-punctuation" />
      <Field placeholder={t('trip.baseCurrency')} value={baseCurrency} onChangeText={setCur} autoCapitalize="characters" />
      {invalid && <Txt kind="soft">{t('trip.invalid')}</Txt>}
      <Button label={t('common.save')} onPress={save} />
    </Screen>
  );
}

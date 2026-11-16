import { useState } from 'react';
import { View } from 'react-native';

import { currencyOfPlace } from '@/domain/currency';
import type { Booking } from '@/domain/types';
import { t } from '@/i18n/ko';
import { applyBooking } from '@/state/itineraryOps';
import { useServices } from '@/state/ServicesContext';
import { space } from '@/theme/tokens';
import { blankBooking, BookingSheet, bookingSummary } from '@/ui/BookingSheet';
import { isDate } from '@/ui/format';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/ui/kit';
import { LocalCurrencyField } from '@/ui/Money';
import { DateField } from '@/ui/PickerField';

const MAX_DAYS = 90;

/** 여러 도시를 ', ' 로 이어 저장한다 */
export const joinCities = (cities: string[]) => cities.join(', ');
export const splitCities = (city: string) => city.split(',').map((c) => c.trim()).filter(Boolean);

export function NewTripScreen({ onDone }: { onDone: (tripId: string) => void }) {
  const sv = useServices();
  const { repo } = sv;
  const [name, setName] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [cityDraft, setCityDraft] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [baseCurrency, setCur] = useState('KRW');
  const [invalid, setInvalid] = useState(false);
  // 현지 통화: 직접 고르지 않으면 첫 도시 이름으로 정한다
  const [pickedLocal, setLocal] = useState<string>();
  const firstCity = cities[0] ?? cityDraft;
  const localCurrency = pickedLocal ?? (firstCity.trim() ? currencyOfPlace(firstCity) : null);
  // 예약은 여행을 만든 뒤 일정에 넣는다. 아직 예약 전이면 비워 두고 나중에 예약 화면에서 더한다.
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [editing, setEditing] = useState<Booking | null>(null);

  const addCity = () => {
    const c = cityDraft.trim();
    if (c && !cities.includes(c)) setCities([...cities, c]);
    setCityDraft('');
  };

  const save = async () => {
    const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
    const ok = name.trim() !== '' && isDate(startDate) && isDate(endDate) && days >= 0 && days < MAX_DAYS && /^[A-Za-z]{3}$/.test(baseCurrency.trim());
    setInvalid(!ok);
    if (!ok) return;
    const all = cityDraft.trim() && !cities.includes(cityDraft.trim()) ? [...cities, cityDraft.trim()] : cities;
    const trip = await repo.createTrip({
      name: name.trim(), city: joinCities(all), startDate, endDate, baseCurrency: baseCurrency.trim().toUpperCase(), localCurrency,
    });
    for (const b of bookings) await applyBooking(sv, { ...b, tripId: trip.id });
    onDone(trip.id);
  };

  return (
    <Screen>
      <Field placeholder={t('trip.name')} value={name} onChangeText={setName} />
      <View style={{ gap: space.sm }}>
        <Row>
          <Field style={{ flex: 1 }} placeholder={t('trip.city')} value={cityDraft} onChangeText={setCityDraft} onSubmitEditing={addCity} returnKeyType="done" submitBehavior="submit" />
          <Chip label={t('trip.addCity')} onPress={addCity} />
        </Row>
        {cities.length > 0 && (
          <Row style={{ flexWrap: 'wrap' }}>
            {cities.map((c) => (
              <Chip key={c} label={`${c} ✕`} selected accessibilityLabel={`${c} ${t('common.delete')}`} onPress={() => setCities(cities.filter((x) => x !== c))} />
            ))}
          </Row>
        )}
      </View>
      <DateField
        label={t('trip.startDate')}
        value={startDate}
        onChange={(v) => {
          setStart(v);
          if (!endDate || endDate < v) setEnd(v); // 종료일 달력이 시작일부터 열리게
        }}
      />
      <DateField label={t('trip.endDate')} value={endDate} onChange={setEnd} min={startDate || undefined} />
      <Field placeholder={t('trip.baseCurrency')} value={baseCurrency} onChangeText={setCur} autoCapitalize="characters" />
      <LocalCurrencyField value={localCurrency} onChange={setLocal} />

      <Card>
        <Txt kind="heading">{t('trip.bookings')}</Txt>
        <Txt kind="soft">{t('trip.bookingsHint')}</Txt>
        {bookings.map((b) => (
          <Card key={b.id} onPress={() => setEditing(b)}>
            <Txt>{bookingSummary(b)}</Txt>
          </Card>
        ))}
        <Row style={{ flexWrap: 'wrap' }}>
          <Button kind="ghost" label={t('booking.addLodging')} onPress={() => setEditing(blankBooking(sv.newId(), '', 'lodging'))} />
          <Button kind="ghost" label={t('booking.addTransport')} onPress={() => setEditing(blankBooking(sv.newId(), '', 'flight'))} />
        </Row>
      </Card>

      {invalid && <Txt kind="soft">{t('trip.invalid')}</Txt>}
      <Button label={t('common.save')} onPress={save} />

      {editing && (
        <BookingSheet
          initial={editing}
          min={startDate || undefined}
          max={endDate || undefined}
          onSave={(b) => {
            setBookings(bookings.some((x) => x.id === b.id) ? bookings.map((x) => (x.id === b.id ? b : x)) : [...bookings, b]);
            setEditing(null);
          }}
          onDelete={bookings.some((x) => x.id === editing.id) ? () => (setBookings(bookings.filter((x) => x.id !== editing.id)), setEditing(null)) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  );
}

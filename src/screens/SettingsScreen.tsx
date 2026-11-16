import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import type { Trip } from '@/domain/types';
import { t } from '@/i18n/ko';
import type { LocationAccess } from '@/location/geofenceCore';
import { useLoad, useServices } from '@/state/ServicesContext';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/ui/kit';
import { LocalCurrencyField } from '@/ui/Money';
import { DateField } from '@/ui/PickerField';

import { joinCities, splitCities } from './NewTripScreen';

type Props = {
  tripId: string;
  getAccess: () => Promise<LocationAccess>;
  requestAlways: () => Promise<LocationAccess>;
  openSystemSettings: () => void;
  /** 알림 권한이 있는지 */
  getNotifications: () => Promise<boolean>;
  requestNotifications: () => Promise<boolean>;
  onDeleted?: () => void;
};

export function SettingsScreen({ tripId, getAccess, requestAlways, openSystemSettings, getNotifications, requestNotifications, onDeleted }: Props) {
  const sv = useServices();
  const { repo } = sv;
  const { data: trip, reload } = useLoad(() => repo.getTrip(tripId), [tripId]);
  const [access, setAccess] = useState<LocationAccess>();
  const [base, setBase] = useState<string>();
  const [rates, setRates] = useState<Record<string, string>>({});
  const [newCur, setNewCur] = useState('');
  const [newRate, setNewRate] = useState('');

  const [notifications, setNotifications] = useState<boolean>();
  useEffect(() => {
    void getAccess().then(setAccess);
    void getNotifications().then(setNotifications);
  }, [getAccess, getNotifications]);

  if (!trip) return <Screen>{null}</Screen>;
  const baseCur = (base ?? trip.baseCurrency).trim().toUpperCase();
  const code = newCur.trim().toUpperCase();

  const save = async () => {
    const next: Record<string, number> = {};
    for (const cur of Object.keys(trip.rates)) {
      const v = Number(rates[cur] ?? trip.rates[cur]);
      if (Number.isFinite(v) && v > 0) next[cur] = v;
    }
    const added = Number(newRate);
    if (/^[A-Z]{3}$/.test(code) && Number.isFinite(added) && added > 0) next[code] = added;
    await repo.updateTrip({ ...trip, baseCurrency: /^[A-Z]{3}$/.test(baseCur) ? baseCur : trip.baseCurrency, rates: next });
    setRates({});
    setNewCur('');
    setNewRate('');
    reload();
  };

  const ask = async () => {
    const result = await requestAlways();
    setAccess(result);
    setNotifications(await requestNotifications());
    if (result === 'always') sv.onItineraryChanged();
    else openSystemSettings();
  };

  const remove = () =>
    Alert.alert(t('trip.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await repo.deleteTrip(tripId);
          sv.onItineraryChanged();
          onDeleted?.();
        },
      },
    ]);

  return (
    <Screen>
      <TripInfoCard key={trip.id} trip={trip} onSaved={reload} />

      <Card>
        <Txt kind="heading">{t('settings.location')}</Txt>
        {access === 'always' && <Txt kind="soft">{t('settings.locationAlways')}</Txt>}
        {notifications === false && <Txt kind="soft">{t('settings.notificationsOff')}</Txt>}
        {access !== undefined && (access !== 'always' || notifications === false) && (
          <>
            {access !== 'always' && <Txt kind="soft">{t('settings.locationNeedAlways')}</Txt>}
            <Row>
              <Button kind="ghost" label={t('settings.locationAsk')} onPress={ask} />
              <Button kind="ghost" label={t('settings.openSettings')} onPress={openSystemSettings} />
            </Row>
          </>
        )}
      </Card>

      <Card>
        <Txt kind="heading">{t('settings.baseCurrency')}</Txt>
        <Field value={base ?? trip.baseCurrency} onChangeText={setBase} autoCapitalize="characters" />
        <LocalCurrencyField
          value={trip.localCurrency}
          onChange={async (cur) => {
            await repo.updateTrip({ ...trip, localCurrency: cur });
            reload();
          }}
        />
        <Txt kind="heading">{t('settings.rates')}</Txt>
        {Object.keys(trip.rates).map((cur) => (
          <Row key={cur}>
            <Txt style={{ width: 48 }}>{cur}</Txt>
            <Field
              style={{ flex: 1 }}
              placeholder={t('settings.rateHint', { cur, base: baseCur })}
              value={rates[cur] ?? String(trip.rates[cur])}
              onChangeText={(v) => setRates({ ...rates, [cur]: v })}
              keyboardType="decimal-pad"
            />
          </Row>
        ))}
        <Field placeholder={t('settings.addCurrency')} value={newCur} onChangeText={setNewCur} autoCapitalize="characters" />
        {/^[A-Z]{3}$/.test(code) && (
          <Field placeholder={t('settings.rateHint', { cur: code, base: baseCur })} value={newRate} onChangeText={setNewRate} keyboardType="decimal-pad" />
        )}
        <Button label={t('common.save')} onPress={save} />
      </Card>

      <Button kind="danger" label={t('common.delete')} onPress={remove} />
    </Screen>
  );
}

/** 처음 정한 여행 이름·도시·날짜를 고친다. 날짜가 줄어 지워지는 날에 장소가 있으면 먼저 묻는다. */
function TripInfoCard({ trip, onSaved }: { trip: Trip; onSaved: () => void }) {
  const sv = useServices();
  const { repo } = sv;
  const [name, setName] = useState(trip.name);
  const [cities, setCities] = useState(splitCities(trip.city));
  const [cityDraft, setCityDraft] = useState('');
  const [startDate, setStart] = useState(trip.startDate);
  const [endDate, setEnd] = useState(trip.endDate);
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  const addCity = () => {
    const c = cityDraft.trim();
    if (c && !cities.includes(c)) setCities([...cities, c]);
    setCityDraft('');
  };
  const save = async () => {
    const all = cityDraft.trim() && !cities.includes(cityDraft.trim()) ? [...cities, cityDraft.trim()] : cities;
    const span = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
    const ok = name.trim() !== '' && span >= 0 && span < 90;
    setInvalid(!ok);
    if (!ok) return;
    const write = async () => {
      const latest = (await repo.getTrip(trip.id)) ?? trip;
      await repo.updateTrip({ ...latest, name: name.trim(), city: joinCities(all) });
      if (startDate !== trip.startDate || endDate !== trip.endDate) {
        await repo.setTripDates(trip.id, startDate, endDate);
        sv.onItineraryChanged();
      }
      setCityDraft('');
      setSaved(true);
      onSaved();
    };
    // 줄어든 날짜에 장소가 있으면 지워도 되는지 묻는다
    const days = await repo.listDays(trip.id);
    const dropped = days.slice(span + 1);
    let lost = 0;
    for (const d of dropped) lost += (await repo.listStops(d.id)).length;
    if (lost === 0) return void (await write());
    Alert.alert(t('trip.shrinkTitle'), t('trip.shrinkBody', { days: dropped.length, stops: lost }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.save'), style: 'destructive', onPress: () => void write() },
    ]);
  };
  return (
    <Card>
      <Txt kind="heading">{t('trip.info')}</Txt>
      <Field placeholder={t('trip.name')} value={name} onChangeText={(v) => (setName(v), setSaved(false))} />
      <Row>
        <Field style={{ flex: 1 }} placeholder={t('trip.city')} value={cityDraft} onChangeText={setCityDraft} onSubmitEditing={addCity} returnKeyType="done" submitBehavior="submit" />
        <Chip label={t('trip.addCity')} onPress={addCity} />
      </Row>
      {cities.length > 0 && (
        <Row style={{ flexWrap: 'wrap' }}>
          {cities.map((c) => (
            <Chip key={c} label={`${c} ✕`} selected accessibilityLabel={`${c} ${t('common.delete')}`} onPress={() => (setCities(cities.filter((x) => x !== c)), setSaved(false))} />
          ))}
        </Row>
      )}
      <DateField
        label={t('trip.startDate')}
        value={startDate}
        onChange={(v) => {
          // 시작일을 옮기면 여행 길이는 그대로 두고 종료일도 함께 옮긴다
          const len = Date.parse(endDate) - Date.parse(startDate);
          setStart(v);
          setEnd(new Date(Date.parse(v) + Math.max(0, len)).toISOString().slice(0, 10));
          setSaved(false);
        }}
      />
      <DateField label={t('trip.endDate')} value={endDate} min={startDate} onChange={(v) => (setEnd(v), setSaved(false))} />
      {invalid && <Txt kind="soft">{t('trip.invalid')}</Txt>}
      {saved && <Txt kind="soft">{t('trip.saved')}</Txt>}
      <Button label={t('common.save')} onPress={() => void save()} />
    </Card>
  );
}

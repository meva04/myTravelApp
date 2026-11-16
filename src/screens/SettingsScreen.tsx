import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { t } from '@/i18n/ko';
import type { LocationAccess } from '@/location/geofenceCore';
import { useLoad, useServices } from '@/state/ServicesContext';
import { Button, Card, Field, Row, Screen, Txt } from '@/ui/kit';
import { LocalCurrencyField } from '@/ui/Money';

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

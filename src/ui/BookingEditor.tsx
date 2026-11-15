// 숙소·교통편 예약 입력. 편명을 넣으면 (조회 키가 있을 때) 공항·시간·게이트·기종을 채운다.
import { useState } from 'react';
import { View } from 'react-native';

import { TRANSPORT_KINDS, type Booking, type BookingKind } from '@/domain/types';
import { t } from '@/i18n/ko';
import { useServices } from '@/state/ServicesContext';
import { space } from '@/theme/tokens';

import { Button, Chip, Field, Row, Txt } from './kit';
import { DateField, TimeField } from './PickerField';
import { PlaceSearchField } from './PlaceSearchField';
import { SeatMap } from './SeatMap';

type Props = {
  value: Booking;
  onChange: (b: Booking) => void;
  /** 여행 날짜 (달력 범위) */
  min?: string;
  max?: string;
};

/** 저장할 수 있는지 (일정에 넣을 장소와 날짜가 있는지) */
export function bookingReady(b: Booking): boolean {
  if (b.kind === 'lodging') return !!b.place && !!b.checkIn && !!b.checkOut && b.checkIn <= b.checkOut;
  return !!((b.from && b.departDate) || (b.to && b.arriveDate));
}

export function BookingEditor({ value: b, onChange, min, max }: Props) {
  const { flights } = useServices();
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'none' | 'error'>('idle');
  const set = (patch: Partial<Booking>) => onChange({ ...b, ...patch });

  if (b.kind === 'lodging') {
    return (
      <View style={{ gap: space.md }}>
        <PlaceSearchField label={t('booking.hotel')} value={b.place} onChange={(place) => set({ place, title: place.name })} />
        <DateField label={t('booking.checkIn')} value={b.checkIn ?? ''} min={min} max={max} onChange={(checkIn) => set({ checkIn, checkOut: !b.checkOut || b.checkOut < checkIn ? checkIn : b.checkOut })} />
        <DateField label={t('booking.checkOut')} value={b.checkOut ?? ''} min={b.checkIn ?? min} max={max} onChange={(checkOut) => set({ checkOut })} />
        <TimeField label={t('booking.checkInTime')} value={b.checkInTime ?? ''} defaultTime="15:00" onChange={(v) => set({ checkInTime: v || undefined })} />
        <TimeField label={t('booking.checkOutTime')} value={b.checkOutTime ?? ''} defaultTime="11:00" onChange={(v) => set({ checkOutTime: v || undefined })} />
        <Field placeholder={t('booking.confirmation')} value={b.confirmation ?? ''} onChangeText={(v) => set({ confirmation: v })} />
      </View>
    );
  }

  const find = async () => {
    if (!b.title.trim() || !b.departDate) return;
    setLookup('loading');
    try {
      const info = await flights.lookup(b.title, b.departDate);
      if (!info) return setLookup('none');
      const { status: _status, ...rest } = info;
      onChange({ ...b, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) });
      setLookup('idle');
    } catch {
      setLookup('error');
    }
  };
  const isFlight = b.kind === 'flight';

  return (
    <View style={{ gap: space.md }}>
      <Row style={{ flexWrap: 'wrap' }}>
        {TRANSPORT_KINDS.map((k: BookingKind) => (
          <Chip key={k} label={t(`booking.kind.${k}` as 'booking.kind.flight')} selected={b.kind === k} onPress={() => set({ kind: k })} />
        ))}
      </Row>
      <Field placeholder={t(isFlight ? 'booking.flightNo' : 'booking.vehicleNo')} value={b.title} onChangeText={(v) => set({ title: v })} autoCapitalize="characters" />
      <DateField label={t('booking.departDate')} value={b.departDate ?? ''} onChange={(departDate) => set({ departDate, arriveDate: b.arriveDate && b.arriveDate >= departDate ? b.arriveDate : departDate })} />
      {isFlight &&
        (flights.available ? (
          <Button kind="ghost" label={lookup === 'loading' ? t('common.loading') : t('booking.lookup')} onPress={() => void find()} />
        ) : (
          <Txt kind="small">{t('booking.noLookup')}</Txt>
        ))}
      {lookup === 'none' && <Txt kind="soft">{t('booking.notFound')}</Txt>}
      {lookup === 'error' && <Txt kind="soft">{t('booking.lookupError')}</Txt>}
      <PlaceSearchField label={t(`booking.from.${b.kind}` as 'booking.from.flight')} value={b.from} onChange={(from) => set({ from })} />
      <TimeField label={t('booking.departTime')} value={b.departTime ?? ''} onChange={(v) => set({ departTime: v || undefined })} />
      <PlaceSearchField label={t(`booking.to.${b.kind}` as 'booking.to.flight')} value={b.to} onChange={(to) => set({ to })} />
      <DateField label={t('booking.arriveDate')} value={b.arriveDate ?? ''} min={b.departDate} onChange={(arriveDate) => set({ arriveDate })} />
      <TimeField label={t('booking.arriveTime')} value={b.arriveTime ?? ''} onChange={(v) => set({ arriveTime: v || undefined })} />
      <Field placeholder={t('booking.carrier')} value={b.carrier ?? ''} onChangeText={(v) => set({ carrier: v })} />
      <Field placeholder={t(isFlight ? 'booking.aircraft' : 'booking.vehicle')} value={b.vehicle ?? ''} onChangeText={(v) => set({ vehicle: v })} />
      {isFlight && (
        <Row>
          <Field style={{ flex: 1 }} placeholder={t('booking.terminal')} value={b.terminal ?? ''} onChangeText={(v) => set({ terminal: v })} />
          <Field style={{ flex: 1 }} placeholder={t('booking.gate')} value={b.gate ?? ''} onChangeText={(v) => set({ gate: v })} />
        </Row>
      )}
      <Row>
        {b.kind === 'train' && <Field style={{ flex: 1 }} placeholder={t('booking.car')} value={b.car ?? ''} onChangeText={(v) => set({ car: v })} keyboardType="number-pad" />}
        <Field style={{ flex: 1 }} placeholder={t('booking.seat')} value={b.seat ?? ''} onChangeText={(v) => set({ seat: v })} autoCapitalize="characters" />
      </Row>
      <Field placeholder={t('booking.confirmation')} value={b.confirmation ?? ''} onChangeText={(v) => set({ confirmation: v })} />
      {(b.seat || b.vehicle) && <SeatMap booking={b} />}
    </View>
  );
}

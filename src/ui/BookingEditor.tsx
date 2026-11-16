// 숙소·교통편 예약 입력. 편명을 넣으면 (조회 키가 있을 때) 공항·시간·게이트·기종을 채운다.
import { View } from 'react-native';

import { TRANSPORT_KINDS, type Booking, type BookingKind } from '@/domain/types';
import { t } from '@/i18n/ko';
import { useServices } from '@/state/ServicesContext';
import { airlineOf } from '@/travel/airlines';
import { space } from '@/theme/tokens';

import { Chip, Field, Row, Txt } from './kit';
import { DateRangeField } from './DateRangeField';
import { DateField, TimeField } from './PickerField';
import { PlaceSearchField } from './PlaceSearchField';
import { SeatMap } from './SeatMap';

const AIRCRAFT = ['A321', 'A330', 'A350', 'A380', 'B737', 'B777', 'B787'];

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

export function BookingEditor({ value: b, onChange, min }: Props) {
  const { flights } = useServices();
  const set = (patch: Partial<Booking>) => onChange({ ...b, ...patch });

  if (b.kind === 'lodging') {
    return (
      <View style={{ gap: space.md }}>
        <PlaceSearchField label={t('booking.hotel')} value={b.place} onChange={(place) => set({ place, title: place.name })} />
        {/* 체크인을 누르고 이어서 체크아웃을 누른다. 지난 여행 기록이나 1년 뒤 예약도 고를 수 있다. */}
        <DateRangeField label={t('booking.stay')} startLabel={t('booking.checkIn')} endLabel={t('booking.checkOut')}from={b.checkIn} to={b.checkOut} openAt={min} onChange={(checkIn, checkOut) => set({ checkIn, checkOut })} />
        <TimeField label={t('booking.checkInTime')} value={b.checkInTime ?? ''} defaultTime="15:00" onChange={(v) => set({ checkInTime: v || undefined })} />
        <TimeField label={t('booking.checkOutTime')} value={b.checkOutTime ?? ''} defaultTime="11:00" onChange={(v) => set({ checkOutTime: v || undefined })} />
        <Row>
          <Field
            style={{ flex: 1 }}
            placeholder={t('booking.price')}
            value={b.price !== undefined ? String(b.price) : ''}
            onChangeText={(v) => {
              const n = Number(v.replace(/,/g, ''));
              set({ price: v.trim() === '' || !Number.isFinite(n) ? undefined : n });
            }}
            keyboardType="decimal-pad"
          />
          <Field style={{ width: 84 }} placeholder="KRW" value={b.priceCurrency ?? ''} onChangeText={(v) => set({ priceCurrency: v.trim().toUpperCase() || undefined })} autoCapitalize="characters" maxLength={3} />
        </Row>
        <Field placeholder={t('booking.confirmation')} value={b.confirmation ?? ''} onChangeText={(v) => set({ confirmation: v })} />
        <Field placeholder={t('booking.memo')} value={b.memo ?? ''} onChangeText={(v) => set({ memo: v })} multiline style={{ minHeight: 72 }} />
      </View>
    );
  }

  const isFlight = b.kind === 'flight';
  const airline = isFlight ? airlineOf(b.title)?.name : undefined;

  return (
    <View style={{ gap: space.md }}>
      <Row style={{ flexWrap: 'wrap' }}>
        {TRANSPORT_KINDS.map((k: BookingKind) => (
          <Chip key={k} label={t(`booking.kind.${k}` as 'booking.kind.flight')} selected={b.kind === k} onPress={() => set({ kind: k })} />
        ))}
      </Row>
      <Field
        placeholder={t(isFlight ? 'booking.flightNo' : 'booking.vehicleNo')}
        value={b.title}
        onChangeText={(v) => {
          // 편명을 적으면 항공사 이름을 바로 채운다 (앱 안의 표, 무료)
          const before = airlineOf(b.title)?.name;
          const now = isFlight ? airlineOf(v)?.name : undefined;
          set({ title: v, ...(now && (!b.carrier || b.carrier === before) ? { carrier: now } : {}) });
        }}
        autoCapitalize="characters"
      />
      {isFlight && airline && <Txt kind="soft">{`✈︎ ${airline}`}</Txt>}
      <DateField label={t('booking.departDate')} value={b.departDate ?? ''} onChange={(departDate) => set({ departDate, arriveDate: b.arriveDate && b.arriveDate >= departDate ? b.arriveDate : departDate })} />
      {isFlight && <Txt kind="small">{t(flights.available ? 'booking.icnInfo' : 'booking.icnNoKey')}</Txt>}
      <PlaceSearchField label={t(`booking.from.${b.kind}` as 'booking.from.flight')} value={b.from} onChange={(from) => set({ from })} />
      <TimeField label={t('booking.departTime')} value={b.departTime ?? ''} onChange={(v) => set({ departTime: v || undefined })} />
      <PlaceSearchField label={t(`booking.to.${b.kind}` as 'booking.to.flight')} value={b.to} onChange={(to) => set({ to })} />
      <DateField label={t('booking.arriveDate')} value={b.arriveDate ?? ''} min={b.departDate} onChange={(arriveDate) => set({ arriveDate })} />
      <TimeField label={t('booking.arriveTime')} value={b.arriveTime ?? ''} onChange={(v) => set({ arriveTime: v || undefined })} />
      <Field placeholder={t('booking.carrier')} value={b.carrier ?? ''} onChangeText={(v) => set({ carrier: v })} />
      <Field placeholder={t(isFlight ? 'booking.aircraft' : 'booking.vehicle')} value={b.vehicle ?? ''} onChangeText={(v) => set({ vehicle: v })} />
      {isFlight && (
        // 기종은 예약 확인서·탑승권에 나온다. 자주 타는 기종은 눌러서 고른다.
        <Row style={{ flexWrap: 'wrap' }}>
          {AIRCRAFT.map((a) => (
            <Chip key={a} label={a} selected={b.vehicle === a} onPress={() => set({ vehicle: a })} />
          ))}
        </Row>
      )}
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

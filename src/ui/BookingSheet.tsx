// 예약 하나를 적는 창 (새 여행 만들기와 예약 화면에서 함께 쓴다).
import { useState } from 'react';
import { View } from 'react-native';

import type { Booking } from '@/domain/types';
import { t } from '@/i18n/ko';
import { space } from '@/theme/tokens';

import { BookingEditor, bookingReady } from './BookingEditor';
import { formatMoney } from './format';
import { Button, Txt } from './kit';
import { SheetModal } from './SheetModal';

type Props = { initial: Booking; min?: string; max?: string; onSave: (b: Booking) => void; onDelete?: () => void; onClose: () => void };

export function BookingSheet({ initial, min, max, onSave, onDelete, onClose }: Props) {
  const [b, setB] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  return (
    <SheetModal
      title={t(b.kind === 'lodging' ? 'booking.lodgingTitle' : 'booking.transportTitle')}
      onClose={onClose}
      footer={
        <View style={{ gap: space.sm }}>
          {invalid && <Txt kind="soft">{t(b.kind === 'lodging' ? 'booking.invalidLodging' : 'booking.invalidTransport')}</Txt>}
          <Button
            label={t('common.save')}
            onPress={() => {
              if (!bookingReady(b)) return setInvalid(true);
              onSave({ ...b, title: b.title.trim() || b.place?.name || '' });
            }}
          />
          {onDelete && <Button kind="danger" label={t('booking.delete')} onPress={onDelete} />}
        </View>
      }
    >
      <BookingEditor value={b} onChange={setB} min={min} max={max} />
    </SheetModal>
  );
}

export function blankBooking(id: string, tripId: string, kind: Booking['kind']): Booking {
  return { id, tripId, kind, title: '', ...(kind === 'lodging' ? { checkInTime: '15:00', checkOutTime: '11:00' } : {}) };
}

/** 예약 목록에 보일 한 줄 */
export function bookingSummary(b: Booking): string {
  if (b.kind === 'lodging') return [b.title, `${b.checkIn ?? ''} ~ ${b.checkOut ?? ''}`, b.price !== undefined ? formatMoney(b.price, b.priceCurrency ?? 'KRW') : ''].filter(Boolean).join(' · ');
  return [t(`booking.kind.${b.kind}` as 'booking.kind.flight'), b.title, b.from && b.to ? `${b.from.name} → ${b.to.name}` : '', b.departDate, b.departTime].filter(Boolean).join(' · ');
}

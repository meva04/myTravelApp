// 일정의 두 장소 사이에서 교통편(기차·항공·배·버스)을 넣는 페이지. 저장하면 예약으로 남고 날짜·시간에 맞게 일정에도 들어간다.
import { useState } from 'react';

import type { Booking } from '@/domain/types';
import { t } from '@/i18n/ko';
import { applyBooking } from '@/state/itineraryOps';
import { useLoad, useServices } from '@/state/ServicesContext';
import { BookingEditor, bookingReady } from '@/ui/BookingEditor';
import { blankBooking } from '@/ui/BookingSheet';
import { FormPage } from '@/ui/FormPage';

type Props = {
  tripId: string;
  /** 그날 날짜. 출발일로 미리 채운다. */
  date?: string;
  onDone: () => void;
  onBack?: () => void;
};

export function AddTransportScreen({ tripId, date, onDone, onBack }: Props) {
  const sv = useServices();
  const { data: trip } = useLoad(() => sv.repo.getTrip(tripId), [tripId]);
  const [b, setB] = useState<Booking>(() => ({ ...blankBooking(sv.newId(), tripId, 'train'), ...(date ? { departDate: date, arriveDate: date } : {}) }));
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (saving) return;
    if (!bookingReady(b)) return setInvalid(true);
    setSaving(true);
    try {
      await applyBooking(sv, { ...b, title: b.title.trim() || b.place?.name || '' });
      onDone();
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage title={t('transport.title')} onBack={onBack ?? onDone} submitLabel={t('add.add')} onSubmit={() => void submit()} notice={invalid ? t('booking.invalidTransport') : undefined}>
      <BookingEditor value={b} onChange={setB} min={trip?.startDate} />
    </FormPage>
  );
}

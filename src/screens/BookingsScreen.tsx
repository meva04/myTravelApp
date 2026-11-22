// 여행의 숙소·교통편 예약. 저장하면 날짜에 맞게 일정에 장소로 들어가고, 고치거나 지우면 일정도 따라 바뀐다.
import { Alert } from 'react-native';
import { useState } from 'react';

import type { Booking } from '@/domain/types';
import { t } from '@/i18n/ko';
import { applyBooking, removeBooking } from '@/state/itineraryOps';
import { useLoad, useServices } from '@/state/ServicesContext';
import { blankBooking, BookingSheet, bookingSummary } from '@/ui/BookingSheet';
import { Button, Card, Row, Screen, Txt } from '@/ui/kit';
import { SeatMap } from '@/ui/SeatMap';

export function BookingsScreen({ tripId, initialKind, editId }: { tripId: string; initialKind?: Booking['kind']; editId?: string }) {
  const sv = useServices();
  const { data, reload } = useLoad(async () => ({ trip: await sv.repo.getTrip(tripId), bookings: await sv.repo.listBookings(tripId) }), [tripId]);
  const [editing, setEditing] = useState<{ b: Booking; isNew: boolean } | null>(initialKind ? { b: blankBooking(sv.newId(), tripId, initialKind), isNew: true } : null);
  // 장소 화면에서 "예약 수정" 으로 열렸으면 그 예약을 바로 연다 (닫으면 다시 열지 않는다)
  const [editIdOpen, setEditIdOpen] = useState(!!editId);
  const toEdit = editIdOpen && editId ? data?.bookings.find((x) => x.id === editId) : undefined;
  if (!data?.trip) return <Screen>{null}</Screen>;
  const { trip, bookings } = data;
  const lodging = bookings.filter((b) => b.kind === 'lodging');
  const transport = bookings.filter((b) => b.kind !== 'lodging');

  const save = async (b: Booking) => {
    setEditing(null);
    setEditIdOpen(false);
    await applyBooking(sv, b);
    reload();
  };
  const remove = (b: Booking) =>
    Alert.alert(t('booking.deleteTitle'), t('booking.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setEditing(null);
          setEditIdOpen(false);
          await removeBooking(sv, b.id);
          reload();
        },
      },
    ]);

  return (
    <Screen>
      <Txt kind="soft">{t('booking.intro')}</Txt>
      <Card>
        <Txt kind="heading">{t('booking.lodging')}</Txt>
        {lodging.length === 0 && <Txt kind="soft">{t('booking.none')}</Txt>}
        {lodging.map((b) => (
          <Card key={b.id} tone="well" onPress={() => setEditing({ b, isNew: false })}>
            <Txt>{bookingSummary(b)}</Txt>
          </Card>
        ))}
        <Button kind="ghost" label={t('booking.addLodging')} onPress={() => setEditing({ b: blankBooking(sv.newId(), tripId, 'lodging'), isNew: true })} />
      </Card>
      <Card>
        <Txt kind="heading">{t('booking.transport')}</Txt>
        {transport.length === 0 && <Txt kind="soft">{t('booking.none')}</Txt>}
        {transport.map((b) => (
          <Card key={b.id} tone="well" onPress={() => setEditing({ b, isNew: false })}>
            <Txt>{bookingSummary(b)}</Txt>
            {b.gate ? <Txt kind="soft">{`${t('booking.gate')} ${b.gate}`}</Txt> : null}
            {(b.seat || b.vehicle) && <SeatMap booking={b} />}
          </Card>
        ))}
        <Row>
          <Button kind="ghost" label={t('booking.addTransport')} onPress={() => setEditing({ b: blankBooking(sv.newId(), tripId, 'flight'), isNew: true })} />
        </Row>
      </Card>
      {(editing ?? (toEdit && { b: toEdit, isNew: false })) && (
        <BookingSheet
          key={(editing ?? { b: toEdit! }).b.id}
          initial={(editing ?? { b: toEdit! }).b}
          min={trip.startDate}
          max={trip.endDate}
          onSave={(b) => void save(b)}
          onDelete={editing?.isNew ? undefined : () => remove((editing ?? { b: toEdit! }).b)}
          onClose={() => {
            setEditing(null);
            setEditIdOpen(false);
          }}
        />
      )}
    </Screen>
  );
}

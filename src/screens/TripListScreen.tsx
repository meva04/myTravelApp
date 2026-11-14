import { t } from '@/i18n/ko';
import { useLoad, useServices } from '@/state/ServicesContext';
import { Button, Card, Screen, Txt } from '@/ui/kit';

export function TripListScreen({ onOpen, onNew, refreshKey = 0 }: { onOpen: (tripId: string) => void; onNew: () => void; refreshKey?: number }) {
  const { repo } = useServices();
  const { data: trips } = useLoad(() => repo.listTrips(), [refreshKey]);
  return (
    <Screen>
      <Txt kind="title">{t('trips.title')}</Txt>
      {trips?.length === 0 && (
        <Card>
          <Txt kind="heading">{t('trips.empty')}</Txt>
          <Txt kind="soft">{t('trips.emptyHint')}</Txt>
        </Card>
      )}
      {trips?.map((trip) => (
        <Card key={trip.id} onPress={() => onOpen(trip.id)}>
          <Txt kind="heading">{trip.name}</Txt>
          <Txt kind="soft">
            {trip.city} · {trip.startDate} ~ {trip.endDate}
          </Txt>
        </Card>
      ))}
      <Button label={t('trips.new')} onPress={onNew} />
    </Screen>
  );
}

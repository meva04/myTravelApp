import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Sortable from 'react-native-sortables';

import { summarizeExpenses } from '@/domain/expenses';
import { moveToDay, removeStop, reorder, syncLegs } from '@/domain/itinerary';
import type { Day, Leg, Stop } from '@/domain/types';
import { t } from '@/i18n/ko';
import { useLoad, useServices } from '@/state/ServicesContext';
import { space } from '@/theme/tokens';
import { formatAmounts, formatKm, formatMoney, formatTime } from '@/ui/format';
import { Button, Card, Chip, Row, Screen, Txt } from '@/ui/kit';

type Props = {
  tripId: string;
  onAddStop: (dayId: string) => void;
  onOpenMap: (dayId: string) => void;
  onOpenStop: (stopId: string) => void;
  onExpenses: () => void;
  onSettings: () => void;
  /** 화면에 다시 돌아왔을 때 바뀌는 값. 바뀌면 다시 불러온다. */
  refreshKey?: number;
  /** 오늘 날짜 'YYYY-MM-DD'. 여행 중이면 그날 탭으로 연다. */
  today?: string;
};

export function TripHomeScreen({ tripId, onAddStop, onOpenMap, onOpenStop, onExpenses, onSettings, refreshKey = 0, today }: Props) {
  const sv = useServices();
  const { repo } = sv;
  const { data: trip } = useLoad(() => repo.getTrip(tripId), [tripId, refreshKey]);
  const { data: days } = useLoad(() => repo.listDays(tripId), [tripId]);
  const { data: expenses } = useLoad(() => repo.listExpenses(tripId), [tripId, refreshKey]);
  const [dayId, setDayId] = useState<string>();
  const [moving, setMoving] = useState<Stop | null>(null);
  const day = days?.find((d) => d.id === dayId);

  useEffect(() => {
    if (!dayId && days?.length) setDayId((days.find((d) => d.date === today) ?? days[0]).id);
  }, [days, dayId, today]);

  const { data: dayData, reload } = useLoad(
    async () => (dayId ? { dayId, stops: await repo.listStops(dayId), legs: await repo.listLegs(dayId) } : undefined),
    [dayId, refreshKey],
  );
  // 탭을 바꾼 직후에는 이전 날의 목록이 남아 있으므로 쓰지 않는다 (다른 날에 잘못 저장되는 것 방지).
  const current = dayData?.dayId === dayId ? dayData : undefined;
  const stops = current?.stops ?? [];
  const legs = current?.legs ?? [];

  const saveDay = async (id: string, next: Stop[]) => {
    await repo.saveStops(id, next);
    await repo.saveLegs(id, syncLegs(next, await repo.listLegs(id), sv.newId));
  };
  const changed = () => {
    sv.onItineraryChanged();
    reload();
  };

  const onDragEnd = async (from: number, to: number) => {
    if (!day || !current || from === to) return;
    await saveDay(day.id, reorder(stops, from, to));
    changed();
  };
  const remove = (stop: Stop) => {
    Alert.alert(stop.name, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (!day || !current) return;
          await saveDay(day.id, removeStop(stops, stop.id));
          changed();
        },
      },
    ]);
  };
  const moveTo = async (target: Day) => {
    if (!day || !moving || !current) return;
    // 옮기는 방문지를 먼저 대상 날에 저장해야 사진·비용이 따라간다.
    const r = moveToDay(moving, stops, await repo.listStops(target.id), target.id);
    await saveDay(target.id, r.to);
    await saveDay(day.id, r.from);
    await repo.setExpenseDateForStop(moving.id, target.date);
    setMoving(null);
    changed();
  };

  if (!trip || !days) return <Screen>{null}</Screen>;

  const summary = expenses ? summarizeExpenses(expenses, trip) : undefined;
  const spent = summary && day ? (summary.byDate[day.date] ?? 0) : 0;
  const unconverted = summary && day ? formatAmounts(summary.unconvertedByDate[day.date]) : '';
  const meters = legs.reduce((sum, l) => sum + (selected(l)?.distanceMeters ?? 0), 0);

  return (
    <Screen>
      <Txt kind="title">{trip.name}</Txt>
      <Row>
        <Button kind="ghost" label={t('trip.expenses')} onPress={onExpenses} />
        <Button kind="ghost" label={t('trip.settings')} onPress={onSettings} />
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {days.map((d, i) => (
          <Chip key={d.id} label={t('day.label', { n: i + 1 })} selected={d.id === dayId} onPress={() => setDayId(d.id)} />
        ))}
      </ScrollView>

      {day && (
        <>
          <Txt kind="soft">{day.date}</Txt>
          <Txt kind="soft">
            {t('day.summary', { stops: stops.length, km: formatKm(meters), spent: formatMoney(spent, trip.baseCurrency) })}
          </Txt>
          {unconverted !== '' && <Txt kind="soft">{`${t('expense.unconverted')}: ${unconverted}`}</Txt>}
          {stops.length === 0 ? (
            <Card>
              <Txt kind="soft">{t('day.empty')}</Txt>
            </Card>
          ) : (
            <>
              <Sortable.Grid
                columns={1}
                rowGap={space.sm}
                data={stops}
                keyExtractor={(s) => s.id}
                onDragEnd={({ fromIndex, toIndex }) => void onDragEnd(fromIndex, toIndex)}
                renderItem={({ item, index }) => (
                  <Card onPress={() => onOpenStop(item.id)}>
                    <Row>
                      <Txt kind="heading">{index + 1}</Txt>
                      <View style={{ flex: 1 }}>
                        <Txt>{item.name}</Txt>
                        <Txt kind="soft">
                          {[item.plannedTime, item.arrivedAt && t('stop.arrivedAt', { time: formatTime(item.arrivedAt) }), item.memo]
                            .filter(Boolean)
                            .join(' · ')}
                        </Txt>
                      </View>
                    </Row>
                    <Row>
                      {days.length > 1 && <Chip label={t('day.moveTo')} onPress={() => setMoving(item)} />}
                      <Chip label={t('common.delete')} onPress={() => remove(item)} />
                    </Row>
                  </Card>
                )}
              />
              <Txt kind="small">{t('day.dragHint')}</Txt>
            </>
          )}
          {moving && (
            <Card>
              <Txt>{t('day.moveToTitle')}</Txt>
              <Row style={{ flexWrap: 'wrap' }}>
                {days.map((d, i) => d.id !== day.id && <Chip key={d.id} label={t('day.label', { n: i + 1 })} onPress={() => void moveTo(d)} />)}
                <Chip label={t('common.cancel')} onPress={() => setMoving(null)} />
              </Row>
            </Card>
          )}
          <Button label={t('day.addStop')} onPress={() => onAddStop(day.id)} />
          <Button kind="ghost" label={t('day.openMap')} onPress={() => onOpenMap(day.id)} />
        </>
      )}
    </Screen>
  );
}

const selected = (l: Leg) => l.options.find((o) => o.id === l.selectedOptionId) ?? l.options[0];

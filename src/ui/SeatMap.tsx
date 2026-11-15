// 교통편 그림: 비행기·기차·버스·배의 모양과 내 좌석 위치.
import { StyleSheet, Text, View } from 'react-native';

import { aircraftLayout, busLayout, parseSeat, seatSide, trainLayout, type Layout } from '@/domain/seats';
import type { Booking } from '@/domain/types';
import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';

const SIDE = { window: '창가', aisle: '복도', middle: '가운데' } as const;

export function SeatMap({ booking }: { booking: Booking }) {
  const seat = parseSeat(booking.seat);
  if (booking.kind === 'lodging') return null;
  if (booking.kind === 'ship') return <Ship booking={booking} />;
  const layout = booking.kind === 'flight' ? aircraftLayout(booking.vehicle) : booking.kind === 'train' ? trainLayout : busLayout;
  const side = seat ? seatSide(layout, seat.letter) : null;
  return (
    <View style={styles.wrap} testID="seat-map">
      <Text style={styles.title}>{[booking.vehicle, layout.name].filter(Boolean).join(' · ')}</Text>
      {booking.kind === 'flight' && <Plane position={seat ? Math.min(seat.row / layout.rows, 1) : null} />}
      {booking.kind === 'train' && <Train car={Number(booking.car) || null} />}
      {seat ? (
        <>
          <Cabin layout={layout} seat={seat} />
          <Text style={styles.caption}>
            {[booking.car && `${booking.car}호차`, `${seat.row}${seat.letter}`, side && SIDE[side]].filter(Boolean).join(' · ')}
          </Text>
        </>
      ) : (
        <Text style={styles.hint}>{t('booking.seatHint')}</Text>
      )}
    </View>
  );
}

/** 위에서 본 비행기 (오른쪽이 앞). position 은 앞에서부터 0~1 */
function Plane({ position }: { position: number | null }) {
  return (
    <View style={styles.plane} accessibilityLabel="plane">
      <View style={[styles.wing, { top: 6, transform: [{ skewX: '-35deg' }] }]} />
      <View style={[styles.wing, { bottom: 6, transform: [{ skewX: '35deg' }] }]} />
      <View style={[styles.tail, { top: 26, transform: [{ skewX: '-35deg' }] }]} />
      <View style={[styles.tail, { bottom: 26, transform: [{ skewX: '35deg' }] }]} />
      <View style={styles.body} />
      {position !== null && <View style={[styles.me, { left: 250 - position * 200 }]} />}
    </View>
  );
}

function Train({ car }: { car: number | null }) {
  const count = Math.max(8, car ?? 0);
  return (
    <View style={styles.cars}>
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
        <View key={n} style={[styles.car, n === 1 && styles.carHead, n === car && styles.carOn]}>
          <Text style={[styles.carText, n === car && { color: colors.card }]}>{n}</Text>
        </View>
      ))}
    </View>
  );
}

/** 내 좌석 앞뒤 몇 줄의 좌석 배치 */
function Cabin({ layout, seat }: { layout: Layout; seat: { row: number; letter: string } }) {
  const rows = [seat.row - 2, seat.row - 1, seat.row, seat.row + 1, seat.row + 2].filter((r) => r > 0);
  return (
    <View style={styles.cabin}>
      <View style={styles.windowLine} />
      {rows.map((r) => (
        <View key={r} style={styles.seatRow}>
          <Text style={styles.rowNo}>{r}</Text>
          {layout.blocks.map((b, bi) => (
            <View key={bi} style={styles.block}>
              {b.map((l) => {
                const on = r === seat.row && l === seat.letter;
                return (
                  <View key={l} style={[styles.seat, on && styles.seatOn]} accessibilityLabel={on ? `my-seat:${r}${l}` : undefined}>
                    <Text style={[styles.seatText, on && { color: colors.card }]}>{l}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ))}
      <View style={styles.windowLine} />
    </View>
  );
}

function Ship({ booking }: { booking: Booking }) {
  return (
    <View style={styles.wrap} testID="seat-map">
      <Text style={styles.title}>{booking.vehicle || t('booking.kind.ship')}</Text>
      <View style={styles.ship}>
        <View style={styles.cabinBlock} />
        <View style={styles.hull} />
      </View>
      {booking.seat ? <Text style={styles.caption}>{`${t('booking.seat')} ${booking.seat}`}</Text> : null}
    </View>
  );
}

const SEAT = 26;
const styles = StyleSheet.create({
  wrap: { gap: space.sm, alignItems: 'center', paddingVertical: space.sm },
  title: { fontSize: fonts.size.sm, color: colors.inkSoft, fontWeight: '600' },
  caption: { fontSize: fonts.size.md, color: colors.ink, fontWeight: '700' },
  hint: { fontSize: fonts.size.xs, color: colors.inkSoft },
  plane: { width: 290, height: 110 },
  body: { position: 'absolute', left: 20, top: 42, width: 250, height: 26, borderRadius: 13, borderTopRightRadius: 30, borderBottomRightRadius: 30, backgroundColor: colors.line },
  wing: { position: 'absolute', left: 130, width: 46, height: 40, backgroundColor: colors.line, borderRadius: 4 },
  tail: { position: 'absolute', left: 26, width: 22, height: 18, backgroundColor: colors.line, borderRadius: 3 },
  me: { position: 'absolute', top: 49, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.card },
  cars: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', justifyContent: 'center' },
  car: { width: 30, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  carHead: { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  carOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  carText: { fontSize: 10, color: colors.inkSoft },
  cabin: { gap: 4, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  windowLine: { height: 2, backgroundColor: colors.accentSoft, borderRadius: 1 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowNo: { width: 24, fontSize: fonts.size.xs, color: colors.inkSoft, textAlign: 'right' },
  block: { flexDirection: 'row', gap: 3 },
  seat: { width: SEAT, height: SEAT, borderRadius: 6, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  seatOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  seatText: { fontSize: 10, color: colors.inkSoft },
  ship: { width: 240, height: 70, justifyContent: 'flex-end', alignItems: 'center' },
  cabinBlock: { width: 110, height: 24, backgroundColor: colors.line, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  hull: { width: 240, height: 32, backgroundColor: colors.route, borderBottomLeftRadius: 40, borderBottomRightRadius: 16, borderTopRightRadius: 4 },
});

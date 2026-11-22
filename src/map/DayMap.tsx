import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { allVisible, fitRegion, nearestStopAt, nextRegion, type CameraEvent, type Region } from '@/domain/camera';
import type { LatLng, Leg, Stop } from '@/domain/types';
import { askWhenInUse } from '@/location/permissions';
import { colors, fonts, radius, stopColor } from '@/theme/tokens';
import { Text } from '@/ui/Text';

import { drawnLines, easeOut, smoothLine, smoothTolerance } from './drawRoute';
import { selectedOption } from './legRoutes';
import mapStyle from './mapStyle.json';
import { groupPins, pinLabel, type Selection } from './points';

export type { Selection };
export type DayMapHandle = { send: (e: CameraEvent) => void };

type Props = {
  /** 처음 그려질 때 맞출 점들 */
  initialPoints: LatLng[];
  stops: Stop[];
  legs: Leg[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onRegion: (r: Region) => void;
  onLongPress?: (p: LatLng) => void;
  /** 아래를 가리는 일정 시트 높이. 지도 가운데·전체 보기가 그 위로 맞춰진다. */
  bottomInset?: number;
  /** 위를 가리는 여행 이름 막대 높이 */
  topInset?: number;
  /** 하루 경로(방문지)가 지금 화면에 다 보이는지 바뀔 때 */
  onAllVisible?: (visible: boolean) => void;
};

/** 날을 열 때 경로가 처음부터 끝까지 이어 그려지는 시간 */
const DRAW_MS = 1200;

const toMap = (r: Region) => ({ latitude: r.lat, longitude: r.lng, latitudeDelta: r.latDelta, longitudeDelta: r.lngDelta });

/**
 * 하루 지도. 지도를 움직이는 코드는 send() 하나뿐이고,
 * nextRegion 이 영역을 돌려줄 때만 움직인다. 선택은 강조만 한다.
 */
export const DayMap = forwardRef<DayMapHandle, Props>(function DayMap({ initialPoints, stops, legs, selection, onSelect, onRegion, onLongPress, bottomInset = 0, topInset = 0, onAllVisible }, ref) {
  const map = useRef<MapView>(null);
  // 구글 지도가 알려 주는 영역은 mapPadding(아래 시트) 을 이미 뺀 보이는 영역이라 따로 빼지 않는다
  const report = (r: Region) => onAllVisible?.(allVisible(stops.map((s) => ({ lat: s.lat, lng: s.lng })), r));
  // 처음 그날의 지도를 열 때는 그 자리에서 전체 경로가 보이도록 시작한다 (애니메이션이 지도 준비 전에 사라지는 일 방지).
  // 이 컴포넌트는 방문지를 다 읽은 뒤에 그려진다.
  const [initial] = useState(() => (initialPoints.length > 0 ? fitRegion(initialPoints) : null));
  const current = useRef<Region | null>(initial);
  // 사용자가 정한 화면이 있는지. 맞춘 화면이 있거나 사용자가 직접 움직였을 때만 true.
  const hasView = useRef(initial !== null);

  // 그날 경로를 처음 받으면 한 번, 경로 선이 하루 순서대로 빠르게 이어 그려진다 (날을 바꾸면 이 지도가 새로 그려져 다시 한다).
  const [progress, setProgress] = useState(0);
  // 확대 수준에 맞춘 경로 다듬기 정도 (미터)
  const [tol, setTol] = useState(() => smoothTolerance(initial?.latDelta ?? 0));
  const drawn = useRef(false);
  const hasRoute = legs.some((l) => (selectedOption(l)?.polyline.length ?? 0) > 1);
  // 지도를 처음 열 때 위치 권한을 물어, 허락하면 현재 위치를 보여 준다
  const [located, setLocated] = useState(false);
  useEffect(() => {
    let alive = true;
    void askWhenInUse().then((ok) => alive && setLocated(ok));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (drawn.current || !hasRoute) return;
    drawn.current = true;
    let frame = 0;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) return setProgress(1);
      const start = Date.now();
      const step = () => {
        const t = (Date.now() - start) / DRAW_MS;
        setProgress(t >= 1 ? 1 : t);
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [hasRoute]);
  // 하루 순서(앞 장소 순)대로 이어 보고, 지금 진행만큼 잘라 둔다
  const order = (l: Leg) => stops.findIndex((x) => x.id === l.fromStopId);
  const routed = legs.filter((l) => (selectedOption(l)?.polyline.length ?? 0) > 1).sort((x, y) => order(x) - order(y));
  // 길찾기 경로는 잔 꺾임이 많아 삐죽해 보이므로, 지금 확대 수준에서 안 보일 만큼의 꺾임은 걷어 내고 모서리를 둥글게 그린다.
  // 확대하면 실제 길 그대로, 축소하면 매끈한 선.
  const routeKey = routed.map((l) => `${l.id}:${selectedOption(l)!.id}`).join('|');
  const smoothed = useMemo(
    () => routed.map((l) => smoothLine(selectedOption(l)!.polyline, tol)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeKey, tol],
  );
  const partial = drawnLines(smoothed, easeOut(progress));
  const shownLine = new Map(routed.map((l, i) => [l.id, partial[i]]));

  useImperativeHandle(ref, () => ({
    send(e) {
      const target = nextRegion(hasView.current ? current.current : null, e);
      if (!target) return;
      hasView.current = true;
      current.current = target;
      onRegion(target);
      map.current?.animateToRegion(toMap(target), 350);
    },
  }));

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      customMapStyle={mapStyle}
      initialRegion={initial ? toMap(initial) : undefined}
      // 현재 위치(파란 점). 위치 권한을 받은 뒤에 켠다.
      showsUserLocation={located}
      showsMyLocationButton={false}
      mapPadding={{ top: topInset, left: 0, right: 0, bottom: bottomInset }}
      toolbarEnabled={false}
      onRegionChangeComplete={(r, details) => {
        const region = { lat: r.latitude, lng: r.longitude, latDelta: r.latitudeDelta, lngDelta: r.longitudeDelta };
        current.current = region;
        setTol(smoothTolerance(region.latDelta));
        if (details?.isGesture) hasView.current = true;
        onRegion(region);
        report(region);
      }}
      onPress={(e) => {
        // 방문지 판정은 여기서 한다. 지도 빈 곳을 누르면 선택을 풀지 않고 그대로 둔다.
        const r = current.current;
        if (!r) return;
        const c = e.nativeEvent.coordinate;
        if (!c) return;
        const tap = { lat: c.latitude, lng: c.longitude };
        const id = nearestStopAt(tap, stops, r);
        if (id) onSelect({ type: 'stop', id });
      }}
      onLongPress={(e) => onLongPress?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
    >
      {legs.map((leg) => {
        const option = selectedOption(leg);
        if (!option) return null; // 경로를 받기 전에는 선을 그리지 않는다 (직선 금지)
        const on = selection?.type === 'leg' && selection.id === leg.id;
        const line = shownLine.get(leg.id) ?? [];
        if (line.length < 2) return null; // 아직 그려지지 않은 구간
        return (
          <Polyline
            key={`${leg.id}:${option.id}`}
            coordinates={line.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={on ? colors.accent : colors.route}
            // 얇게. 두께는 늘 같게, 고른 구간은 색으로만 구분한다
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
            zIndex={on ? 2 : 1}
            tappable
            onPress={() => onSelect({ type: 'leg', id: leg.id })}
          />
        );
      })}
      {groupPins(stops).map((pin) => {
        const on = selection?.type === 'stop' && pin.stops.some((x) => x.stop.id === selection.id);
        const label = pinLabel(pin);
        return (
          <Marker
            key={`${pin.stops.map((x) => x.stop.id).join('+')}:${label}:${on}`}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false} // 구글 지도는 마커를 누르면 카메라를 옮기므로, 누름은 지도 onPress 에서 판정한다
            tracksViewChanges={false}
          >
            <View style={[styles.pin, label.length > 2 && styles.pinWide, { backgroundColor: stopColor(pin.stops[0].index) }, on && styles.pinOn]}>
              <Text style={[styles.pinText, on && styles.pinTextOn]}>{label}</Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
});

const styles = StyleSheet.create({
  pin: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  pinWide: { width: undefined, minWidth: 30, paddingHorizontal: 8 },
  pinOn: { width: undefined, minWidth: 42, height: 42, borderWidth: 3 },
  pinText: { fontSize: fonts.size.sm, fontWeight: '700', color: colors.card },
  pinTextOn: { fontSize: fonts.size.md },
});

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { allVisible, fitRegion, nearestStopAt, nextRegion, type CameraEvent, type Region } from '@/domain/camera';
import type { LatLng, Leg, Stop } from '@/domain/types';
import { colors, fonts, radius, stopColor } from '@/theme/tokens';

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
  /** 하루 경로(방문지)가 지금 화면에 다 보이는지 바뀔 때 */
  onAllVisible?: (visible: boolean) => void;
};

const toMap = (r: Region) => ({ latitude: r.lat, longitude: r.lng, latitudeDelta: r.latDelta, longitudeDelta: r.lngDelta });

/**
 * 하루 지도. 지도를 움직이는 코드는 send() 하나뿐이고,
 * nextRegion 이 영역을 돌려줄 때만 움직인다. 선택은 강조만 한다.
 */
export const DayMap = forwardRef<DayMapHandle, Props>(function DayMap({ initialPoints, stops, legs, selection, onSelect, onRegion, onLongPress, bottomInset = 0, onAllVisible }, ref) {
  const map = useRef<MapView>(null);
  // 구글 지도가 알려 주는 영역은 mapPadding(아래 시트) 을 이미 뺀 보이는 영역이라 따로 빼지 않는다
  const report = (r: Region) => onAllVisible?.(allVisible(stops.map((s) => ({ lat: s.lat, lng: s.lng })), r));
  // 처음 그날의 지도를 열 때는 그 자리에서 전체 경로가 보이도록 시작한다 (애니메이션이 지도 준비 전에 사라지는 일 방지).
  // 이 컴포넌트는 방문지를 다 읽은 뒤에 그려진다.
  const [initial] = useState(() => (initialPoints.length > 0 ? fitRegion(initialPoints) : null));
  const current = useRef<Region | null>(initial);
  // 사용자가 정한 화면이 있는지. 맞춘 화면이 있거나 사용자가 직접 움직였을 때만 true.
  const hasView = useRef(initial !== null);

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
      showsUserLocation
      showsMyLocationButton={false}
      mapPadding={{ top: 0, left: 0, right: 0, bottom: bottomInset }}
      toolbarEnabled={false}
      onRegionChangeComplete={(r, details) => {
        const region = { lat: r.latitude, lng: r.longitude, latDelta: r.latitudeDelta, lngDelta: r.longitudeDelta };
        current.current = region;
        if (details?.isGesture) hasView.current = true;
        onRegion(region);
        report(region);
      }}
      onPress={(e) => {
        // 방문지 판정은 여기서 한다. 지도 빈 곳을 누르면 선택을 풀지 않고 그대로 둔다.
        const r = current.current;
        if (!r) return;
        const tap = { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude };
        const id = nearestStopAt(tap, stops, r);
        if (id) onSelect({ type: 'stop', id });
      }}
      onLongPress={(e) => onLongPress?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
    >
      {legs.map((leg) => {
        const option = selectedOption(leg);
        if (!option) return null; // 경로를 받기 전에는 선을 그리지 않는다 (직선 금지)
        const on = selection?.type === 'leg' && selection.id === leg.id;
        return (
          <Polyline
            key={`${leg.id}:${option.id}`}
            coordinates={option.polyline.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={on ? colors.accent : colors.route}
            strokeWidth={on ? 7 : 4}
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

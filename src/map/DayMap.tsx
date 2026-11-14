import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { fitRegion, nearestStopAt, nextRegion, type CameraEvent, type Region } from '@/domain/camera';
import type { Id, LatLng, Leg, Stop } from '@/domain/types';
import { colors, fonts, radius } from '@/theme/tokens';

import { selectedOption } from './legRoutes';
import mapStyle from './mapStyle.json';

export type Selection = { type: 'stop' | 'leg'; id: Id } | null;
export type DayMapHandle = { send: (e: CameraEvent) => void };

type Props = {
  /** 처음 그려질 때 맞출 점들 */
  initialPoints: LatLng[];
  stops: Stop[];
  legs: Leg[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onRegion: (r: Region) => void;
  onLongPress: (p: LatLng) => void;
};

const toMap = (r: Region) => ({ latitude: r.lat, longitude: r.lng, latitudeDelta: r.latDelta, longitudeDelta: r.lngDelta });

/**
 * 하루 지도. 지도를 움직이는 코드는 send() 하나뿐이고,
 * nextRegion 이 영역을 돌려줄 때만 움직인다. 선택은 강조만 한다.
 */
export const DayMap = forwardRef<DayMapHandle, Props>(function DayMap({ initialPoints, stops, legs, selection, onSelect, onRegion, onLongPress }, ref) {
  const map = useRef<MapView>(null);
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
      toolbarEnabled={false}
      onRegionChangeComplete={(r, details) => {
        const region = { lat: r.latitude, lng: r.longitude, latDelta: r.latitudeDelta, lngDelta: r.longitudeDelta };
        current.current = region;
        if (details?.isGesture) hasView.current = true;
        onRegion(region);
      }}
      onPress={(e) => {
        // 방문지 판정은 여기서 한다. 지도 빈 곳을 누르면 선택을 풀지 않고 그대로 둔다.
        const r = current.current;
        if (!r) return;
        const tap = { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude };
        const id = nearestStopAt(tap, stops, r);
        if (id) onSelect({ type: 'stop', id });
      }}
      onLongPress={(e) => onLongPress({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
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
      {stops.map((s, i) => {
        const on = selection?.type === 'stop' && selection.id === s.id;
        return (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false} // 구글 지도는 마커를 누르면 카메라를 옮기므로, 누름은 지도 onPress 에서 판정한다
          >
            <View style={[styles.pin, s.arrivedAt && styles.pinArrived, on && styles.pinOn]}>
              <Text style={[styles.pinText, on && { color: colors.card }]}>{i + 1}</Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
});

const styles = StyleSheet.create({
  pin: { minWidth: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  pinArrived: { borderColor: colors.accent },
  pinOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pinText: { fontSize: fonts.size.sm, fontWeight: '700', color: colors.ink },
});

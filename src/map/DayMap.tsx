import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { nextRegion, type CameraEvent, type Region } from '@/domain/camera';
import type { Id, LatLng, Leg, Stop } from '@/domain/types';
import { colors, fonts, radius } from '@/theme/tokens';

import { selectedOption } from './legRoutes';
import mapStyle from './mapStyle.json';

export type Selection = { type: 'stop' | 'leg'; id: Id } | null;
export type DayMapHandle = { send: (e: CameraEvent) => void };

type Props = {
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
export const DayMap = forwardRef<DayMapHandle, Props>(function DayMap({ stops, legs, selection, onSelect, onRegion, onLongPress }, ref) {
  const map = useRef<MapView>(null);
  const current = useRef<Region | null>(null);
  // 지도는 뜨자마자 기본 화면을 한 번 알려온다. 그것을 "사용자가 정한 화면"으로 치지 않도록,
  // 첫 맞춤이 끝나기 전에는 현재 화면이 없는 것으로 본다.
  const fitted = useRef(false);

  useImperativeHandle(ref, () => ({
    send(e) {
      const target = nextRegion(e.type === 'dayOpened' && !fitted.current ? null : current.current, e);
      if (!target) return;
      fitted.current = true;
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
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onRegionChangeComplete={(r) => {
        const region = { lat: r.latitude, lng: r.longitude, latDelta: r.latitudeDelta, lngDelta: r.longitudeDelta };
        current.current = region;
        onRegion(region);
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
            onPress={(e) => {
              e.stopPropagation();
              onSelect({ type: 'stop', id: s.id });
            }}
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

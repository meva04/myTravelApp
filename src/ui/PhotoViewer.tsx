// 사진 크게 보기: 화면 가득 원본을 보여 주고, 옆으로 밀어 다음·이전으로 넘긴다. 동영상은 그 자리에서 재생한다.
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isVideo } from '@/domain/media';
import { t } from '@/i18n/ko';
import { fonts, space } from '@/theme/tokens';
import { Text } from '@/ui/Text';

type Props = {
  /** 보여 줄 사진·동영상 주소들 (넘기는 순서) */
  uris: string[];
  /** 처음 보여 줄 것 */
  start: number;
  onClose: () => void;
};

export function PhotoViewer({ uris, start, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.bg} testID="photo-viewer">
        <FlatList
          data={uris}
          horizontal
          pagingEnabled
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(u, i) => `${i}:${u}`}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) =>
            isVideo(item) ? (
              <VideoPage uri={item} width={width} height={height} active={i === index} />
            ) : (
              <Image source={{ uri: item }} style={{ width, height }} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
            )
          }
        />
        {/* 모달 안에서는 안전 여백 값이 0으로 올 때가 있어, 기기에 맞춰 직접 비켜 앉는 SafeAreaView 를 쓴다 */}
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.topWrap} pointerEvents="box-none">
          <View style={styles.top} pointerEvents="box-none">
            <Text style={styles.count}>{`${index + 1} / ${uris.length}`}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** 동영상 한 장. 보고 있는 장일 때만 재생한다. */
function VideoPage({ uri, width, height, active }: { uri: string; width: number; height: number; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <View style={{ width, height, justifyContent: 'center' }} testID={`video:${uri}`}>
      <VideoView player={player} style={{ width, height: height * 0.8 }} contentFit="contain" nativeControls />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  topWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  top: { paddingHorizontal: space.lg, paddingTop: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: '#fff', fontSize: fonts.size.sm, fontVariant: ['tabular-nums'] },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  closeText: { color: '#fff', fontSize: 18 },
});

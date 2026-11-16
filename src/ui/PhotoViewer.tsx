// 사진 크게 보기: 화면 가득 보여 주고, 옆으로 밀어 다음·이전 사진으로 넘긴다.
import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { t } from '@/i18n/ko';
import { fonts, space } from '@/theme/tokens';

type Props = {
  /** 보여 줄 사진 주소들 (넘기는 순서) */
  uris: string[];
  /** 처음 보여 줄 사진 */
  start: number;
  onClose: () => void;
};

export function PhotoViewer({ uris, start, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  // 모달 안에서도 위쪽 안전 여백만큼 내려 둔다 (값이 없으면 0)
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
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
          renderItem={({ item }) => (
            <Image source={{ uri: item }} style={{ width, height }} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
          )}
        />
        <View style={[styles.top, { top: top + space.sm }]} pointerEvents="box-none">
          <Text style={styles.count}>{`${index + 1} / ${uris.length}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: '#fff', fontSize: fonts.size.sm, fontVariant: ['tabular-nums'] },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  closeText: { color: '#fff', fontSize: 18 },
});

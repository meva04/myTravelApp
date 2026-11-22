// 화면 바탕 그라데이션 (Lovi 스타일). 내용 뒤에 깔리고 누름은 통과시킨다.
import { View, type ViewStyle } from 'react-native';

import { colors, gradients } from '@/theme/tokens';

const fill: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.paper, experimental_backgroundImage: gradients.backdrop };

export function Backdrop() {
  return <View pointerEvents="none" style={fill} />;
}

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider } from '@/state/AppProvider';
import { colors } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <Stack
          screenOptions={{
            title: '',
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            // 위 막대를 투명하게 해 화면 바탕 그라데이션이 상태 표시줄까지 이어지게 한다 (내용은 Screen 이 막대 아래로 내린다)
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: colors.ink,
            contentStyle: { backgroundColor: colors.paper },
          }}
        />
      </AppProvider>
    </GestureHandlerRootView>
  );
}

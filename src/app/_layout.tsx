import '@/location/geofence'; // 백그라운드 도착 감지 태스크는 앱 시작 시 최상위에서 등록되어야 한다.

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
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
            contentStyle: { backgroundColor: colors.paper },
          }}
        />
      </AppProvider>
    </GestureHandlerRootView>
  );
}

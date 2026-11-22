// 애니메이션·끌어서 정렬은 기기에서만 의미가 있으므로 테스트에서는 단순한 대체품을 쓴다.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (c) => c },
    interpolateColor: (_v, _input, output) => output[0],
    useSharedValue: (value) => ({
      value,
      get() {
        return this.value;
      },
      set(v) {
        this.value = v;
      },
    }),
    useAnimatedStyle: (fn) => fn(),
    withSpring: (value) => value,
    withTiming: (value) => value,
    interpolate: (_v, _input, output) => output[0],
    Extrapolation: { CLAMP: 'clamp' },
    // 화면에 나타나고 사라지는 애니메이션은 테스트에서는 아무것도 하지 않는다 (체이닝만 되게)
    ...Object.fromEntries(['FadeIn', 'FadeOut', 'FadeInLeft', 'ZoomIn', 'ZoomOut', 'LinearTransition', 'SlideInDown', 'SlideOutDown'].map((n) => {
      const anim = new Proxy({}, { get: () => () => anim });
      return [n, anim];
    })),
  };
});
jest.mock('react-native-sortables', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Grid = ({ data, renderItem, keyExtractor }) =>
    React.createElement(
      View,
      null,
      data.map((item, index) => React.createElement(View, { key: keyExtractor ? keyExtractor(item) : index }, renderItem({ item, index }))),
    );
  const useItemContext = () => ({ isActive: { value: false }, activationAnimationProgress: { value: 0 } });
  return { __esModule: true, default: { Grid }, useItemContext };
});
// 지도와 바텀시트는 네이티브 화면이라 테스트에서는 내용만 그대로 보여 준다.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));
    return React.createElement(View, { testID: 'map' }, props.children);
  });
  const Pass = (props) => React.createElement(View, null, props.children);
  return { __esModule: true, default: MapView, Marker: Pass, Polyline: () => null, PROVIDER_GOOGLE: 'google' };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { ScrollView, View } = require('react-native');
  const BottomSheet = (props) => React.createElement(View, null, props.children);
  return { __esModule: true, default: BottomSheet, BottomSheetScrollView: ScrollView };
});
// iOS 날짜·시간 선택기 대체품: 값을 글자로 넣으면 그 날짜로 바뀐다 (예: '2027-03-02T09:30').
jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { TextInput, View } = require('react-native');
  return {
    Host: (props) => React.createElement(View, null, props.children),
    DatePicker: (props) =>
      React.createElement(TextInput, { accessibilityLabel: `${props.title} 선택기`, onChangeText: (v) => props.onDateChange?.(new Date(v)) }),
  };
});
// 동영상 재생·썸네일·사진첩은 기기에서만 돈다
jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { useVideoPlayer: () => ({ play: () => {}, pause: () => {}, loop: false }), VideoView: (props) => React.createElement(View, { testID: props.testID }) };
});
jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: async () => ({ uri: 'file:///thumb.jpg' }) }));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({ datePickerStyle: () => ({}), labelsHidden: () => ({}) }));
// 밀어서 삭제: 테스트에서는 내용과 삭제 버튼을 함께 그대로 보여 준다.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Swipeable = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ close: () => {}, openLeft: () => {}, openRight: () => {}, reset: () => {} }));
    return React.createElement(View, null, props.children, props.renderRightActions?.({ value: 0 }, { value: 0 }, { close: () => {} }));
  });
  return { __esModule: true, default: Swipeable };
});
// 밀어서 바꾸는 토글 등 손가락 제스처는 기기에서만 돈다. 테스트에서는 감싼 내용만 보여 준다.
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: (props) => React.createElement(View, props),
    GestureDetector: (props) => props.children,
    usePanGesture: () => ({}),
  };
});

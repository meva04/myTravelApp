// 애니메이션·끌어서 정렬은 기기에서만 의미가 있으므로 테스트에서는 단순한 대체품을 쓴다.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value) => ({ value }),
    useAnimatedStyle: (fn) => fn(),
    withSpring: (value) => value,
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
  return { __esModule: true, default: { Grid } };
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

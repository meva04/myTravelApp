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

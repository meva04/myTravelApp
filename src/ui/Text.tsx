// 앱 전체에서 쓰는 글자 요소. 한글을 단어 단위로 줄바꿈한다 (CSS 의 word-break: keep-all 과 같은 효과).
// react-native 의 Text·TextInput 대신 이것을 쓴다.
import { forwardRef, type ComponentRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

/** 'hangul-word': 한 단어 안에서 줄이 끊기지 않게 한다 (iOS). 안드로이드에는 같은 설정이 없어 기본 줄바꿈을 쓴다. */
const KEEP_ALL = 'hangul-word' as const;

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function Text(props, ref) {
  return <RNText lineBreakStrategyIOS={KEEP_ALL} {...props} ref={ref} />;
});

export const TextInput = forwardRef<ComponentRef<typeof RNTextInput>, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput lineBreakStrategyIOS={KEEP_ALL} {...props} ref={ref} />;
});

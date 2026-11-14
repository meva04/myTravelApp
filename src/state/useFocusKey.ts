import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/** 화면이 다시 보일 때마다 1씩 커지는 값. 돌아왔을 때 데이터를 다시 불러오는 데 쓴다. */
export function useFocusKey(): number {
  const [key, setKey] = useState(0);
  useFocusEffect(useCallback(() => setKey((k) => k + 1), []));
  return key;
}

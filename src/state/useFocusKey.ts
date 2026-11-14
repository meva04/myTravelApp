import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { onDataChanged } from './events';

/**
 * 화면을 다시 불러와야 할 때마다 1씩 커지는 값: 다른 화면에서 돌아왔을 때, 앱이 다시 앞으로 나왔을 때,
 * 백그라운드에서 도착이 기록됐을 때. 처음 화면이 뜰 때는 바뀌지 않는다 (중복 로딩 방지).
 */
export function useFocusKey(): number {
  const [key, setKey] = useState(0);
  const first = useRef(true);
  const bump = useCallback(() => setKey((k) => k + 1), []);
  useFocusEffect(
    useCallback(() => {
      if (first.current) first.current = false;
      else bump();
    }, [bump]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && bump());
    const off = onDataChanged(bump);
    return () => {
      sub.remove();
      off();
    };
  }, [bump]);
  return key;
}

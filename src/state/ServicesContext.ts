import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import type { Services } from './services';

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('ServicesContext is missing');
  return s;
}

/** 비동기로 값을 불러온다. reload() 로 다시 불러올 수 있다. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    load().then((v) => {
      if (alive) setData(v);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, reload };
}

import { useCallback, useEffect, useState } from 'react';

import type { Id, TravelMode } from '@/domain/types';
import { useServices } from '@/state/ServicesContext';

import { changeLegMode, loadLegRoutes, readLegRoutes, type LegRoutes } from './legRoutes';

const EMPTY: LegRoutes = { stops: [], legs: [], status: {} };

export function useLegRoutes(dayId: Id, refreshKey = 0) {
  const sv = useServices();
  const [state, setState] = useState<LegRoutes>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const retry = useCallback(() => {
    let alive = true;
    // 1) 저장된 것부터 바로 보여주고 2) 빠진 경로를 받아 채운다.
    readLegRoutes(sv, dayId)
      .then((r) => {
        if (!alive) return;
        setState(r);
        setLoaded(true);
        return loadLegRoutes(sv, dayId);
      })
      .then((r) => alive && r && setState(r))
      .catch((e) => console.warn('load routes failed', e));
    return () => {
      alive = false;
    };
  }, [sv, dayId]);

  useEffect(retry, [retry, refreshKey]);

  const setMode = useCallback(
    (legId: Id, mode: TravelMode) => {
      setState((s) => ({ ...s, status: { ...s.status, [legId]: 'loading' } }));
      changeLegMode(sv, dayId, legId, mode)
        .then(setState)
        .catch((e) => console.warn('change mode failed', e));
    },
    [sv, dayId],
  );

  return { ...state, loaded, setMode, retry: () => void retry() };
}

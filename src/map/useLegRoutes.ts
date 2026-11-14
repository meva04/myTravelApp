import { useCallback, useEffect, useState } from 'react';

import type { Id, TravelMode } from '@/domain/types';
import { useServices } from '@/state/ServicesContext';

import { changeLegMode, loadLegRoutes, type LegRoutes } from './legRoutes';

const EMPTY: LegRoutes = { stops: [], legs: [], status: {} };

export function useLegRoutes(dayId: Id, refreshKey = 0) {
  const sv = useServices();
  const [state, setState] = useState<LegRoutes>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const retry = useCallback(() => {
    void loadLegRoutes(sv, dayId).then((r) => {
      setState(r);
      setLoaded(true);
    });
  }, [sv, dayId]);

  useEffect(retry, [retry, refreshKey]);

  const setMode = useCallback(
    (legId: Id, mode: TravelMode) => {
      setState((s) => ({ ...s, status: { ...s.status, [legId]: 'loading' } }));
      void changeLegMode(sv, dayId, legId, mode).then(setState);
    },
    [sv, dayId],
  );

  return { ...state, loaded, setMode, retry };
}

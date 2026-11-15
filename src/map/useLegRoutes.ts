import { useCallback, useEffect, useState } from 'react';

import type { Id, TravelMode } from '@/domain/types';
import { useServices } from '@/state/ServicesContext';

import { changeLegMode, loadLegRoutes, readLegRoutes, type LegRoutes } from './legRoutes';

const EMPTY: LegRoutes = { stops: [], legs: [], status: {} };

export function useLegRoutes(dayId: Id | undefined, refreshKey = 0) {
  const sv = useServices();
  // 어느 날의 데이터인지 함께 들고 있어서, 날을 바꾼 직후 이전 날의 목록을 쓰지 않는다.
  const [state, setState] = useState<LegRoutes & { dayId: Id | null }>({ ...EMPTY, dayId: null });

  const retry = useCallback(() => {
    if (!dayId) return;
    let alive = true;
    // 1) 저장된 것부터 바로 보여주고 2) 빠진 경로를 받아 채운다.
    readLegRoutes(sv, dayId)
      .then((r) => {
        if (!alive) return;
        setState({ ...r, dayId });
        return loadLegRoutes(sv, dayId);
      })
      .then((r) => alive && r && setState({ ...r, dayId }))
      .catch((e) => console.warn('load routes failed', e));
    return () => {
      alive = false;
    };
  }, [sv, dayId]);

  useEffect(retry, [retry, refreshKey]);

  const setMode = useCallback(
    (legId: Id, mode: TravelMode) => {
      if (!dayId) return;
      setState((s) => ({ ...s, status: { ...s.status, [legId]: 'loading' } }));
      changeLegMode(sv, dayId, legId, mode)
        .then((r) => setState((s) => (s.dayId === dayId ? { ...r, dayId } : s)))
        .catch((e) => console.warn('change mode failed', e));
    },
    [sv, dayId],
  );

  const loaded = dayId != null && state.dayId === dayId;
  const current = loaded ? state : EMPTY;
  return { stops: current.stops, legs: current.legs, status: current.status, loaded, setMode, retry: () => void retry() };
}

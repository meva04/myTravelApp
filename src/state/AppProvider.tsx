import { useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { refreshGeofences } from '@/location/geofence';
import { refreshReminders, registerPromptCategories, usePromptResponses } from '@/location/prompts';

import { emitDataChanged } from './events';
import { ServicesContext } from './ServicesContext';
import { getServices, type Services } from './services';

/** 일정이나 도착 상태가 바뀌면 도착 감지 대상과 예정 시간 알림을 다시 맞춘다. */
function refreshWatchers() {
  void refreshGeofences();
  void refreshReminders();
  emitDataChanged();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Services | null>(null);
  usePromptResponses(refreshWatchers);
  useEffect(() => {
    void registerPromptCategories().catch((e) => console.warn('register categories failed', e));
    getServices()
      .then((s) => {
        s.onItineraryChanged = refreshWatchers;
        setServices(s);
        refreshWatchers();
      })
      .catch((e) => console.warn('open database failed', e));
    // 앱이 다시 앞으로 나올 때마다(날짜가 바뀌었을 수 있으니) 감시 대상을 다시 등록한다.
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refreshWatchers());
    return () => sub.remove();
  }, []);
  if (!services) return null;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

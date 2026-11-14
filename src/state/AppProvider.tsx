import { useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { refreshGeofences } from '@/location/geofence';

import { ServicesContext } from './ServicesContext';
import { getServices, type Services } from './services';

export function AppProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Services | null>(null);
  useEffect(() => {
    getServices()
      .then((s) => {
        s.onItineraryChanged = () => void refreshGeofences();
        setServices(s);
        void refreshGeofences();
      })
      .catch((e) => console.warn('open database failed', e));
    // 앱이 다시 앞으로 나올 때마다(날짜가 바뀌었을 수 있으니) 감시 대상을 다시 등록한다.
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void refreshGeofences());
    return () => sub.remove();
  }, []);
  if (!services) return null;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

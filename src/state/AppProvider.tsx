import { useEffect, useState, type ReactNode } from 'react';

import { refreshGeofences } from '@/location/geofence';

import { ServicesContext } from './ServicesContext';
import { getServices, type Services } from './services';

export function AppProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Services | null>(null);
  useEffect(() => {
    getServices().then((s) => {
      s.onItineraryChanged = () => void refreshGeofences();
      setServices(s);
      void refreshGeofences();
    });
  }, []);
  if (!services) return null;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { isRunningInApp } from '../utils/appEnvironment';
import {
  APP_BUILD_ID,
  clearAllCachesAndWorkers,
  performFullCacheAndUiCleanup,
  waitForStartupBuildCleanup,
} from '../utils/cacheCleanup';

const AUTO_RELOAD_SESSION_KEY = 'masarik_auto_synced_build_v1';

export function useSiteUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const isApplyingRef = useRef(false);

  const applyUpdate = useCallback(async () => {
    if (isApplyingRef.current) return;
    isApplyingRef.current = true;
    setIsUpdating(true);

    if (waitingWorkerRef.current) {
      try {
        waitingWorkerRef.current.postMessage({ type: 'CLEAR_ALL_CACHES' });
        waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        // Ignore SW messaging error
      }
    }

    await performFullCacheAndUiCleanup({
      unregisterServiceWorkers: !waitingWorkerRef.current,
    });

    setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('v', Date.now().toString());
        window.location.replace(url.toString());
      } catch {
        window.location.reload();
      }
    }, 250);
  }, []);

  const checkForSiteVersionChange = useCallback(async () => {
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (!response.ok) return;
      const data: { version?: string } = await response.json();
      if (
        data?.version &&
        data.version !== '1.0.1-dev' &&
        APP_BUILD_ID &&
        data.version !== APP_BUILD_ID
      ) {
        await performFullCacheAndUiCleanup({ unregisterServiceWorkers: true });

        // Auto-sync immediately once per remote build so installed APK & browsers reflect live site updates without an APK rebuild
        let alreadyAutoSynced = false;
        try {
          alreadyAutoSynced = sessionStorage.getItem(AUTO_RELOAD_SESSION_KEY) === data.version;
          if (!alreadyAutoSynced) {
            sessionStorage.setItem(AUTO_RELOAD_SESSION_KEY, data.version);
          }
        } catch {
          alreadyAutoSynced = false;
        }

        if (!alreadyAutoSynced && (isRunningInApp() || document.visibilityState === 'visible')) {
          void applyUpdate();
          return;
        }

        setHasUpdate(true);
      }
    } catch {
      // Offline or blocked — ignore quietly
    }
  }, [applyUpdate]);

  useEffect(() => {
    let registrationRef: ServiceWorkerRegistration | null = null;
    let refreshing = false;
    let cancelled = false;

    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    if (import.meta.env.DEV) {
      // In dev mode, ensure no stale Service Worker intercepts /src/*.ts Vite modules (keep FCM SW intact)
      void clearAllCachesAndWorkers({ unregisterServiceWorkers: true });
    } else if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      void waitForStartupBuildCleanup().then(() => {
        if (cancelled) return;
        navigator.serviceWorker
          .register('/sw.js', { updateViaCache: 'none' })
          .then((registration) => {
            if (cancelled) return;
            registrationRef = registration;

            if (registration.waiting) {
              waitingWorkerRef.current = registration.waiting;
              void clearAllCachesAndWorkers();
              setHasUpdate(true);
            }

            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (!newWorker) return;

              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  waitingWorkerRef.current = newWorker;
                  void clearAllCachesAndWorkers();
                  setHasUpdate(true);
                }
              });
            });

            // Trigger background SW check
            registration.update().catch(() => {});
          })
          .catch(() => {});
      });
    }

    // Initial version.json check + periodic checks + tab focus checks
    void checkForSiteVersionChange();

    const intervalId = window.setInterval(() => {
      void checkForSiteVersionChange();
      registrationRef?.update().catch(() => {});
    }, 90 * 1000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void checkForSiteVersionChange();
        registrationRef?.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, [checkForSiteVersionChange]);

  return {
    hasUpdate,
    isUpdating,
    applyUpdate,
    dismissUpdate: () => setHasUpdate(false),
  };
}

export const APP_BUILD_ID =
  typeof __APP_BUILD_VERSION__ !== 'undefined' && __APP_BUILD_VERSION__
    ? __APP_BUILD_VERSION__
    : '1.0.1-dev';

const BUILD_ID_STORAGE_KEY = 'masarik_app_build_id_v1';
const TRAVELERS_STORAGE_KEY = 'masarik_travelers_v1';
const ACTIVE_PHONE_STORAGE_KEY = 'masarik_active_phone_v1';
const AUTO_RELOAD_SESSION_KEY = 'masarik_auto_synced_build_v1';

const PRESERVED_LOCAL_STORAGE_KEYS = new Set<string>([
  ACTIVE_PHONE_STORAGE_KEY,
  'masarik_saved_client_phone_v1',
  'masarik_session_meta_v1',
  'masarik_session_expired_notice_v1',
  'masarik_device_secret_v1',
  'masarik_device_fp_v1',
  'masarik_pending_verification_phone_v1',
  'masarik_admin_session_v1',
  'masarik_admin_pin_v1',
  'masarik_admin_pin_hash_v1',
  'masarik_sub_admins_v1',
  'masarik_lang',
  BUILD_ID_STORAGE_KEY,
]);

const PRESERVED_SESSION_STORAGE_KEYS = new Set<string>([
  ACTIVE_PHONE_STORAGE_KEY,
  'masarik_session_meta_v1',
  AUTO_RELOAD_SESSION_KEY,
]);

let startupCleanupPromise: Promise<void> = Promise.resolve();
let startupCleanupRan = false;

function shouldPreserveLocalKey(key: string): boolean {
  if (PRESERVED_LOCAL_STORAGE_KEYS.has(key)) return true;
  if (key.startsWith('firebase:')) return true;
  if (key.startsWith('masarik_admin_chat_cleared_')) return true;
  if (key.startsWith('masarik_analytics_')) return true;
  return false;
}

function shouldPreserveSessionKey(key: string): boolean {
  if (PRESERVED_SESSION_STORAGE_KEYS.has(key)) return true;
  if (key.startsWith('firebase:')) return true;
  return false;
}

/**
 * Cleans stale UI caches in localStorage & temporary sessionStorage items
 * while strictly preserving the logged-in user, 12-hour PIN session, device trust,
 * and Admin session/PIN credentials.
 */
export function cleanStaleUiStoragePreservingAuth(): void {
  if (typeof window === 'undefined') return;

  try {
    const activePhoneRaw =
      window.localStorage.getItem(ACTIVE_PHONE_STORAGE_KEY) ||
      window.sessionStorage.getItem(ACTIVE_PHONE_STORAGE_KEY) ||
      '';
    const activePhone = activePhoneRaw.replace(/\D/g, '');

    const localKeysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key === TRAVELERS_STORAGE_KEY || shouldPreserveLocalKey(key)) continue;
      localKeysToRemove.push(key);
    }
    localKeysToRemove.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore storage errors
      }
    });

    // Keep ONLY the currently active traveler record inside masarik_travelers_v1 so
    // the logged-in user stays signed in seamlessly while stale cached profiles are pruned.
    try {
      if (activePhone) {
        const rawTravelers = window.localStorage.getItem(TRAVELERS_STORAGE_KEY);
        if (rawTravelers) {
          const parsed = JSON.parse(rawTravelers) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object' && parsed[activePhone]) {
            window.localStorage.setItem(
              TRAVELERS_STORAGE_KEY,
              JSON.stringify({ [activePhone]: parsed[activePhone] })
            );
          } else {
            window.localStorage.removeItem(TRAVELERS_STORAGE_KEY);
          }
        }
      } else {
        window.localStorage.removeItem(TRAVELERS_STORAGE_KEY);
      }
    } catch {
      // Ignore parse errors
    }
  } catch {
    // Ignore localStorage access errors
  }

  try {
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key || shouldPreserveSessionKey(key)) continue;
      sessionKeysToRemove.push(key);
    }
    sessionKeysToRemove.forEach((key) => {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Ignore storage errors
      }
    });
  } catch {
    // Ignore sessionStorage access errors
  }
}

/**
 * Deletes all Browser CacheStorage entries and optionally unregisters stale non-FCM Service Workers.
 */
export async function clearAllCachesAndWorkers(options?: {
  unregisterServiceWorkers?: boolean;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
    } catch {
      // Ignore messaging failure
    }
  }

  if ('caches' in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch {
      // Ignore CacheStorage errors
    }
  }

  if (options?.unregisterServiceWorkers && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((reg) => !reg.scope.includes('firebase-cloud-messaging-push-scope'))
          .map((reg) => reg.unregister().catch(() => false))
      );
    } catch {
      // Ignore SW unregistration failures
    }
  }
}

/**
 * Full smart cleanup invoked both on build updates and on manual top-bar Refresh ↻.
 */
export async function performFullCacheAndUiCleanup(options?: {
  unregisterServiceWorkers?: boolean;
}): Promise<void> {
  cleanStaleUiStoragePreservingAuth();
  try {
    window.localStorage.setItem(BUILD_ID_STORAGE_KEY, APP_BUILD_ID);
  } catch {
    // Ignore storage write error
  }
  await clearAllCachesAndWorkers(options);
}

/**
 * Runs once at application startup in main.tsx.
 * Detects when APP_BUILD_ID differs from the last seen build ID and automatically clears
 * old browser caches, stale Service Workers, sessionStorage leftovers, and cached UI storage
 * while keeping user authentication and PIN session intact.
 */
export function runStartupBuildCleanup(): void {
  if (typeof window === 'undefined' || startupCleanupRan) return;
  startupCleanupRan = true;

  let storedBuildId = '';
  try {
    storedBuildId = window.localStorage.getItem(BUILD_ID_STORAGE_KEY) || '';
  } catch {
    storedBuildId = '';
  }

  if (storedBuildId === APP_BUILD_ID) {
    return;
  }

  cleanStaleUiStoragePreservingAuth();
  try {
    window.localStorage.setItem(BUILD_ID_STORAGE_KEY, APP_BUILD_ID);
  } catch {
    // Ignore storage write errors
  }

  startupCleanupPromise = clearAllCachesAndWorkers({
    unregisterServiceWorkers: true,
  });
}

export function waitForStartupBuildCleanup(): Promise<void> {
  return startupCleanupPromise;
}

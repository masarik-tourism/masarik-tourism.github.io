import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, db } from '../firebase';
import { getSiteConfig } from './siteConfigStore';

export type PushNotificationAction =
  | 'live_chat'
  | 'client_folder'
  | 'chat'
  | 'documents'
  | 'orders'
  | 'account';

export interface PushDeepLinkPayload {
  role: 'admin' | 'client';
  action: PushNotificationAction;
  phone?: string;
}

export const PUSH_NAVIGATE_EVENT = 'masarik-push-navigate';
export const NATIVE_FCM_TOKEN_EVENT = 'masarik-native-fcm-token';
export const PUSH_LOG_UPDATED_EVENT = 'masarik-push-log-updated';
export const CLOUDFLARE_PUSH_WORKER_URL =
  'https://masarik-otp.masarik-tourism.workers.dev/send-push';
const LAST_PUSH_LOG_STORAGE_KEY = 'masarik_last_push_log_v1';
const FCM_SW_SCRIPT_URL = '/firebase-messaging-sw.js';
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export interface PushDiagnosticLog {
  id: string;
  timestamp: string;
  targetRole: 'admin' | 'client';
  targetPhone?: string;
  title: string;
  tokenCount: number;
  okCount: number;
  failCount: number;
  lastStatus: number | null;
  statusText: string;
  responseBody: string;
  outcome: 'sent' | 'partial' | 'failed' | 'no_tokens';
}

export function getLastPushDiagnosticLog(): PushDiagnosticLog | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_PUSH_LOG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PushDiagnosticLog;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function recordPushDiagnosticLog(entry: PushDiagnosticLog): PushDiagnosticLog {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LAST_PUSH_LOG_STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // Ignore storage quota errors
    }
    window.dispatchEvent(new CustomEvent<PushDiagnosticLog>(PUSH_LOG_UPDATED_EVENT, { detail: entry }));
  }
  return entry;
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  if (window.AndroidBridge?.hasNotificationPermission) {
    return window.AndroidBridge.hasNotificationPermission() ? 'granted' : 'default';
  }
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register(FCM_SW_SCRIPT_URL, {
        scope: FCM_SW_SCOPE,
        updateViaCache: 'none',
      })
      .then((reg) => {
        reg.update().catch(() => {});
        return reg;
      })
      .catch(() => null);
  }

  return swRegistrationPromise;
}

function waitForNativeAndroidPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.AndroidBridge?.hasNotificationPermission?.()) {
      resolve(true);
      return;
    }

    let settled = false;
    const finish = (granted: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('masarik-native-permission', onResult);
      window.clearTimeout(timer);
      resolve(granted);
    };

    const onResult = (evt: Event) => {
      const detail = (evt as CustomEvent<{ granted?: boolean }>).detail;
      finish(Boolean(detail?.granted));
    };

    window.addEventListener('masarik-native-permission', onResult);
    const timer = window.setTimeout(() => {
      finish(Boolean(window.AndroidBridge?.hasNotificationPermission?.()));
    }, 10000);

    window.AndroidBridge?.requestNotificationPermission?.();
  });
}

export function getNativeAndroidFcmToken(): string {
  if (typeof window === 'undefined') return '';
  const bridgeToken = window.AndroidBridge?.getNativeFcmToken?.() || '';
  if (bridgeToken.trim()) return bridgeToken.trim();
  const winToken = window.__MASARIK_NATIVE_FCM_TOKEN__ || '';
  return winToken.trim();
}

export function waitForNativeAndroidFcmToken(timeoutMs = 3500): Promise<string> {
  return new Promise((resolve) => {
    const immediate = getNativeAndroidFcmToken();
    if (immediate) {
      resolve(immediate);
      return;
    }

    let settled = false;
    const finish = (token: string) => {
      if (settled) return;
      settled = true;
      window.removeEventListener(NATIVE_FCM_TOKEN_EVENT, onToken);
      window.clearTimeout(timer);
      resolve(token.trim());
    };

    const onToken = (evt: Event) => {
      const detail = (evt as CustomEvent<{ token?: string }>).detail;
      const tk = (detail?.token || getNativeAndroidFcmToken()).trim();
      if (tk) finish(tk);
    };

    window.addEventListener(NATIVE_FCM_TOKEN_EVENT, onToken);
    const timer = window.setTimeout(() => {
      finish(getNativeAndroidFcmToken());
    }, timeoutMs);

    try {
      window.AndroidBridge?.refreshNativeFcmToken?.();
    } catch {
      // Ignore bridge error
    }
  });
}

export async function requestAndGetFcmToken(customVapidKey?: string): Promise<{
  ok: boolean;
  permission: NotificationPermission | 'unsupported';
  token: string;
  localOnly?: boolean;
  error?: string;
}> {
  if (typeof window !== 'undefined' && window.AndroidBridge?.requestNotificationPermission) {
    const alreadyGranted = Boolean(window.AndroidBridge.hasNotificationPermission?.());
    const granted = alreadyGranted ? true : await waitForNativeAndroidPermission();
    if (!granted) {
      return {
        ok: false,
        permission: 'denied',
        token: '',
        error:
          'تم رفض إذن الإشعارات في تطبيق الأندرويد. يرجى السماح بالإشعارات لتطبيق مسارك للسياحة من إعدادات الهاتف.',
      };
    }

    const nativeToken = await waitForNativeAndroidFcmToken();
    return {
      ok: true,
      permission: 'granted',
      token: nativeToken,
      ...(nativeToken ? {} : { localOnly: true }),
    };
  }

  const permBefore = getBrowserNotificationPermission();
  if (permBefore === 'unsupported') {
    return {
      ok: false,
      permission: 'unsupported',
      token: '',
      error: 'هذا المتصفح لا يدعم إشعارات الدفع الفورية.',
    };
  }

  let permission: NotificationPermission = permBefore;
  if (permission === 'default') {
    try {
      permission = await window.Notification.requestPermission();
    } catch {
      permission = getBrowserNotificationPermission() as NotificationPermission;
    }
  }

  if (permission !== 'granted') {
    return {
      ok: false,
      permission,
      token: '',
      error:
        permission === 'denied'
          ? 'تم رفض إذن الإشعارات من المتصفح. يمكنك تفعيلها من إعدادات الموقع في المتصفح.'
          : 'لم يتم منح إذن الإشعارات.',
    };
  }

  const swReg = await registerMessagingServiceWorker();

  try {
    const supported = await isSupported();
    if (!supported) {
      return {
        ok: true,
        permission: 'granted',
        token: '',
        localOnly: true,
      };
    }

    const messaging = getMessaging(app);
    const configuredVapidKey = (
      customVapidKey ||
      import.meta.env.VITE_FIREBASE_VAPID_KEY ||
      getSiteConfig().fcmVapidKey ||
      ''
    ).trim();

    const token = await getToken(messaging, {
      ...(configuredVapidKey ? { vapidKey: configuredVapidKey } : {}),
      ...(swReg ? { serviceWorkerRegistration: swReg } : {}),
    });

    if (token) {
      return {
        ok: true,
        permission: 'granted',
        token,
      };
    }

    return {
      ok: true,
      permission: 'granted',
      token: '',
      localOnly: true,
    };
  } catch (err) {
    console.warn('FCM getToken fallback to SW local push:', err);
    return {
      ok: true,
      permission: 'granted',
      token: '',
      localOnly: true,
    };
  }
}

export function buildPushDeepLinkUrl(data: PushDeepLinkPayload): string {
  const params = new URLSearchParams();
  params.set('push_role', data.role);
  params.set('push_action', data.action);
  if (data.phone) params.set('push_phone', data.phone);
  return `/?${params.toString()}`;
}

export function emitPushNavigate(payload: PushDeepLinkPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PushDeepLinkPayload>(PUSH_NAVIGATE_EVENT, { detail: payload }));
}

export async function showBrowserPushNotification(opts: {
  title: string;
  body: string;
  tag?: string;
  data: PushDeepLinkPayload;
}): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate([240, 110, 240]);
    }
  } catch {
    // Ignore vibration restriction
  }

  // Native Android WebView bridge: fire true OS NotificationManager alert with channel ringtone & vibration
  if (window.AndroidBridge?.showNativeNotification) {
    try {
      window.AndroidBridge.showNativeNotification(
        opts.title,
        opts.body,
        opts.data.role,
        opts.data.action,
        opts.data.phone || ''
      );
      return Boolean(window.AndroidBridge.hasNotificationPermission?.() ?? true);
    } catch {
      // Fall through to web Notification fallback if bridge fails
    }
  } else if (window.AndroidBridge?.showNotification) {
    try {
      window.AndroidBridge.showNotification(opts.title, opts.body);
      return true;
    } catch {
      // Fall through
    }
  }

  if (!('Notification' in window) || window.Notification.permission !== 'granted') {
    return false;
  }

  const targetUrl = buildPushDeepLinkUrl(opts.data);
  const notificationOptions: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
  } = {
    body: opts.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: opts.tag || `masarik-${opts.data.action}-${opts.data.phone || 'global'}`,
    vibrate: [240, 110, 240],
    renotify: true,
    requireInteraction: true,
    data: {
      role: opts.data.role,
      action: opts.data.action,
      phone: opts.data.phone || '',
      url: targetUrl,
    },
  };

  try {
    const fcmSwReg = await registerMessagingServiceWorker();
    if (fcmSwReg?.active && typeof fcmSwReg.showNotification === 'function') {
      await fcmSwReg.showNotification(opts.title, notificationOptions);
      return true;
    }

    if ('serviceWorker' in navigator) {
      const mainSw = await navigator.serviceWorker.getRegistration();
      if (mainSw?.active && typeof mainSw.showNotification === 'function') {
        await mainSw.showNotification(opts.title, notificationOptions);
        return true;
      }
      const readySw = await Promise.race<ServiceWorkerRegistration | null>([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 900)),
      ]);
      if (readySw?.active && typeof readySw.showNotification === 'function') {
        await readySw.showNotification(opts.title, notificationOptions);
        return true;
      }
    }

    const notif = new window.Notification(opts.title, notificationOptions);
    notif.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore focus restriction
      }
      emitPushNavigate(opts.data);
      notif.close();
    };
    return true;
  } catch {
    try {
      const notif = new window.Notification(opts.title, notificationOptions);
      notif.onclick = () => {
        try {
          window.focus();
        } catch {
          // Ignore focus restriction
        }
        emitPushNavigate(opts.data);
        notif.close();
      };
      return true;
    } catch {
      return false;
    }
  }
}

export function subscribeForegroundFcmMessages(
  onForegroundChime?: () => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let unsubFcm: (() => void) | null = null;
  let cancelled = false;

  void isSupported()
    .then((supported) => {
      if (!supported || cancelled) return;
      const messaging = getMessaging(app);
      unsubFcm = onMessage(messaging, (payload) => {
        const notif = payload.notification || {};
        const data = (payload.data || {}) as Record<string, string>;
        const role: 'admin' | 'client' = data.role === 'admin' ? 'admin' : 'client';
        const validActions: PushNotificationAction[] = [
          'live_chat',
          'client_folder',
          'chat',
          'documents',
          'orders',
          'account',
        ];
        const action: PushNotificationAction = validActions.includes(
          data.action as PushNotificationAction
        )
          ? (data.action as PushNotificationAction)
          : role === 'admin'
          ? 'live_chat'
          : 'chat';

        const deepLink: PushDeepLinkPayload = {
          role,
          action,
          phone: data.phone || undefined,
        };

        if (onForegroundChime) {
          onForegroundChime();
        }
        void showBrowserPushNotification({
          title: notif.title || data.title || 'مسارك للإنجاز السياحي',
          body: notif.body || data.body || 'لديك رسالة أو تحديث جديد.',
          tag: data.tag,
          data: deepLink,
        });
      });
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    if (unsubFcm) unsubFcm();
  };
}

async function postTokensToCloudflareWorker(opts: {
  tokens: string[];
  targetRole: 'admin' | 'client';
  targetPhone?: string;
  title: string;
  body: string;
  data: PushDeepLinkPayload;
}): Promise<PushDiagnosticLog> {
  const cleanTitle = String(opts.title || 'مسارك للإنجاز السياحي').slice(0, 160);
  const cleanBody = String(opts.body || 'لديك رسالة أو تحديث جديد.').slice(0, 400);
  const nowIso = new Date().toISOString();

  if (opts.tokens.length === 0) {
    return recordPushDiagnosticLog({
      id: `push-${Date.now()}`,
      timestamp: nowIso,
      targetRole: opts.targetRole,
      targetPhone: opts.targetPhone,
      title: cleanTitle,
      tokenCount: 0,
      okCount: 0,
      failCount: 0,
      lastStatus: null,
      statusText: 'NO_TOKENS',
      responseBody: 'لم يتم العثور على أي FCM Token مسجل للمستلم في Firestore.',
      outcome: 'no_tokens',
    });
  }

  const pushData: Record<string, string> = {
    role: opts.data.role,
    action: opts.data.action,
    phone: opts.data.phone || '',
    url: buildPushDeepLinkUrl(opts.data),
    tag: `masarik-${opts.data.action}-${opts.data.phone || 'global'}`,
    title: cleanTitle,
    body: cleanBody,
  };

  let okCount = 0;
  let failCount = 0;
  let lastStatus: number | null = null;
  let statusText = '';
  let lastResponseBody = '';

  const results = await Promise.all(
    opts.tokens.map(async (token) => {
      try {
        const res = await fetch(CLOUDFLARE_PUSH_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            title: cleanTitle,
            body: cleanBody,
            data: pushData,
          }),
        });
        let text = '';
        try {
          text = await res.text();
        } catch {
          text = '';
        }
        return {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText || (res.ok ? 'OK' : 'ERROR'),
          body: text.slice(0, 600) || `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          ok: false,
          status: null as number | null,
          statusText: 'NETWORK_ERROR',
          body: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  for (const r of results) {
    if (r.ok) okCount += 1;
    else failCount += 1;
    lastStatus = r.status;
    statusText = r.statusText;
    lastResponseBody = r.body;
  }

  const outcome: PushDiagnosticLog['outcome'] =
    okCount > 0 && failCount === 0
      ? 'sent'
      : okCount > 0 && failCount > 0
      ? 'partial'
      : 'failed';

  return recordPushDiagnosticLog({
    id: `push-${Date.now()}`,
    timestamp: nowIso,
    targetRole: opts.targetRole,
    targetPhone: opts.targetPhone,
    title: cleanTitle,
    tokenCount: opts.tokens.length,
    okCount,
    failCount,
    lastStatus,
    statusText,
    responseBody: lastResponseBody,
    outcome,
  });
}

export async function dispatchRemotePushNotification(opts: {
  targetRole: 'admin' | 'client';
  targetPhone?: string;
  title: string;
  body: string;
  data: PushDeepLinkPayload;
}): Promise<PushDiagnosticLog | null> {
  if (typeof window === 'undefined') return null;

  try {
    const tokenSet = new Set<string>();
    if (opts.targetRole === 'admin') {
      // 1. Canonical global admin token list in settings/notifications
      try {
        const notifSettingsSnap = await getDoc(doc(db, 'settings', 'notifications'));
        if (notifSettingsSnap.exists()) {
          const settingsData = notifSettingsSnap.data() as { adminFcmTokens?: unknown };
          if (Array.isArray(settingsData.adminFcmTokens)) {
            settingsData.adminFcmTokens.forEach((tk) => {
              const clean = typeof tk === 'string' ? tk.trim() : '';
              if (clean.length >= 10) tokenSet.add(clean);
            });
          }
        }
      } catch {
        // Fallback to admins collection query below
      }

      // 2. Also include active admin/sub-admin document tokens
      try {
        const q = query(
          collection(db, 'admins'),
          where('role', 'in', ['super_admin', 'sub_admin'])
        );
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          const d = docSnap.data() as {
            fcmToken?: string;
            fcmTokens?: string[];
            pushNotificationsEnabled?: boolean;
          };
          if (d.pushNotificationsEnabled === false) return;
          if (d.fcmToken && typeof d.fcmToken === 'string' && d.fcmToken.trim().length >= 10) {
            tokenSet.add(d.fcmToken.trim());
          }
          if (Array.isArray(d.fcmTokens)) {
            d.fcmTokens.forEach((tk) => {
              const clean = typeof tk === 'string' ? tk.trim() : '';
              if (clean.length >= 10) tokenSet.add(clean);
            });
          }
        });
      } catch {
        // Non-blocking fallback
      }
    } else if (opts.targetPhone) {
      const cleanPhone = String(opts.targetPhone).replace(/\D/g, '');
      if (/^[0-9]{8,20}$/.test(cleanPhone)) {
        const snap = await getDoc(doc(db, 'clients', cleanPhone));
        if (snap.exists()) {
          const d = snap.data() as {
            fcmToken?: string;
            fcmTokens?: string[];
            pushNotificationsEnabled?: boolean;
          };
          if (d.pushNotificationsEnabled !== false) {
            if (Array.isArray(d.fcmTokens)) {
              d.fcmTokens.forEach((tk) => {
                const clean = typeof tk === 'string' ? tk.trim() : '';
                if (clean.length >= 10) tokenSet.add(clean);
              });
            }
            if (d.fcmToken && typeof d.fcmToken === 'string' && d.fcmToken.trim().length >= 10) {
              tokenSet.add(d.fcmToken.trim());
            }
          }
        }
      }
    }

    const tokens = Array.from(tokenSet).slice(0, 20);
    return await postTokensToCloudflareWorker({
      tokens,
      targetRole: opts.targetRole,
      targetPhone: opts.targetPhone,
      title: opts.title,
      body: opts.body,
      data: opts.data,
    });
  } catch (err) {
    return recordPushDiagnosticLog({
      id: `push-${Date.now()}`,
      timestamp: new Date().toISOString(),
      targetRole: opts.targetRole,
      targetPhone: opts.targetPhone,
      title: String(opts.title || 'مسارك للإنجاز السياحي').slice(0, 160),
      tokenCount: 0,
      okCount: 0,
      failCount: 1,
      lastStatus: null,
      statusText: 'DISPATCH_ERROR',
      responseBody: err instanceof Error ? err.message : String(err),
      outcome: 'failed',
    });
  }
}

export async function sendTestCloudflareWorkerPush(opts: {
  tokens?: string[];
  title?: string;
  body?: string;
}): Promise<PushDiagnosticLog | null> {
  const customTokens = Array.isArray(opts.tokens)
    ? Array.from(new Set(opts.tokens.map((tk) => String(tk || '').trim()).filter((tk) => tk.length >= 10))).slice(0, 20)
    : [];

  if (customTokens.length > 0) {
    return postTokensToCloudflareWorker({
      tokens: customTokens,
      targetRole: 'admin',
      title: opts.title || 'مسارك للإنجاز السياحي — اختبار الخلفية 🚀',
      body: opts.body || 'تم وصول إشعار Cloudflare Worker → FCM في الخلفية بنجاح ✅',
      data: { role: 'admin', action: 'live_chat' },
    });
  }

  return dispatchRemotePushNotification({
    targetRole: 'admin',
    title: opts.title || 'مسارك للإنجاز السياحي — اختبار الخلفية 🚀',
    body: opts.body || 'تم وصول إشعار Cloudflare Worker → FCM في الخلفية بنجاح ✅',
    data: { role: 'admin', action: 'live_chat' },
  });
}

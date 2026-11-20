import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app } from '../firebase';
import { getSiteConfig } from './siteConfigStore';
import { getAllAdminFcmTokensCloud } from './adminAuthStore';
import { getClientFcmTokensCloud } from './travelerStore';
import { playChatNotificationChime } from './chatStore';

export type PushNotificationAction =
  | 'live_chat'
  | 'client_folder'
  | 'chat'
  | 'documents'
  | 'orders';

export interface PushDeepLinkPayload {
  role: 'admin' | 'client';
  action: PushNotificationAction;
  phone?: string;
}

export const PUSH_NAVIGATE_EVENT = 'masarik-push-navigate';
const FCM_SW_SCRIPT_URL = '/firebase-messaging-sw.js';
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
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

export async function requestAndGetFcmToken(customVapidKey?: string): Promise<{
  ok: boolean;
  permission: NotificationPermission | 'unsupported';
  token: string;
  localOnly?: boolean;
  error?: string;
}> {
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
      getSiteConfig().fcmVapidKey ||
      import.meta.env.VITE_FIREBASE_VAPID_KEY ||
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
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
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
    vibrate: [220, 100, 220],
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
    if (fcmSwReg && typeof fcmSwReg.showNotification === 'function') {
      await fcmSwReg.showNotification(opts.title, notificationOptions);
      return true;
    }

    if ('serviceWorker' in navigator) {
      const mainSw = await navigator.serviceWorker.getRegistration();
      if (mainSw && typeof mainSw.showNotification === 'function') {
        await mainSw.showNotification(opts.title, notificationOptions);
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
    return false;
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

export async function dispatchRemotePushNotification(opts: {
  targetRole: 'admin' | 'client';
  targetPhone?: string;
  title: string;
  body: string;
  data: PushDeepLinkPayload;
}): Promise<void> {
  if (typeof window === 'undefined') return;
  // Static GitHub Pages has no /api server route; skip silently to avoid 404 noise in console
  if (window.location.hostname.endsWith('github.io')) return;

  try {
    let tokens: string[] = [];
    if (opts.targetRole === 'admin') {
      const q = query(
        collection(db, 'admins'),
        where('role', 'in', ['super_admin', 'sub_admin'])
      );
      const snap = await getDocs(q);
      const tokenSet = new Set<string>();
      snap.forEach((docSnap) => {
        const d = docSnap.data() as {
          fcmToken?: string;
          fcmTokens?: string[];
          pushNotificationsEnabled?: boolean;
        };
        if (d.pushNotificationsEnabled === false) return;
        if (d.fcmToken && typeof d.fcmToken === 'string' && d.fcmToken.trim()) {
          tokenSet.add(d.fcmToken.trim());
        }
        if (Array.isArray(d.fcmTokens)) {
          d.fcmTokens.forEach((tk) => {
            if (typeof tk === 'string' && tk.trim()) tokenSet.add(tk.trim());
          });
        }
      });
      tokens = Array.from(tokenSet).slice(0, 15);
    } else if (opts.targetPhone) {
      const cleanPhone = String(opts.targetPhone).replace(/\D/g, '');
      if (/^[0-9]{8,20}$/.test(cleanPhone)) {
        const snap = await getDoc(doc(db, 'clients', cleanPhone));
        if (snap.exists()) {
          const d = snap.data() as {
            fcmToken?: string;
            pushNotificationsEnabled?: boolean;
          };
          if (d.pushNotificationsEnabled !== false && d.fcmToken && typeof d.fcmToken === 'string') {
            tokens = [d.fcmToken.trim()];
          }
        }
      }
    }

    if (tokens.length === 0) return;

    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens,
        title: opts.title,
        body: opts.body,
        data: {
          role: opts.data.role,
          action: opts.data.action,
          phone: opts.data.phone || '',
          url: buildPushDeepLinkUrl(opts.data),
          tag: `masarik-${opts.data.action}-${opts.data.phone || 'global'}`,
        },
      }),
    });
  } catch {
    // Non-blocking remote push dispatch
  }
}

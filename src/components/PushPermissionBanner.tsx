import React, { useEffect, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  getBrowserNotificationPermission,
  requestAndGetFcmToken,
  showBrowserPushNotification,
} from '../utils/fcmPushService';
import { saveClientFcmTokenCloud } from '../utils/travelerStore';
import {
  getAdminFcmStatusCloud,
  saveAdminFcmTokenCloud,
} from '../utils/adminAuthStore';
import { playChatNotificationChime } from '../utils/chatStore';
import { useSiteConfig } from '../utils/siteConfigStore';

interface PushPermissionBannerProps {
  role: 'admin' | 'client';
  phone?: string;
  adminId?: string;
  existingToken?: string;
  pushEnabled?: boolean;
}

const DISMISS_STORAGE_PREFIX = 'masarik_push_banner_dismissed_v1_';

export const PushPermissionBanner: React.FC<PushPermissionBannerProps> = ({
  role,
  phone,
  adminId,
  existingToken,
  pushEnabled,
}) => {
  const { t } = useLanguage();
  const siteConfig = useSiteConfig();

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [justActivated, setJustActivated] = useState(false);
  const [adminTokenPresent, setAdminTokenPresent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const key = `${DISMISS_STORAGE_PREFIX}${role}_${phone || adminId || 'default'}`;
      return window.sessionStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });

  // Load admin FCM status & auto-sync token silently whenever browser permission is already 'granted'
  useEffect(() => {
    let active = true;

    const syncIfAlreadyGranted = async () => {
      const currentPerm = getBrowserNotificationPermission();
      if (!active) return;
      setPermission(currentPerm);

      if (role === 'admin') {
        const status = await getAdminFcmStatusCloud(adminId);
        if (!active) return;
        setAdminTokenPresent(Boolean(status.fcmToken && status.enabled));
      }

      if (currentPerm === 'granted') {
        const needsClientSync = role === 'client' && phone && (!existingToken || !pushEnabled);
        const needsAdminSync = role === 'admin';
        if (needsClientSync || needsAdminSync) {
          const res = await requestAndGetFcmToken(siteConfig.fcmVapidKey);
          if (!active || !res.ok) return;
          if (role === 'client' && phone) {
            if (res.token !== existingToken || !pushEnabled) {
              await saveClientFcmTokenCloud(phone, res.token, true);
            }
          } else if (role === 'admin') {
            await saveAdminFcmTokenCloud(adminId, res.token, true);
            if (active && res.token) {
              setAdminTokenPresent(true);
            }
          }
        }
      }
    };

    void syncIfAlreadyGranted();

    return () => {
      active = false;
    };
  }, [role, phone, adminId, existingToken, pushEnabled, siteConfig.fcmVapidKey]);

  const handleEnablePush = async () => {
    if (isRegistering) return;
    setErrorMsg(null);
    setIsRegistering(true);

    try {
      const res = await requestAndGetFcmToken(siteConfig.fcmVapidKey);
      setPermission(res.permission);

      if (!res.ok) {
        setErrorMsg(
          res.error ||
            t(
              'تعذر تفعيل الإشعارات على هذا المتصفح.',
              'Could not enable notifications on this browser.'
            )
        );
        return;
      }

      if (role === 'client' && phone) {
        await saveClientFcmTokenCloud(phone, res.token, true);
      } else if (role === 'admin') {
        await saveAdminFcmTokenCloud(adminId, res.token, true);
        setAdminTokenPresent(true);
      }

      playChatNotificationChime();
      setJustActivated(true);

      await showBrowserPushNotification({
        title:
          role === 'admin'
            ? t('تم تفعيل إشعارات الإدارة بنجاح', 'Admin Push Notifications Active')
            : t('تم تفعيل إشعارات مسارك بنجاح', 'Masarik Notifications Active'),
        body:
          role === 'admin'
            ? t(
                'ستصلك تنبيهات فورية عند وصول رسائل أو مستندات أو طلبات جديدة.',
                'You will receive instant alerts for new client messages, documents, and orders.'
              )
            : t(
                'ستصلك تنبيهات فورية على هاتفك عند وصول رسالة أو تحديث لطلبك.',
                'You will receive instant phone alerts for new messages and order updates.'
              ),
        tag: `masarik-welcome-${role}`,
        data: {
          role,
          action: role === 'admin' ? 'live_chat' : 'chat',
          phone,
        },
      });
    } catch {
      setErrorMsg(
        t(
          'حدث خطأ أثناء حفظ إعدادات الإشعارات.',
          'Failed to save push notification settings.'
        )
      );
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      const key = `${DISMISS_STORAGE_PREFIX}${role}_${phone || adminId || 'default'}`;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Ignore sessionStorage restriction
    }
  };

  if (permission === 'unsupported') return null;

  const isAlreadyConfigured =
    permission === 'granted' &&
    (role === 'admin' ? adminTokenPresent || justActivated : Boolean(pushEnabled || existingToken || justActivated));

  // If user just clicked Allow, display celebratory confirmation for a crisp look
  if (justActivated) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top duration-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-black text-emerald-950">
              {t(
                'تم تفعيل الإشعارات الفورية على جهازك بنجاح ✓',
                'Instant push notifications enabled on your device ✓'
              )}
            </p>
            <p className="text-[11px] font-semibold text-emerald-800">
              {role === 'admin'
                ? t(
                    'ستصلك تنبيهات الهاتف والصوت فور وصول أي رسالة أو مستند أو طلب جديد.',
                    'You will now receive instant alerts for every incoming message, document, or order.'
                  )
                : t(
                    'سيصلك تنبيه فوري عند وصول رسالة أو تغيير حالة أي مستند أو طلب.',
                    'You will now receive instant alerts for messages and document or order updates.'
                  )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setJustActivated(false);
            handleDismiss();
          }}
          className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100 cursor-pointer shrink-0"
          aria-label={t('إغلاق', 'Close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Once granted & synced on earlier sessions, stay cleanly invisible so top workspace remains tidy
  if (isAlreadyConfigured || dismissed) return null;

  if (permission === 'denied') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-amber-950">
              {t('إشعارات الهاتف محظورة من المتصفح', 'Phone Notifications Are Blocked')}
            </p>
            <p className="text-[11px] font-semibold text-amber-800">
              {t(
                'لتلقي تنبيهات الرسائل والطلبات فورياً، يرجى السماح بالإشعارات من أيقونة القفل بجانب رابط الموقع.',
                'To receive instant alerts for messages and orders, allow Notifications from your browser site settings.'
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 cursor-pointer shrink-0"
          aria-label={t('إغلاق', 'Close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-l from-[#0F2438] via-[#133250] to-[#0F2438] text-white rounded-2xl p-3.5 sm:p-4 border border-[#C6A052]/65 shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#C6A052]/20 border border-[#C6A052]/70 text-[#E5C887] flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5 animate-pulse" />
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#C6A052]/25 text-[#E5C887] text-[10px] font-black border border-[#C6A052]/40">
                <Sparkles className="w-3 h-3" />
                <span>{t('إشعارات فورية FCM', 'Real-Time FCM Alerts')}</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm font-black text-white leading-snug">
              {role === 'admin'
                ? t(
                    'فعّل إشعارات المدير العام ليصلك تنبيه فوري عند وصول رسالة عميل أو مستند أو طلب جديد',
                    'Enable Admin alerts to get notified instantly when a new client message, document, or order arrives'
                  )
                : t(
                    'فعّل الإشعارات ليصلك تنبيه فوري عند وصول رسالة أو تحديث لطلبك',
                    'Enable notifications to receive an instant alert when a new message or order update arrives'
                  )}
            </p>
            {errorMsg && (
              <p className="text-[11px] font-bold text-amber-300 pt-0.5">{errorMsg}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => void handleEnablePush()}
            disabled={isRegistering}
            className="px-4 py-2 rounded-xl bg-[#C6A052] hover:bg-[#b58e40] disabled:opacity-70 text-[#0A1926] text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            {isRegistering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Smartphone className="w-4 h-4" />
            )}
            <span>
              {isRegistering
                ? t('جاري التفعيل...', 'Enabling...')
                : t('تفعيل الإشعارات الآن', 'Enable Notifications')}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition cursor-pointer"
            aria-label={t('لاحقاً', 'Dismiss')}
            title={t('لاحقاً', 'Dismiss')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

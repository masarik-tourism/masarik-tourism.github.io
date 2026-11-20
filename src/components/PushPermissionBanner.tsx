import React, { useEffect, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Volume2,
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
import { isRunningInApp } from '../utils/appEnvironment';

interface PushPermissionBannerProps {
  role: 'admin' | 'client';
  phone?: string;
  adminId?: string;
  existingToken?: string;
  pushEnabled?: boolean;
}

export const PushPermissionBanner: React.FC<PushPermissionBannerProps> = ({
  role,
  phone,
  adminId,
  existingToken,
  pushEnabled,
}) => {
  const { t } = useLanguage();
  const siteConfig = useSiteConfig();
  const inAndroidApp = isRunningInApp();

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [isTestingSoundPush, setIsTestingSoundPush] = useState(false);
  const [adminTokenPresent, setAdminTokenPresent] = useState(false);
  const [localLinkedToken, setLocalLinkedToken] = useState<string>(existingToken || '');
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (existingToken) {
      setLocalLinkedToken(existingToken);
    }
  }, [existingToken]);

  // Auto-sync FCM token silently whenever browser permission is already 'granted'
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
        if (status.fcmToken) setLocalLinkedToken(status.fcmToken);
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
              if (active && res.token) setLocalLinkedToken(res.token);
            }
          } else if (role === 'admin') {
            await saveAdminFcmTokenCloud(adminId, res.token, true);
            if (active && res.token) {
              setAdminTokenPresent(true);
              setLocalLinkedToken(res.token);
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

  const hasSavedToken = Boolean(localLinkedToken || existingToken || adminTokenPresent);
  const isActivated = permission === 'granted' && (hasSavedToken || Boolean(pushEnabled));
  const isDenied = permission === 'denied';

  const handleEnableOrRelinkPush = async () => {
    if (isRegistering) return;
    setStatusFeedback(null);
    setIsRegistering(true);

    try {
      const res = await requestAndGetFcmToken(siteConfig.fcmVapidKey);
      setPermission(res.permission);

      if (!res.ok) {
        if (res.permission === 'unsupported' && inAndroidApp) {
          // Inside Android WebView without Web Notification API, still save active state and guide user cleanly
          if (role === 'client' && phone) {
            await saveClientFcmTokenCloud(phone, res.token || '', true);
          } else if (role === 'admin') {
            await saveAdminFcmTokenCloud(adminId, res.token || '', true);
          }
          playChatNotificationChime(true);
          try {
            navigator.vibrate?.([220, 100, 220]);
          } catch {}
          setStatusFeedback({
            type: 'info',
            text: t(
              'تم تفعيل تنبيهات الصوت والاهتزاز داخل التطبيق. للحصول على إشعارات الخلفية، تأكد من السماح لإشعارات تطبيق مسارك من إعدادات الهاتف.',
              'In-app sound & vibration alerts are active. Allow app notifications in Android Settings for background alerts.'
            ),
          });
          return;
        }

        setStatusFeedback({
          type: 'error',
          text:
            res.error ||
            t(
              'تعذر تفعيل الإشعارات — يرجى السماح بالإشعارات من إعدادات الهاتف أو المتصفح.',
              'Could not enable notifications — allow Notifications in phone/browser settings.'
            ),
        });
        return;
      }

      if (role === 'client' && phone) {
        await saveClientFcmTokenCloud(phone, res.token, true);
      } else if (role === 'admin') {
        await saveAdminFcmTokenCloud(adminId, res.token, true);
        setAdminTokenPresent(Boolean(res.token));
      }
      if (res.token) {
        setLocalLinkedToken(res.token);
      }

      playChatNotificationChime(true);
      await showBrowserPushNotification({
        title:
          role === 'admin'
            ? t('تم تفعيل إشعارات الإدارة بنجاح', 'Admin Push Notifications Active')
            : t('تم تفعيل إشعارات مسارك بنجاح', 'Masarik Notifications Active'),
        body:
          role === 'admin'
            ? t(
                'ستصلك تنبيهات فورية في شريط الهاتف عند وصول رسالة عميل أو مستند أو طلب جديد.',
                'You will receive instant top-bar phone alerts for new messages, documents, and orders.'
              )
            : t(
                'ستصلك تنبيهات فورية في شريط الهاتف عند وصول رسالة أو تحديث لطلبك.',
                'You will receive instant top-bar phone alerts for messages and order updates.'
              ),
        tag: `masarik-welcome-${role}`,
        data: {
          role,
          action: role === 'admin' ? 'live_chat' : 'chat',
          phone,
        },
      });

      setStatusFeedback({
        type: 'success',
        text: res.token
          ? t(
              'تم ربط الجهاز وحفظ رمز الإشعارات (fcmToken) في Firestore بنجاح ✅',
              'Device linked & FCM token saved in Firestore ✅'
            )
          : t(
              'تم تفعيل إشعارات المتصفح والصوت الفورية على جهازك بنجاح ✅',
              'Instant system & sound notifications enabled on your device ✅'
            ),
      });
    } catch {
      setStatusFeedback({
        type: 'error',
        text: t(
          'حدث خطأ أثناء حفظ إعدادات الإشعارات في السحابة.',
          'Failed to save push notification settings.'
        ),
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleTestNotificationAndSound = async () => {
    if (isTestingSoundPush) return;
    setStatusFeedback(null);
    setIsTestingSoundPush(true);

    try {
      // 1. Always trigger unmistakable audible notification ring + phone vibration
      playChatNotificationChime(true);
      try {
        if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
          navigator.vibrate([240, 110, 240]);
        }
      } catch {}

      // 2. Ensure permission & token if browser hasn't been asked yet
      let currentPerm = getBrowserNotificationPermission();
      if (currentPerm === 'default') {
        const res = await requestAndGetFcmToken(siteConfig.fcmVapidKey);
        currentPerm = res.permission;
        setPermission(res.permission);
        if (res.ok) {
          if (role === 'client' && phone) {
            await saveClientFcmTokenCloud(phone, res.token, true);
          } else if (role === 'admin') {
            await saveAdminFcmTokenCloud(adminId, res.token, true);
            setAdminTokenPresent(Boolean(res.token));
          }
          if (res.token) setLocalLinkedToken(res.token);
        }
      }

      // 3. Fire real OS top-bar notification (ServiceWorkerRegistration.showNotification -> Notification API fallback)
      const shown = await showBrowserPushNotification({
        title:
          role === 'admin'
            ? t('اختبار إشعارات المدير العام — مسارك 🔔', 'Masarik Admin Test Alert 🔔')
            : t('اختبار إشعارات مسارك للسياحة 🔔', 'Masarik Test Notification 🔔'),
        body: t(
          'تم اختبار الإشعار في شريط الهاتف العلوي مع الصوت والاهتزاز بنجاح ✅ — اضغط للانتقال للمحادثة.',
          'System bar notification, sound chime & vibration tested successfully ✅ — tap to open chat.'
        ),
        tag: `masarik-test-alert-${role}-${Date.now()}`,
        data: {
          role,
          action: role === 'admin' ? 'live_chat' : 'chat',
          phone,
        },
      });

      if (shown) {
        setStatusFeedback({
          type: 'success',
          text: t(
            'تم تشغيل رنة التنبيه وإرسال الإشعار التجريبي لشريط الهاتف العلوي بنجاح ✅',
            'Notification chime played & top-bar system alert sent ✅'
          ),
        });
      } else if (currentPerm === 'denied') {
        setStatusFeedback({
          type: 'error',
          text: t(
            'تم تشغيل الصوت ✅ لكن إشعارات شريط الهاتف مرفوضة من إعدادات الهاتف/المتصفح — اسمح بالإشعارات لإظهارها في الأعلى.',
            'Sound played ✅ but system notifications are blocked in phone/browser settings.'
          ),
        });
      } else {
        setStatusFeedback({
          type: 'info',
          text: t(
            'تم تشغيل صوت الرنة والاهتزاز ✅ (قد يقيّد هذا المتصفح/الـ WebView إشعارات النظام العلوية، اسمح بالإشعارات من إعدادات الجهاز).',
            'Ringtone & vibration played ✅ (enable OS notification permission in device settings for top-bar popups).'
          ),
        });
      }
    } finally {
      setIsTestingSoundPush(false);
    }
  };

  return (
    <div
      data-no-admin-edit="true"
      className={`rounded-2xl p-3.5 sm:p-4 border shadow-sm space-y-3 ${
        isActivated
          ? 'bg-gradient-to-l from-[#0F2438] via-[#133250] to-[#0F2438] border-emerald-400/60 text-white'
          : isDenied
          ? 'bg-gradient-to-l from-[#1E1418] via-[#2B171D] to-[#0F2438] border-red-400/60 text-white'
          : 'bg-gradient-to-l from-[#0F2438] via-[#133250] to-[#0F2438] border-[#C6A052]/70 text-white'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isActivated
                ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-300'
                : isDenied
                ? 'bg-red-500/20 border-red-400/70 text-red-300'
                : 'bg-[#C6A052]/20 border-[#C6A052]/70 text-[#E5C887]'
            }`}
          >
            {isDenied ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <BellRing className={`w-5 h-5 ${!isActivated ? 'animate-pulse' : ''}`} />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black text-white">
                {t('إشعارات الرسائل والتنبيهات الفورية', 'Instant Message & Order Notifications')}
              </span>

              {isActivated ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/60 text-emerald-200 text-[10.5px] font-black">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>{t('مفعّلة ✅', 'Active ✅')}</span>
                </span>
              ) : isDenied ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-500/25 border border-red-400/60 text-red-200 text-[10.5px] font-black">
                  <ShieldAlert className="w-3 h-3 shrink-0" />
                  <span>{t('مرفوضة من إعدادات الهاتف', 'Blocked in Device Settings')}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/60 text-amber-200 text-[10.5px] font-black">
                  <span>{t('غير مفعّلة', 'Not Enabled')}</span>
                </span>
              )}

              {hasSavedToken && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold text-slate-200">
                  {t('رمز الإشعارات مربوط ✓', 'FCM Token Linked ✓')}
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              {isDenied
                ? t(
                    'إشعارات المتصفح/الهاتف محظورة حالياً من إعدادات الجهاز — فعّل الإذن من إعدادات التطبيق/الموقع ثم اضغط تحديث.',
                    'Notifications are blocked in your device/browser settings — enable permission there, then click refresh.'
                  )
                : role === 'admin'
                ? t(
                    'تنبيهات فورية في شريط الهاتف العلوي مع الصوت والاهتزاز فور وصول رسالة عميل أو طلب أو مستند جديد.',
                    'Instant top-bar phone notifications with ring & vibration for every incoming client chat, order, or document.'
                  )
                : t(
                    'تنبيهات فورية في شريط الهاتف العلوي مع الصوت والاهتزاز فور وصول رسالة أو تحديث لطلبك ومستنداتك.',
                    'Instant top-bar phone alerts with ring & vibration whenever a new message or document/order update arrives.'
                  )}
            </p>
          </div>
        </div>

        {/* Always-Visible Activation / Relink + Sound & Push Test Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleEnableOrRelinkPush()}
            disabled={isRegistering}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-60 ${
              isActivated
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-100'
                : 'bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926]'
            }`}
          >
            {isRegistering ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : isActivated ? (
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Smartphone className="w-4 h-4 shrink-0" />
            )}
            <span>
              {isRegistering
                ? t('جاري الربط...', 'Linking...')
                : t(
                    'تفعيل إشعارات الرسائل والتنبيهات 🔔',
                    'Enable Message & Alert Notifications 🔔'
                  )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleTestNotificationAndSound()}
            disabled={isTestingSoundPush}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
          >
            {isTestingSoundPush ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#E5C887] shrink-0" />
            )}
            <span>{t('اختبار الإشعار والصوت 🔊', 'Test Alert & Sound 🔊')}</span>
          </button>
        </div>
      </div>

      {statusFeedback && (
        <div
          className={`px-3 py-2 rounded-xl text-[11px] font-bold border ${
            statusFeedback.type === 'success'
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
              : statusFeedback.type === 'error'
              ? 'bg-red-500/20 border-red-400/50 text-red-100'
              : 'bg-sky-500/20 border-sky-400/50 text-sky-100'
          }`}
        >
          {statusFeedback.text}
        </div>
      )}
    </div>
  );
};

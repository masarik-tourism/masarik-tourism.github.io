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

    // Unlock audio & play clear test ring synchronously in user click gesture
    playChatNotificationChime(true);
    try {
      navigator.vibrate?.([220, 100, 220]);
    } catch {}

    try {
      // Request Notification.requestPermission() directly inside user gesture
      const res = await requestAndGetFcmToken(siteConfig.fcmVapidKey);
      setPermission(res.permission);

      if (!res.ok) {
        if (res.permission === 'unsupported' && inAndroidApp) {
          if (role === 'client' && phone) {
            await saveClientFcmTokenCloud(phone, res.token || '', true);
          } else if (role === 'admin') {
            await saveAdminFcmTokenCloud(adminId, res.token || '', true);
          }
          setStatusFeedback({
            type: 'info',
            text: t(
              'تم تشغيل نغمة التنبيه داخل التطبيق ✅ — لمنح إشعارات الشريط العلوي، اسمح بإشعارات تطبيق مسارك من إعدادات الهاتف.',
              'Sound alerts active ✅ — allow notifications in Android Settings for top-bar system alerts.'
            ),
          });
          return;
        }

        setStatusFeedback({
          type: 'error',
          text:
            res.permission === 'denied'
              ? t(
                  'حالة الإذن: مرفوضة من إعدادات المتصفح أو الهاتف ❌ — يرجى فتح إعدادات الموقع/التطبيق والسماح بالإشعارات ثم المحاولة مجدداً.',
                  'Permission Status: Blocked in browser/phone settings ❌ — please enable Notifications in settings and retry.'
                )
              : res.error ||
                t(
                  'حالة الإذن: مرفوضة من إعدادات المتصفح أو الهاتف — يرجى السماح بالإشعارات من إعدادات الجهاز.',
                  'Permission Status: Denied/blocked in browser or phone settings.'
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

      const shown = await showBrowserPushNotification({
        title: 'مسارك للإنجاز السياحي',
        body:
          role === 'admin'
            ? t(
                'تم تفعيل إشعارات الإدارة ✅ ستصلك تنبيهات فورية في شريط الهاتف عند وصول رسالة أو طلب أو مستند.',
                'Admin push notifications enabled ✅ Instant top-bar phone alerts are now active.'
              )
            : t(
                'تم تفعيل الإشعارات بنجاح ✅ ستصلك تنبيهات فورية عند وصول رسالة أو تحديث لطلبك.',
                'Notifications enabled ✅ Instant top-bar alerts are now active for your account.'
              ),
        tag: `masarik-welcome-${role}-${Date.now()}`,
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
              `حالة الإذن: مفعّلة ✅ — تم حفظ رمز الإشعارات (fcmToken) في Firestore${shown ? ' وإطلاق إشعار وصوت الاختبار بنجاح' : ''}.`,
              'Permission Status: Active ✅ — FCM token registered in Firestore & alert tested.'
            )
          : t(
              `حالة الإذن: مفعّلة ✅ — الإشعارات الفورية ونغمة التنبيه تعمل بنجاح على جهازك.`,
              'Permission Status: Active ✅ — System notifications & sound ring enabled on your device.'
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
      // 1. Trigger unmistakable audible notification chime + vibration immediately on user tap
      playChatNotificationChime(true);
      try {
        if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
          navigator.vibrate([240, 110, 240]);
        }
      } catch {}

      // 2. Ask browser permission & save fcmToken if permission is still 'default'
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

      // 3. Fire real OS top-bar notification (ServiceWorkerRegistration.showNotification -> Notification fallback)
      const shown = await showBrowserPushNotification({
        title: t('مسارك للإنجاز السياحي — اختبار الإشعار 🔔', 'Masarik Tourism — Test Alert 🔔'),
        body: t(
          'تم اختبار الإشعار في شريط الهاتف العلوي مع الصوت والاهتزاز بنجاح ✅ — اضغط للانتقال للمحادثة.',
          'Top-bar notification, ringtone & vibration tested successfully ✅ — tap to open chat.'
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
            'حالة الإذن: مفعّلة ✅ — تم تشغيل نغمة الرنة وإطلاق إشعار الشريط العلوي بنجاح.',
            'Permission Status: Active ✅ — Ringtone played & top-bar system alert sent.'
          ),
        });
      } else if (currentPerm === 'denied') {
        setStatusFeedback({
          type: 'error',
          text: t(
            'تم تشغيل الصوت ✅ — لكن حالة الإذن مرفوضة من إعدادات المتصفح أو الهاتف، فعّل الإشعارات لإظهار التنبيه العلوي.',
            'Sound played ✅ — Permission Status: Blocked in browser/phone settings.'
          ),
        });
      } else {
        setStatusFeedback({
          type: 'info',
          text: t(
            'تم تشغيل نغمة الرنة والاهتزاز ✅ (اسمح بالإشعارات من إعدادات الجهاز لإظهار تنبيه الشريط العلوي).',
            'Ringtone & vibration played ✅ (enable device notification permission for top-bar alerts).'
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
                  <span>{t('مرفوضة من إعدادات المتصفح أو الهاتف', 'Blocked in Browser/Phone Settings')}</span>
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
                    'تفعيل إشعارات الهاتف + اختبار الصوت 🔔',
                    'Enable Phone Alerts + Test Sound 🔔'
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

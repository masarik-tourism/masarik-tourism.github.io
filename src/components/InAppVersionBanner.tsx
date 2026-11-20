import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, Smartphone, X } from 'lucide-react';
import {
  CURRENT_APP_VERSION,
  FALLBACK_PAGES_APK_URL,
  LatestApkInfo,
  OPEN_APK_UPDATER_EVENT,
  fetchLatestGitHubRelease,
  getInstalledAndroidAppVersion,
  isVersionNewer,
  launchDirectApkInstall,
} from '../hooks/useLatestApkUrl';
import { isRunningInApp } from '../utils/appEnvironment';
import { useLanguage } from '../contexts/LanguageContext';

type UpdaterStage = 'idle' | 'checking' | 'up_to_date' | 'started';

export const InAppVersionBanner: React.FC = () => {
  const { dir, t } = useLanguage();
  const [modalOpen, setModalOpen] = useState(false);
  const [stage, setStage] = useState<UpdaterStage>('idle');
  const [releaseInfo, setReleaseInfo] = useState<Omit<LatestApkInfo, 'isLoading'>>({
    downloadUrl: FALLBACK_PAGES_APK_URL,
    version: CURRENT_APP_VERSION,
    sizeBytes: null,
    sizeLabel: null,
  });
  const [installedVersion] = useState<string>(() => getInstalledAndroidAppVersion());
  const autoCheckedRef = useRef(false);
  const checkInFlightRef = useRef(false);
  const launchedThisSessionRef = useRef<string | null>(null);

  const startSingleApkDownload = useCallback((info: Omit<LatestApkInfo, 'isLoading'>) => {
    const targetUrl = info.downloadUrl || FALLBACK_PAGES_APK_URL;
    setStage('started');
    setModalOpen(true);

    // Strictly launch the native DownloadManager transfer ONCE per update attempt
    if (launchedThisSessionRef.current !== targetUrl) {
      launchedThisSessionRef.current = targetUrl;
      launchDirectApkInstall(targetUrl);
    }
  }, []);

  const runUpdateFlow = useCallback(
    async (mode: 'check' | 'download', isAutomatic = false) => {
      if (checkInFlightRef.current) {
        if (!isAutomatic) setModalOpen(true);
        return;
      }
      checkInFlightRef.current = true;
      launchedThisSessionRef.current = null;

      if (!isAutomatic) {
        setModalOpen(true);
        setStage('checking');
      }

      try {
        const fresh = await fetchLatestGitHubRelease();
        setReleaseInfo(fresh);

        const inApp = isRunningInApp();
        const hasNewerApk = isVersionNewer(fresh.version, installedVersion);

        if (isAutomatic) {
          if (inApp && hasNewerApk) {
            startSingleApkDownload(fresh);
          }
          return;
        }

        if (inApp && mode === 'check' && !hasNewerApk) {
          setStage('up_to_date');
          return;
        }

        startSingleApkDownload(fresh);
      } finally {
        checkInFlightRef.current = false;
      }
    },
    [installedVersion, startSingleApkDownload]
  );

  // Automatic silent check upon opening inside the installed Android app
  useEffect(() => {
    if (autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    if (isRunningInApp()) {
      void runUpdateFlow('check', true);
    }
  }, [runUpdateFlow]);

  // Listen for manual Footer / Home button triggers
  useEffect(() => {
    const handleOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ mode?: 'check' | 'download' }>).detail;
      const mode = detail?.mode === 'download' ? 'download' : 'check';
      void runUpdateFlow(mode, false);
    };
    window.addEventListener(OPEN_APK_UPDATER_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_APK_UPDATER_EVENT, handleOpen);
  }, [runUpdateFlow]);

  const handleClose = () => {
    setModalOpen(false);
    setStage('idle');
    launchedThisSessionRef.current = null;
  };

  if (!modalOpen) {
    return null;
  }

  return (
    <div
      data-no-admin-edit="true"
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleClose}
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-label={t('تحديث وتثبيت تطبيق مسارك', 'Masarik App Updater')}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0F2438] text-white border-2 border-[#C6A052] rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#C6A052]/20 border border-[#C6A052] text-[#E5C887] flex items-center justify-center shrink-0">
              {stage === 'up_to_date' || stage === 'started' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              ) : (
                <Smartphone className="w-6 h-6 text-[#E5C887]" />
              )}
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#E5C887] block">
                {t('تطبيق مسارك للإنجاز السياحي (Android)', 'Masarik Tourism Official App')}
              </span>
              <h3 className="text-sm sm:text-base font-black text-white">
                {stage === 'checking'
                  ? t('جاري التحقق من التحديثات...', 'Checking for Updates...')
                  : stage === 'up_to_date'
                  ? t('أنت على أحدث إصدار', 'You Are Up to Date')
                  : t('تحديث وتثبيت التطبيق', 'App Download & Install')}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Checking state */}
        {stage === 'checking' && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3 text-xs text-slate-200">
            <Loader2 className="w-5 h-5 text-[#E5C887] animate-spin shrink-0" />
            <span>
              {t(
                'جاري الاتصال بخادم الإصدارات الرسمية للتحقق من توفر نسخة أحدث...',
                'Connecting to official release server to check latest build...'
              )}
            </span>
          </div>
        )}

        {/* Up-to-date message inside app */}
        {stage === 'up_to_date' && (
          <div className="space-y-3">
            <div className="bg-emerald-500/15 border border-emerald-400/40 rounded-xl p-4 flex items-start gap-2.5 text-xs sm:text-sm font-bold text-emerald-100 leading-relaxed">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span className="tabular-nums">
                {t(
                  `أنت تستخدم أحدث إصدار من تطبيق مسارك (${CURRENT_APP_VERSION}) ولا توجد تحديثات جديدة حالياً.`,
                  `You are running the latest version of Masarik App (${CURRENT_APP_VERSION}) — no new updates available right now.`
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black cursor-pointer transition"
            >
              {t('إغلاق', 'Close')}
            </button>
          </div>
        )}

        {/* Direct Download Started Instruction Modal (No Progress Bar) */}
        {stage === 'started' && (
          <div className="space-y-3.5">
            <div className="bg-white/5 border border-white/15 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#E5C887] tabular-nums">
                <span>
                  {t(`الإصدار: ${releaseInfo.version}`, `Release: ${releaseInfo.version}`)}
                </span>
                {releaseInfo.sizeLabel && <span>{releaseInfo.sizeLabel}</span>}
              </div>

              <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed font-bold">
                {t(
                  'بدأ تنزيل التحديث الجديد عبر مدير التنزيلات في هاتفك ✅. يرجى سحب شريط الإشعارات من أعلى الشاشة والضغط على ملف (Masarik-Tourism.apk) فور اكتماله لإتمام التثبيت.',
                  'The new update has started downloading in your phone download manager ✅. Please swipe down your notification bar and tap (Masarik-Tourism.apk) once finished to complete installation.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-emerald-300 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                {t(
                  'ملف رسمي موقّع وآمن 100% من مسارك للإنجاز السياحي.',
                  '100% official signed Masarik Tourism APK package.'
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black cursor-pointer transition"
            >
              {t('إغلاق', 'Close')}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => launchDirectApkInstall(releaseInfo.downloadUrl)}
                className="text-[11px] font-semibold text-slate-400 hover:text-[#E5C887] underline underline-offset-4 cursor-pointer transition"
              >
                {t('إعادة محاولة التنزيل', 'Retry download')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

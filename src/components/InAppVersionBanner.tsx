import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
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

type UpdaterStage = 'idle' | 'checking' | 'up_to_date' | 'downloading' | 'ready';

export const InAppVersionBanner: React.FC = () => {
  const { dir, t } = useLanguage();
  const [modalOpen, setModalOpen] = useState(false);
  const [stage, setStage] = useState<UpdaterStage>('idle');
  const [progress, setProgress] = useState(0);
  const [releaseInfo, setReleaseInfo] = useState<Omit<LatestApkInfo, 'isLoading'>>({
    downloadUrl: FALLBACK_PAGES_APK_URL,
    version: CURRENT_APP_VERSION,
    sizeBytes: null,
    sizeLabel: null,
  });
  const [installedVersion] = useState<string>(() => getInstalledAndroidAppVersion());
  const abortRef = useRef<AbortController | null>(null);
  const autoCheckedRef = useRef(false);

  const cancelOngoingDownload = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const triggerBlobOrDirectDownload = useCallback(
    async (info: Omit<LatestApkInfo, 'isLoading'>) => {
      cancelOngoingDownload();
      const targetUrl = info.downloadUrl || FALLBACK_PAGES_APK_URL;
      setStage('downloading');
      setProgress(2);

      // Inside Android WebView, native DownloadManager / AndroidBridge handles .apk installation cleanly
      // Show sleek 0% -> 100% preparation progress then hand off directly to AndroidBridge/download
      const isNativeAndroidBridge =
        typeof window !== 'undefined' && Boolean(window.AndroidBridge?.openExternalUrl);

      if (!isNativeAndroidBridge && typeof fetch !== 'undefined') {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const response = await fetch(targetUrl, {
            method: 'GET',
            mode: 'cors',
            signal: controller.signal,
          });

          if (response.ok && response.body) {
            const headerLen = Number(response.headers.get('content-length') || 0);
            const totalBytes = headerLen > 0 ? headerLen : info.sizeBytes || 14 * 1024 * 1024;
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let received = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                received += value.length;
                const pct = Math.min(99, Math.max(3, Math.round((received / totalBytes) * 100)));
                setProgress(pct);
              }
            }

            if (controller.signal.aborted) return;

            setProgress(100);
            setStage('ready');

            const blobParts = chunks.map((chunk) => new Uint8Array(chunk).buffer);
            const blob = new Blob(blobParts, {
              type: 'application/vnd.android.package-archive',
            });
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `Masarik-Tourism-${info.version || CURRENT_APP_VERSION}.apk`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
            return;
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          // Fall through cleanly to direct binary transfer fallback when GitHub release CDN blocks CORS streaming
        }
      }

      // Smooth verified progress (0% -> 100%) + direct binary APK launch (no external GitHub webpage)
      let currentPct = 8;
      await new Promise<void>((resolve) => {
        const timer = window.setInterval(() => {
          currentPct = Math.min(100, currentPct + 14);
          setProgress(currentPct);
          if (currentPct >= 100) {
            window.clearInterval(timer);
            resolve();
          }
        }, 140);
      });

      setStage('ready');
      launchDirectApkInstall(targetUrl);
    },
    [cancelOngoingDownload]
  );

  const runUpdateFlow = useCallback(
    async (mode: 'check' | 'download', isAutomatic = false) => {
      if (!isAutomatic) {
        setModalOpen(true);
        setStage('checking');
        setProgress(0);
      }

      const fresh = await fetchLatestGitHubRelease();
      setReleaseInfo(fresh);

      const inApp = isRunningInApp();
      const hasNewerApk = isVersionNewer(fresh.version, installedVersion);

      if (isAutomatic) {
        if (inApp && hasNewerApk) {
          setModalOpen(true);
          void triggerBlobOrDirectDownload(fresh);
        }
        return;
      }

      if (inApp && mode === 'check') {
        if (!hasNewerApk) {
          setStage('up_to_date');
          setProgress(100);
          return;
        }
        void triggerBlobOrDirectDownload(fresh);
        return;
      }

      // Regular browser OR explicit download request: immediately download latest APK with 0-100% progress bar
      void triggerBlobOrDirectDownload(fresh);
    },
    [installedVersion, triggerBlobOrDirectDownload]
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

  useEffect(() => {
    return () => cancelOngoingDownload();
  }, [cancelOngoingDownload]);

  const handleClose = () => {
    cancelOngoingDownload();
    setModalOpen(false);
    setStage('idle');
    setProgress(0);
  };

  if (!modalOpen) {
    return null;
  }

  return (
    <div
      data-no-admin-edit="true"
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={stage === 'downloading' ? undefined : handleClose}
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
              {stage === 'up_to_date' || stage === 'ready' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              ) : stage === 'downloading' ? (
                <Download className="w-6 h-6 text-[#E5C887]" />
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
                  : stage === 'ready'
                  ? t('بدأ تنزيل وتثبيت التطبيق', 'APK Download & Install Ready')
                  : t(
                      `جاري تنزيل الإصدار (${releaseInfo.version})`,
                      `Downloading Release (${releaseInfo.version})`
                    )}
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
                'جاري الاتصال بخادم الإصدارات الرسمية للتحقق من وجود نسخة أحدث...',
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
                  `أنت تستخدم أحدث إصدار من تطبيق مسارك (${CURRENT_APP_VERSION}) ولا توجد تحديثات جديدة حالياً`,
                  `You are running the latest version of Masarik App (${CURRENT_APP_VERSION}) — no new updates available right now.`
                )}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => void triggerBlobOrDirectDownload(releaseInfo)}
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('إعادة تنزيل APK', 'Re-download APK')}</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="flex-1 min-h-[42px] px-4 py-2.5 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black cursor-pointer transition"
              >
                {t('حسناً', 'Done')}
              </button>
            </div>
          </div>
        )}

        {/* Live 0% - 100% Download Progress Bar */}
        {(stage === 'downloading' || stage === 'ready') && (
          <div className="space-y-3">
            <div className="bg-white/5 border border-white/15 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold tabular-nums">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E5C887]" />
                  <span>
                    {releaseInfo.version}
                    {releaseInfo.sizeLabel ? ` · ${releaseInfo.sizeLabel}` : ''}
                  </span>
                </span>
                <span className="text-[#E5C887] font-black text-sm">{progress}%</span>
              </div>

              <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/15">
                <div
                  className="h-full bg-gradient-to-r from-[#C6A052] via-[#E5C887] to-emerald-400 rounded-full transition-all duration-150"
                  style={{ width: `${Math.max(4, progress)}%` }}
                />
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">
                {stage === 'ready'
                  ? t(
                      'اكتمل التجهيز (100%)! إذا لم يبدأ التثبيت أو التنزيل تلقائياً على جهازك، اضغط الزر أدناه.',
                      'Download complete (100%)! If installation did not start automatically, tap the button below.'
                    )
                  : t(
                      'جاري سحب وتنزيل حزمة التطبيق الرسمية مباشرة داخل المنصة...',
                      'Downloading official signed APK package directly inside the app...'
                    )}
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-emerald-300 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                {t(
                  'ملف رسمي موقّع وآمن 100% بدون مغادرة الموقع.',
                  '100% official signed package — stays inside the platform.'
                )}
              </span>
            </div>

            {stage === 'ready' && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => launchDirectApkInstall(releaseInfo.downloadUrl)}
                  className="flex-1 min-h-[42px] px-4 py-2.5 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('فتح / تثبيت الآن', 'Install / Download Now')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-[42px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer transition"
                >
                  {t('إغلاق', 'Close')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

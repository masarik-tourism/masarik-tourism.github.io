import React, { useEffect, useState } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import { handleApkDownload, useLatestApkInfo } from '../hooks/useLatestApkUrl';
import { isRunningInApp } from '../utils/appEnvironment';
import { useLanguage } from '../contexts/LanguageContext';

function getInstalledAndroidAppVersion(): string | null {
  if (typeof navigator === 'undefined') return null;
  const match = navigator.userAgent.match(/MasarikApp\/([0-9]+(?:\.[0-9]+)*)/i);
  return match?.[1] || null;
}

function isVersionNewer(remoteTag: string, localVersion: string): boolean {
  const cleanRemote = remoteTag.trim().replace(/^v/i, '');
  const cleanLocal = localVersion.trim().replace(/^v/i, '');
  const rParts = cleanRemote.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const lParts = cleanLocal.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(rParts.length, lParts.length);
  for (let i = 0; i < len; i += 1) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

export const InAppVersionBanner: React.FC = () => {
  const { dir, t } = useLanguage();
  const apkInfo = useLatestApkInfo();
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isRunningInApp()) {
      setInstalledVersion(getInstalledAndroidAppVersion());
    }
  }, []);

  if (dismissed || !installedVersion || apkInfo.isLoading) {
    return null;
  }

  if (!isVersionNewer(apkInfo.version, installedVersion)) {
    return null;
  }

  return (
    <div
      className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-50 bg-[#0F2438] text-white border border-[#C6A052] rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom duration-200"
      role="status"
      dir={dir}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs font-black text-[#E5C887]">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>
            {t(
              `يتوفر إصدار أحدث من تطبيق مسارك (${apkInfo.version})`,
              `Newer Masarik App Version Available (${apkInfo.version})`
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-slate-300 hover:text-white p-0.5 cursor-pointer"
          aria-label={t('إغلاق التنبيه', 'Dismiss Alert')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[11px] text-slate-300 leading-relaxed mb-3 tabular-nums">
        {t(
          `النسخة المثبتة على هاتفك: v${installedVersion}. يمكنك تحميل التحديث الرسمي الموقّع الآن.`,
          `Installed version: v${installedVersion}. Download the official signed update now.`
        )}
      </p>
      <a
        href={apkInfo.downloadUrl}
        onClick={(e) => handleApkDownload(apkInfo.downloadUrl, e)}
        className="w-full min-h-[40px] bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>
          {t(`تحميل التحديث الجديد (${apkInfo.version})`, `Download Update (${apkInfo.version})`)}
        </span>
      </a>
    </div>
  );
};

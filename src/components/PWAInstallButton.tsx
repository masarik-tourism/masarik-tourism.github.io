import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, Monitor, X, Share, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useLatestApkInfo, handleApkDownload, FAST_CDN_APK_URL } from '../hooks/useLatestApkUrl';
import { TravelRepository } from '../data/travelData';
import { useLanguage } from '../contexts/LanguageContext';
import { isRunningInApp } from '../utils/appEnvironment';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'banner' | 'navbar' | 'compact' | 'desktop_navbar' | 'desktop_drawer';
  onActionDone?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'navbar',
  onActionDone,
}) => {
  const { dir, t } = useLanguage();
  const { isInstallable, isInstalled, isIOS, isDesktop, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showWindowsGuide, setShowWindowsGuide] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  if (isInstalled || isRunningInApp()) {
    return null;
  }

  const isDesktopVariant = variant === 'desktop_navbar' || variant === 'desktop_drawer';
  if (isDesktopVariant && !isDesktop) {
    return null;
  }

  const handlePWAInstall = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        onActionDone?.();
        return;
      }
    }
    if (isIOS) {
      setShowIOSGuide(true);
    } else if (isDesktop) {
      setShowWindowsGuide(true);
    } else {
      setShowDownloadModal(true);
    }
  };

  const handleDesktopInstall = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        onActionDone?.();
        return;
      }
    }
    setShowWindowsGuide(true);
  };

  const apkInfo = useLatestApkInfo();

  const modalsContent = (
    <>
      {/* Windows / Desktop PWA Guide Modal */}
      {showWindowsGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowWindowsGuide(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-[#C6A052] text-start space-y-4"
            dir={dir}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('تثبيت تطبيق مسارك على الويندوز', 'Install Masarik App on Windows')}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5 text-[#0F2438]">
                <div className="w-9 h-9 rounded-xl bg-[#0F2438] text-[#E5C887] border border-[#C6A052]/60 flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">
                    {t('تثبيت مسارك على سطح مكتب الويندوز', 'Install Masarik on Windows Desktop')}
                  </h3>
                  <p className="text-[11px] text-[#678093] font-bold">
                    {t('تشغيل كتطبيق مستقل بدون شريط متصفح', 'Standalone Desktop App Mode')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWindowsGuide(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition"
                aria-label={t('إغلاق', 'Close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#FAF8F2] border border-[#E2DAC8] rounded-2xl p-4 text-xs space-y-3 text-[#324D61]">
              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#0F2438] text-[#E5C887] font-black flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <p className="pt-0.5 leading-relaxed">
                  {t('انظر إلى يمين شريط العنوان أعلى متصفح Chrome أو Edge واضغط على أيقونة', 'Look at the top address bar in Chrome or Edge and click the')}{' '}
                  <strong>{t('التثبيت (💻 أو ⊕)', 'Install icon (💻 or ⊕)')}</strong>.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#0F2438] text-[#E5C887] font-black flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <p className="pt-0.5 leading-relaxed">
                  {t('أو افتح قائمة المتصفح (⋮ في Chrome أو ⋯ في Edge) ←', 'Or open browser menu (⋮ in Chrome or ⋯ in Edge) ←')}{' '}
                  <strong>{t('التطبيقات (Apps) ← تثبيت هذا الموقع كتطبيق', 'Apps ← Install this site as an app')}</strong>.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#0F2438] text-[#E5C887] font-black flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
                <p className="pt-0.5 leading-relaxed">
                  {t('سيتم إنشاء اختصار رسمي على سطح المكتب وقائمة ابدأ باسم', 'An official shortcut will appear on your Desktop & Start Menu as')}{' '}
                  <strong>{t('مسارك للإنجاز السياحي', 'Masarik Tourism')}</strong>.
                </p>
              </div>
            </div>

            {isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await install();
                  if (ok) {
                    setShowWindowsGuide(false);
                    onActionDone?.();
                  }
                }}
                className="w-full bg-gradient-to-r from-[#C6A052] to-[#E5C887] text-[#0F2438] py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-sm hover:brightness-105 transition cursor-pointer"
              >
                <Monitor className="w-4 h-4" />
                <span>{t('تشغيل التثبيت التلقائي الآن', 'Trigger Automatic Install Now')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowWindowsGuide(false);
                onActionDone?.();
              }}
              className="w-full bg-[#0F2438] hover:bg-[#17344F] text-white py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              {t('فهمت، إغلاق', 'Got it, Close')}
            </button>
          </div>
        </div>
      )}

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border-2 border-[#C6A052] text-start space-y-4"
            dir={dir}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-[#17344F]">
                <Smartphone className="w-5 h-5 text-[#C6A052]" />
                <h3 className="text-base font-black">
                  {t('تثبيت التطبيق على iPhone / iPad', 'Install on iPhone / iPad')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#FAF8F2] border border-[#E2DAC8] rounded-2xl p-4 text-xs space-y-3 text-[#324D61]">
              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#17344F] text-[#E5C887] font-black flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <p className="pt-0.5">
                  {t('اضغط على زر', 'Tap the')} <strong>{t('المشاركة (Share)', 'Share')}</strong>{' '}
                  <Share className="w-3.5 h-3.5 inline mx-1 text-[#2A7688]" />{' '}
                  {t('في شريط متصفح سفاري بالأسفل.', 'button in the Safari toolbar.')}
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#17344F] text-[#E5C887] font-black flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <p className="pt-0.5">
                  {t('مرر للأسفل واضغط على', 'Scroll down and tap')}{' '}
                  <strong>{t('إضافة إلى الشاشة الرئيسية (Add to Home Screen)', 'Add to Home Screen')}</strong>.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#17344F] text-[#E5C887] font-black flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
                <p className="pt-0.5">
                  {t('اضغط', 'Tap')} <strong>{t('إضافة (Add)', 'Add')}</strong>{' '}
                  {t('وسينزل التطبيق على شاشتك فوراً بأيقونة مسارك.', 'to add Masarik Tourism to your home screen.')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full bg-[#17344F] hover:bg-[#0F2437] text-white py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              {t('فهمت، شكراً', 'Got it')}
            </button>
          </div>
        </div>
      )}

      {/* Comprehensive Install & Download Modal */}
      {showDownloadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowDownloadModal(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-[#C6A052] text-start space-y-4"
            dir={dir}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-[#17344F]">
                <Smartphone className="w-5 h-5 text-[#C6A052]" />
                <h3 className="text-base font-black">
                  {t('خيارات تثبيت تطبيق مسارك', 'Install Masarik Tourism App')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#324D61] leading-relaxed">
              {t(
                'اختر الطريقة المفضلة لتشغيل تطبيق مسارك للإنجاز السياحي على جهازك:',
                'Choose how you prefer to install Masarik Tourism on your device:'
              )}
            </p>

            <div className="space-y-3 text-xs">
              <div className="bg-[#FAF8F2] border-2 border-[#C6A052]/50 hover:border-[#C6A052] rounded-2xl p-4 space-y-2 transition">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-[#17344F] flex items-center gap-1.5 text-xs md:text-sm">
                    <Smartphone className="w-4 h-4 text-[#C6A052]" />
                    <span>{t('الخيار 1: التثبيت الفوري على الشاشة (PWA)', 'Option 1: Instant Web App (PWA)')}</span>
                  </h4>
                  <span className="bg-[#2A7688] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {t('الأسرع والأخف', 'Fastest')}
                  </span>
                </div>
                <p className="text-[11px] text-[#678093] leading-relaxed">
                  {t(
                    'يُضاف التطبيق مباشرة كأيقونة على شاشتك الرئيسية أو سطح المكتب فوراً مع تحديثات تلقائية مستمرة.',
                    'Instantly adds an app icon to your home screen or desktop with automatic updates.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadModal(false);
                    await handlePWAInstall();
                  }}
                  className="w-full bg-[#17344F] hover:bg-[#0F2437] text-white py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer mt-1"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#E5C887]" />
                  <span>{t('تثبيت فوري كتطبيق', 'Install App Now')}</span>
                </button>
              </div>

              <div className="bg-[#FBF7EE] border border-[#E5C887] rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-[#17344F] flex items-center gap-1.5 text-xs md:text-sm">
                    <Download className="w-4 h-4 text-[#C6A052]" />
                    <span>{t('الخيار 2: تحميل ملف APK لأجهزة أندرويد', 'Option 2: Android APK Download')}</span>
                  </h4>
                  <span className="bg-[#C6A052] text-[#0F2437] text-[10px] font-black px-2 py-0.5 rounded-full">
                    {t('أحدث إصدار رسمي', 'Official Release')}
                  </span>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <a
                    href={apkInfo.downloadUrl || FAST_CDN_APK_URL}
                    onClick={(e) => handleApkDownload(apkInfo.downloadUrl, e)}
                    className="w-full bg-[#C6A052] hover:bg-[#d4b063] text-[#0F2438] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 text-center cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t(`تحميل ملف APK المباشر (${apkInfo.version})`, `Download APK (${apkInfo.version})`)}</span>
                  </a>

                  <a
                    href={TravelRepository.APK_RELEASES_URL}
                    className="w-full bg-white hover:bg-gray-50 text-[#17344F] border border-[#E2DAC8] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 text-center cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#2A7688]" />
                    <span>{t('عرض صفحة الإصدارات الرسمية (GitHub Releases)', 'View Official Releases (GitHub)')}</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowDownloadModal(false)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-[#324D61] py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {t('إغلاق', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {variant === 'desktop_navbar' && (
        <button
          type="button"
          onClick={() => void handleDesktopInstall()}
          data-testid="desktop-windows-install-btn"
          className={`bg-gradient-to-r from-[#0F2438] to-[#17344F] hover:brightness-110 text-[#E5C887] border border-[#C6A052]/80 font-black text-[11px] sm:text-xs px-2.5 sm:px-3 h-8 sm:h-9 rounded-full inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${className}`}
          title={t('تثبيت تطبيق مسارك على سطح مكتب الويندوز', 'Install Masarik App on Windows Desktop')}
        >
          <span>{t('💻 تثبيت على الويندوز', '💻 Install on Windows')}</span>
        </button>
      )}

      {variant === 'desktop_drawer' && (
        <button
          type="button"
          onClick={() => void handleDesktopInstall()}
          data-testid="desktop-drawer-windows-install-btn"
          className={`w-full text-start px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black text-[#E5C887] bg-[#0F2438] hover:bg-[#17344F] border border-[#C6A052]/70 transition flex items-center justify-between cursor-pointer ${className}`}
        >
          <span className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#C6A052] shrink-0" />
            <span>{t('💻 تثبيت على الويندوز', '💻 Install on Windows')}</span>
          </span>
          <span className="text-[10px] font-bold bg-[#C6A052]/20 text-[#E5C887] px-2 py-0.5 rounded-full">
            {t('تطبيق سطح مكتب', 'Desktop App')}
          </span>
        </button>
      )}

      {variant === 'navbar' && (
        <button
          type="button"
          onClick={() => setShowDownloadModal(true)}
          className={`bg-gradient-to-r from-[#C6A052] to-[#E5C887] text-[#0F2437] font-black text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer ${className}`}
          title={t('تثبيت تطبيق مسارك على الهاتف', 'Install Masarik App')}
        >
          <Smartphone className="w-3.5 h-3.5 text-[#0F2437]" />
          <span>{t('تثبيت التطبيق', 'Install App')}</span>
        </button>
      )}

      {variant === 'banner' && (
        <div
          className={`bg-gradient-to-r from-[#17344F] via-[#1C4163] to-[#17344F] border-2 border-[#C6A052] rounded-2xl p-4 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 ${className}`}
        >
          <div className="flex items-center gap-3.5 text-start">
            <div className="w-12 h-12 rounded-2xl bg-[#C6A052]/20 border border-[#C6A052]/40 flex items-center justify-center shrink-0 text-[#E5C887]">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-black text-white flex items-center gap-2">
                <span>{t('تثبيت تطبيق مسارك على هاتفك', 'Install Masarik App on Your Phone')}</span>
                <span className="bg-[#C6A052] text-[#0F2437] text-[10px] font-black px-2 py-0.5 rounded-full">
                  {t('مجاناً وتحديث فوري', 'Free & Instant')}
                </span>
              </h3>
              <p className="text-xs text-[#E2DAC8] mt-0.5">
                {t(
                  'تثبيت فوري على شاشة الهاتف أو الكمبيوتر، أو تحميل ملف الـ APK المباشر لأجهزة أندرويد.',
                  'Install directly on your phone/desktop or download the official Android APK.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={() => void handlePWAInstall()}
              className="flex-1 md:flex-none bg-[#C6A052] hover:bg-[#d4b063] text-[#0F2437] font-black text-xs md:text-sm px-4 py-2.5 rounded-xl shadow flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>{t('تثبيت فوري على الشاشة', 'Add to Home Screen')}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDownloadModal(true)}
              className="flex-1 md:flex-none bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold text-xs md:text-sm px-4 py-2.5 rounded-xl shadow flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#E5C887]" />
              <span>{t('تحميل ملف APK', 'Download APK')}</span>
            </button>
          </div>
        </div>
      )}

      {variant === 'compact' && (
        <button
          type="button"
          onClick={() => setShowDownloadModal(true)}
          className={`text-xs font-bold text-[#C6A052] hover:text-[#E5C887] flex items-center gap-1.5 transition cursor-pointer ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>{t('تثبيت التطبيق', 'Install App')}</span>
        </button>
      )}

      {typeof document !== 'undefined' ? createPortal(modalsContent, document.body) : modalsContent}
    </>
  );
};


import React, { useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  Smartphone,
  X,
} from 'lucide-react';
import { PendingDeviceRequest } from '../types/travel';
import { useLanguage } from '../contexts/LanguageContext';

interface GlobalDeviceApprovalModalProps {
  request: PendingDeviceRequest | null;
  accountLabel?: string;
  isBusy: boolean;
  errorText?: string | null;
  onRespond: (
    request: PendingDeviceRequest,
    decision: 'approved_trusted' | 'approved_temporary' | 'rejected',
    temporaryDurationHours?: 1 | 24
  ) => void;
  onDismiss: (requestId: string) => void;
}

export const GlobalDeviceApprovalModal: React.FC<GlobalDeviceApprovalModalProps> = ({
  request,
  accountLabel,
  isBusy,
  errorText,
  onRespond,
  onDismiss,
}) => {
  const { lang, dir, t } = useLanguage();
  const [tempDurationHours, setTempDurationHours] = useState<1 | 24>(1);

  if (!request) return null;

  const requestedTimeStr = new Date(request.createdAt).toLocaleString(
    lang === 'en' ? 'en-US' : 'ar-EG',
    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  );

  return (
    <div
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-device-approval-title"
      data-no-admin-edit="true"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#0A1926]/65 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-md bg-white rounded-3xl border-2 border-[#C6A052] shadow-2xl overflow-hidden">
        {/* Top Security Header */}
        <div className="bg-gradient-to-l from-[#0F2438] to-[#163B65] px-5 py-4 flex items-start justify-between gap-3 text-white">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#C6A052]/20 border border-[#C6A052]/50 text-[#E5C887] flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-[#E5C887] text-[10.5px] font-black mb-1">
                {t('طلب موافقة فورية (مباشر)', 'Instant Security Approval')}
              </span>
              <h2
                id="global-device-approval-title"
                className="text-sm sm:text-base font-black leading-snug text-white"
              >
                {t(
                  'تنبيه أمني: محاولة دخول من جهاز جديد 🔐',
                  'Security Alert: New Device Sign-In Attempt 🔐'
                )}
              </h2>
            </div>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDismiss(request.requestId)}
            aria-label={t('إغلاق النافذة مؤقتاً', 'Dismiss temporarily')}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            {t(
              'يحاول جهاز جديد الدخول إلى حسابك الآن. راجع اسم الجهاز واختر إجراء الأمان المناسب فوراً:',
              'A new device is attempting to access your account right now. Review the device details and respond immediately:'
            )}
          </p>

          {/* Device Card */}
          <div className="rounded-2xl bg-[#FAF6EA] border border-[#C6A052]/50 p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold text-slate-500 block">
                {t('اسم الجهاز الجديد', 'New Device Name')}
              </span>
              <p className="text-sm font-black text-[#0F2438] truncate" dir="ltr">
                {request.deviceName}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {accountLabel ? `${accountLabel} · ` : ''}
                {t('وقت الطلب:', 'Requested at:')} {requestedTimeStr}
              </p>
            </div>
          </div>

          {/* Temporary Duration Choice */}
          <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
            <span className="font-bold text-slate-700">
              {t('مدة الموافقة المؤقتة:', 'Temporary duration:')}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setTempDurationHours(1)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                  tempDurationHours === 1
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {t('ساعة واحدة', '1 Hour')}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setTempDurationHours(24)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                  tempDurationHours === 24
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {t('24 ساعة', '24 Hours')}
              </button>
            </div>
          </div>

          {errorText && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-900">
              {errorText}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRespond(request, 'approved_trusted')}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
            >
              {isBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{t('موافقة كجهاز موثوق دائم ✅', 'Approve as Permanent Trusted ✅')}</span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onRespond(request, 'approved_temporary', tempDurationHours)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Clock className="w-4 h-4" />
                <span>{t('موافقة مؤقتة ⏳', 'Temporary Approval ⏳')}</span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => onRespond(request, 'rejected')}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Ban className="w-4 h-4" />
                <span>{t('رفض ❌', 'Reject ❌')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

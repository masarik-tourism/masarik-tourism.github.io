import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  MessageSquareText,
  Send,
  X,
} from 'lucide-react';
import type { TravelerProfile } from '../types/travel';
import { useLanguage } from '../contexts/LanguageContext';
import {
  adminInstantActivateClientCloud,
  buildActivationMagicLink,
  buildAdminForwardActivationMessage,
  formatPhoneForDisplay,
  getTravelerDisplayNames,
  isOtpActiveAndUnexpired,
  normalizePhone,
} from '../utils/travelerStore';
import { buildSmsSendUrl, buildWhatsAppSendUrl, openWhatsApp } from '../utils/communication';
import { isClientAccountVerified } from '../utils/whatsappHelpers';

interface QuickOtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  travelers: TravelerProfile[];
  pendingOtpClients: TravelerProfile[];
  onOpenFullOtpTab: () => void;
}

export const QuickOtpModal: React.FC<QuickOtpModalProps> = ({
  isOpen,
  onClose,
  travelers,
  pendingOtpClients,
  onOpenFullOtpTab,
}) => {
  const { lang, dir, t } = useLanguage();
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [activatingPhone, setActivatingPhone] = useState<string | null>(null);
  const [showAllClients, setShowAllClients] = useState(false);

  if (!isOpen) return null;

  const displayList = showAllClients ? travelers : pendingOtpClients;
  const pendingCount = pendingOtpClients.length;

  const handleCopy = async (client: TravelerProfile) => {
    const displayName = getTravelerDisplayNames(client).fullDisplayName;
    const msg = buildAdminForwardActivationMessage(displayName, client.phone, client.otp, lang);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedPhone(client.phone);
      window.setTimeout(() => setCopiedPhone((prev) => (prev === client.phone ? null : prev)), 2200);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleSendWhatsApp = (client: TravelerProfile) => {
    const displayName = getTravelerDisplayNames(client).fullDisplayName;
    const msg = buildAdminForwardActivationMessage(displayName, client.phone, client.otp, lang);
    const phoneDigits = client.phoneNormalized || normalizePhone(client.phone);
    openWhatsApp(buildWhatsAppSendUrl(phoneDigits, msg));
  };

  const handleInstantActivate = async (client: TravelerProfile) => {
    if (activatingPhone) return;
    setActivatingPhone(client.phone);
    try {
      await adminInstantActivateClientCloud(client.phone);
    } finally {
      setActivatingPhone(null);
    }
  };

  return (
    <div
      data-no-admin-edit="true"
      className="fixed inset-0 z-50 bg-[#0A1926]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      dir={dir}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl max-h-[88vh] rounded-3xl shadow-2xl border-2 border-[#C6A052]/80 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('قائمة أكواد التفعيل السريعة (OTP)', 'Quick Activation Codes (OTP)')}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 border-b border-[#C6A052]/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                pendingCount > 0
                  ? 'bg-red-600 text-white border-red-300 animate-pulse'
                  : 'bg-[#C6A052]/20 text-[#E5C887] border-[#C6A052]'
              }`}
            >
              <KeyRound className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-white truncate">
                  {t('أكواد التفعيل السريعة (OTP)', 'Quick Activation Codes (OTP)')}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-black tabular-nums ${
                    pendingCount > 0
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/50'
                  }`}
                >
                  {t(`${pendingCount} بانتظار التفعيل`, `${pendingCount} pending`)}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate">
                {t(
                  'مزامنة لحظية فورية — انسخ أو أرسل عبر واتساب / SMS أو فعّل بنقرة واحدة',
                  'Real-time Firestore sync — copy, send via WhatsApp / SMS, or activate in 1 click'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0 transition"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-bar Controls */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAllClients((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-[#0F2438] text-xs font-bold cursor-pointer transition"
          >
            {showAllClients
              ? t(`عرض المنتظرين فقط (${pendingCount})`, `Pending Only (${pendingCount})`)
              : t(`عرض كل العملاء (${travelers.length})`, `Show All Clients (${travelers.length})`)}
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFullOtpTab();
            }}
            className="px-3 py-1.5 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('فتح قسم الـ OTP الكامل', 'Open Full OTP Section')}</span>
          </button>
        </div>

        {/* Queue Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
          {displayList.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-xs sm:text-sm font-black text-emerald-950">
                {t(
                  'لا توجد حسابات بانتظار التفعيل حالياً — جميع العملاء موثقون ✓',
                  'No pending accounts awaiting activation right now ✓'
                )}
              </p>
            </div>
          ) : (
            displayList.map((client) => {
              const displayName = getTravelerDisplayNames(client).fullDisplayName;
              const isVerified = isClientAccountVerified(client);
              const otpValid = isOtpActiveAndUnexpired(client);
              const phoneDigits = client.phoneNormalized || normalizePhone(client.phone);
              const activationMessage = buildAdminForwardActivationMessage(
                displayName,
                client.phone,
                client.otp,
                lang
              );
              const smsUrl = buildSmsSendUrl(phoneDigits, activationMessage);

              return (
                <div
                  key={client.phone}
                  className={`rounded-2xl border p-3.5 sm:p-4 space-y-2.5 ${
                    isVerified
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-amber-50/70 border-amber-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-black text-[#0F2438] block truncate">
                        {displayName}
                      </span>
                      <span className="text-xs text-slate-600 tabular-nums" dir="ltr">
                        {formatPhoneForDisplay(client.phone)} · +{phoneDigits}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10.5px] font-black border shrink-0 ${
                        isVerified
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                          : otpValid
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : 'bg-red-100 text-red-900 border-red-300'
                      }`}
                    >
                      {isVerified
                        ? t('موثق ✓', 'Verified ✓')
                        : otpValid
                        ? t('غير مفعل · OTP نشط', 'Unverified · Active OTP')
                        : t('غير مفعل · OTP منتهي', 'Unverified · Expired OTP')}
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-600">
                      {t('كود التفعيل:', 'OTP Code:')}
                    </span>
                    <span className="font-black text-[#0284C7] text-base tracking-widest tabular-nums">
                      {client.otp}
                    </span>
                  </div>

                  <div
                    className="text-[10.5px] text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-1.5 truncate"
                    dir="ltr"
                  >
                    {buildActivationMagicLink(client.phone, client.otp, displayName)}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(client)}
                      className="min-h-[38px] px-3 py-1.5 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      {copiedPhone === client.phone ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{t('تم النسخ!', 'Copied!')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#E5C887] shrink-0" />
                          <span>{t('نسخ رسالة التفعيل 📋', 'Copy Activation Message 📋')}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(client)}
                      className="min-h-[38px] px-3 py-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('إرسال الكود عبر واتساب', 'Send OTP WhatsApp')}</span>
                    </button>

                    <a
                      href={smsUrl}
                      className="sm:col-span-2 min-h-[38px] px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs"
                    >
                      <MessageSquareText className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {t('إرسال الكود عبر رسالة نصية (SMS) 📱', 'Send OTP via SMS 📱')}
                      </span>
                    </a>
                  </div>

                  {!isVerified && (
                    <button
                      type="button"
                      disabled={activatingPhone === client.phone}
                      onClick={() => void handleInstantActivate(client)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {activatingPhone === client.phone
                          ? t('جاري التفعيل...', 'Activating...')
                          : t('تفعيل الحساب فوراً (بدون OTP)', 'Activate Account Instantly (No OTP)')}
                      </span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

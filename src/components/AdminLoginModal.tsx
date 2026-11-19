import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAdmin } from '../contexts/AdminContext';

export const AdminLoginModal: React.FC = () => {
  const { lang, dir, t } = useLanguage();
  const { loginModalOpen, closeAdminLoginModal, loginWithPin } = useAdmin();
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    if (loginModalOpen) {
      setPinInput('');
      setPinError('');
    }
  }, [loginModalOpen]);

  if (!loginModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    const res = loginWithPin(pinInput, lang);
    if (!res.ok) {
      setPinError(res.error || t('الرمز السري غير صحيح.', 'Incorrect Admin PIN.'));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={closeAdminLoginModal}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 shadow-2xl overflow-hidden text-start"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        <div className="bg-[#0A1926] text-white px-5 py-4 flex items-center justify-between border-b-2 border-[#C6A052]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#E5C887]" />
            <h3 className="text-sm sm:text-base font-black text-white">
              {t('دخول مساحة الإدارة', 'Admin Workspace Sign In')}
            </h3>
          </div>
          <button
            type="button"
            onClick={closeAdminLoginModal}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>

          <div className="text-center">
            <h4 className="text-base font-black text-[#0F2438]">
              {t('تسجيل دخول المدير العام / المساعد', 'Manager & Sub-Admin Access')}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              {t(
                'أدخل الرمز السري المخصص لفتح وضع الإدارة والتعديل المباشر',
                'Enter your assigned PIN to unlock the full Admin Workspace'
              )}
            </p>
          </div>

          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            dir="ltr"
            value={pinInput}
            onChange={(e) => {
              const arabic = '٠١٢٣٤٥٦٧٨٩';
              const normalized = e.target.value
                .replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)))
                .replace(/\D/g, '');
              setPinInput(normalized);
            }}
            placeholder={t('الرمز السري (PIN - أرقام فقط)', 'Admin PIN (0-9)')}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-slate-300 text-center text-base font-bold tracking-widest text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C6A052] [-webkit-text-security:disc]"
          />

          {pinError && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800 text-center">
              {pinError}
            </div>
          )}

          <button
            type="submit"
            className="w-full min-h-[44px] py-2.5 px-4 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer"
          >
            {t('دخول إلى وضع الإدارة', 'Enter Admin Session')}
          </button>
        </form>
      </div>
    </div>
  );
};

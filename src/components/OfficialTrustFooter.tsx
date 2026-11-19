import React from 'react';
import { ShieldCheck, CheckCircle2, Globe2, Activity } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export const OfficialTrustFooter: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section
      aria-label={t('الاعتماد الرسمي والهوية القانونية', 'Official Registration & Licensing')}
      className="bg-gradient-to-br from-[#0F2438] via-[#132E47] to-[#0A1926] text-white rounded-2xl border border-[#C6A052]/55 shadow-sm px-4 py-3.5 sm:px-6 sm:py-4"
    >
      <div className="flex items-center gap-3 pb-2.5 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-[#C6A052]/15 border border-[#C6A052]/40 text-[#E5C887] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <h2
          data-admin-editable="trust-footer-company-name"
          className="text-xs sm:text-sm md:text-base font-black text-white leading-snug"
        >
          {t(
            'الاعتماد الرسمي والهوية القانونية - شركة مسارك للإنجاز السياحي (ذ.م.م)',
            'Official Registration & Licensing — Masarik Lil-Injaz Al-Siyahi LLC'
          )}
        </h2>
      </div>

      {/* Clean Typographic Trust Indicators */}
      <div className="pt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-x-3.5 gap-y-1.5 text-xs font-semibold text-slate-200">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{t('مرخصة رسمياً', 'Officially Licensed')}</span>
        </span>
        <span className="text-[#C6A052]/70 font-black" aria-hidden="true">•</span>
        <span className="inline-flex items-center gap-1.5">
          <Globe2 className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
          <span>{t('إنجاز إلكتروني 100%', '100% Online Processing')}</span>
        </span>
        <span className="text-[#C6A052]/70 font-black" aria-hidden="true">•</span>
        <span className="inline-flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#E5C887] shrink-0" />
          <span>{t('متابعة لحظية للطلبات', 'Real-Time Order Tracking')}</span>
        </span>
      </div>
    </section>
  );
};

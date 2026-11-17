import React from 'react';
import { ShieldCheck, FileBadge2, CheckCircle2, Globe2, Activity } from 'lucide-react';
import { TravelRepository } from '../data/travelData';
import { useLanguage } from '../contexts/LanguageContext';

export const OfficialTrustFooter: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section
      aria-label={t('الاعتماد الرسمي والثقة', 'Official Licensing & Trust')}
      className="bg-gradient-to-br from-[#0F2438] via-[#132E47] to-[#0A1926] text-white rounded-2xl border border-[#C6A052]/55 shadow-sm px-5 py-6 sm:px-7 sm:py-7"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#C6A052]/15 border border-[#C6A052]/40 text-[#E5C887] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold text-[#E5C887] tracking-wide block">
              {t('الاعتماد الرسمي والهوية القانونية', 'Official Registration & Licensing')}
            </span>
            <h2
              data-admin-editable="trust-footer-company-name"
              className="text-base sm:text-lg font-black text-white leading-snug"
            >
              {t(
                'شركة مسارك للإنجاز السياحي (ذ.م.م)',
                'Masarik Lil-Injaz Al-Siyahi LLC'
              )}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5 bg-white/[0.06] border border-[#C6A052]/45 rounded-xl px-4 py-2.5 self-start md:self-auto shrink-0">
          <FileBadge2 className="w-4 h-4 text-[#E5C887] shrink-0" />
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold tabular-nums">
            <span className="text-slate-300">
              {t('رقم السجل التجاري:', 'Commercial Record No:')}
            </span>
            <span
              data-admin-editable="trust-footer-cr-number"
              className="text-[#E5C887] font-black text-sm sm:text-base"
            >
              {TravelRepository.COMMERCIAL_RECORD}
            </span>
          </div>
        </div>
      </div>

      {/* Clean Typographic Trust Indicators */}
      <div className="pt-4 flex flex-wrap items-center justify-center md:justify-between gap-y-2.5 gap-x-4 text-xs sm:text-sm font-semibold text-slate-200">
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{t('مرخصة رسمياً', 'Officially Licensed')}</span>
          </span>
          <span className="text-[#C6A052]/70 font-black" aria-hidden="true">•</span>
          <span className="inline-flex items-center gap-1.5">
            <Globe2 className="w-4 h-4 text-[#38BDF8] shrink-0" />
            <span>{t('إنجاز إلكتروني 100%', '100% Online Processing')}</span>
          </span>
          <span className="text-[#C6A052]/70 font-black" aria-hidden="true">•</span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#E5C887] shrink-0" />
            <span>{t('متابعة لحظية للطلبات', 'Real-Time Order Tracking')}</span>
          </span>
        </div>

        <span className="text-[11px] font-medium text-slate-400 tabular-nums">
          {t(
            `الرقم الموحد: ${TravelRepository.UNIFIED_NUMBER}`,
            `Unified ID: ${TravelRepository.UNIFIED_NUMBER}`
          )}
        </span>
      </div>
    </section>
  );
};

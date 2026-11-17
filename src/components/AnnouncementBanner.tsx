import React from 'react';
import { Megaphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSiteConfig } from '../utils/siteConfigStore';
import { useLanguage } from '../contexts/LanguageContext';

export const AnnouncementBanner: React.FC = () => {
  const config = useSiteConfig();
  const { lang } = useLanguage();

  if (!config.announcementEnabled) return null;

  const text =
    lang === 'en'
      ? config.announcementTextEn.trim() || config.announcementTextAr.trim()
      : config.announcementTextAr.trim() || config.announcementTextEn.trim();

  if (!text) return null;

  const styleClasses =
    config.announcementStyle === 'red'
      ? 'bg-red-700 text-white border-b border-red-900/40'
      : config.announcementStyle === 'green'
      ? 'bg-emerald-700 text-white border-b border-emerald-900/40'
      : 'bg-[#C6A052] text-[#0A1926] border-b border-[#0A1926]/15';

  const Icon =
    config.announcementStyle === 'red'
      ? AlertTriangle
      : config.announcementStyle === 'green'
      ? CheckCircle2
      : Megaphone;

  return (
    <div
      role="status"
      className={`px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-black flex items-center justify-center gap-2 text-center ${styleClasses}`}
    >
      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
      <span className="leading-snug">{text}</span>
    </div>
  );
};

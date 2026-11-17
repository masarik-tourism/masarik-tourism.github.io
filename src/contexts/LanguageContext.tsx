import React, { createContext, useContext, useEffect, useState } from 'react';

export type AppLanguage = 'ar' | 'en';

const LANG_STORAGE_KEY = 'masarik_lang';

interface LanguageContextValue {
  lang: AppLanguage;
  isAr: boolean;
  isEn: boolean;
  dir: 'rtl' | 'ltr';
  setLang: (nextLang: AppLanguage) => void;
  toggleLang: () => void;
  t: <T>(ar: T, en: T) => T;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function getInitialLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'ar';
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'ar';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => getInitialLanguage());

  useEffect(() => {
    const nextDir = lang === 'en' ? 'ltr' : 'rtl';
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = nextDir;
      document.title =
        lang === 'en'
          ? 'Masarik Tourism LLC | Visa Services, Flights, Hotels & Document Attestation'
          : 'مسارك للإنجاز السياحي | مسارك للسياحة - خدمات التأشيرات وحجز الطيران والفنادق';
    }
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }, [lang]);

  const setLang = (nextLang: AppLanguage) => {
    setLangState(nextLang);
  };

  const toggleLang = () => {
    setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  const value: LanguageContextValue = {
    lang,
    isAr: lang === 'ar',
    isEn: lang === 'en',
    dir: lang === 'en' ? 'ltr' : 'rtl',
    setLang,
    toggleLang,
    t: (ar, en) => (lang === 'en' ? en : ar),
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

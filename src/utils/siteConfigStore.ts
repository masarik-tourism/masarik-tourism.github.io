import { useEffect, useState } from 'react';
import { TravelRepository } from '../data/travelData';

export type AnnouncementStyle = 'gold' | 'red' | 'green';

export interface SiteConfig {
  announcementEnabled: boolean;
  announcementTextAr: string;
  announcementTextEn: string;
  announcementStyle: AnnouncementStyle;
  phoneNumber: string;
  workingHoursAr: string;
  workingHoursEn: string;
  heroHighlightAr: string;
  heroHighlightEn: string;
}

const SITE_CONFIG_STORAGE_KEY = 'masarik_site_config_v1';
export const SITE_CONFIG_UPDATED_EVENT = 'masarik-site-config-updated';

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  announcementEnabled: false,
  announcementTextAr: 'متاح الآن حجز مواعيد تساهيل VIP وعادي',
  announcementTextEn: 'VFS Tasheer Standard & VIP Appointments Available Now',
  announcementStyle: 'gold',
  phoneNumber: TravelRepository.PHONE_NUMBER,
  workingHoursAr: TravelRepository.WORKING_HOURS,
  workingHoursEn: '24/7 Customer Support All Week Long',
  heroHighlightAr: 'منصتك لجميع إجراءات التأشيرات والسفر للسعودية',
  heroHighlightEn: 'Your Trusted Portal for Saudi Visas, Tasheer & Global Travel',
};

function emitSiteConfigUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SITE_CONFIG_UPDATED_EVENT));
  }
}

export function getSiteConfig(): SiteConfig {
  if (typeof window === 'undefined') return DEFAULT_SITE_CONFIG;
  try {
    const raw = window.localStorage.getItem(SITE_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_SITE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SiteConfig>;
    return {
      ...DEFAULT_SITE_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_SITE_CONFIG;
  }
}

export function saveSiteConfig(partial: Partial<SiteConfig>): SiteConfig {
  const next: SiteConfig = {
    ...getSiteConfig(),
    ...partial,
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(next));
      emitSiteConfigUpdate();
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}

export function resetSiteConfig(): SiteConfig {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(SITE_CONFIG_STORAGE_KEY);
      emitSiteConfigUpdate();
    } catch {
      // Ignore errors
    }
  }
  return DEFAULT_SITE_CONFIG;
}

export function formatPhoneToWhatsAppDigits(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '201128440008';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('01') && digits.length === 11) return `2${digits}`;
  return digits;
}

export function formatPhoneToDialHref(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return TravelRepository.PHONE_DIAL;
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('01') && digits.length === 11) return `+2${digits}`;
  if (digits.startsWith('20') && digits.length === 12) return `+${digits}`;
  return trimmed;
}

export function useSiteConfig(): SiteConfig {
  const [config, setConfig] = useState<SiteConfig>(() => getSiteConfig());

  useEffect(() => {
    const handleUpdate = () => setConfig(getSiteConfig());
    window.addEventListener(SITE_CONFIG_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(SITE_CONFIG_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return config;
}

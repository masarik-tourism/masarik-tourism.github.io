import { useEffect, useState } from 'react';
import { doc, getDoc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { TravelRepository } from '../data/travelData';
import { OperationType, db, handleFirestoreError } from '../firebase';
import { DriveEndpointScope, DriveStorageEndpoint } from '../types/travel';

export type AnnouncementStyle = 'gold' | 'red' | 'green';
export type RetentionDaysOption = 30 | 60 | 90;

export const DEFAULT_PRIMARY_DRIVE_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxk3bwCMH7e6NzZKKZhbMCLBbVZT8BKrR_y5IoE_LyTqL0Gqw4-kc80mzH0J_EbqnSENw/exec';

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
  primaryDriveWebAppUrl: string;
  additionalDriveWebApps: DriveStorageEndpoint[];
  fcmVapidKey?: string;
  retentionDays: RetentionDaysOption;
  geminiApiKey?: string;
}

const SITE_CONFIG_STORAGE_KEY = 'masarik_site_config_v1';
export const SITE_CONFIG_UPDATED_EVENT = 'masarik-site-config-updated';
const SITE_GENERAL_DOC_PATH = 'site_config/general';

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
  primaryDriveWebAppUrl: DEFAULT_PRIMARY_DRIVE_WEBAPP_URL,
  additionalDriveWebApps: [],
  fcmVapidKey: '',
  retentionDays: 60,
  geminiApiKey: '',
};

export function sanitizeRetentionDays(rawVal: unknown): RetentionDaysOption {
  const num = Number(rawVal);
  if (num === 30) return 30;
  if (num === 90) return 90;
  return 60;
}

function sanitizeHttpsUrl(rawUrl: unknown, fallback = ''): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return fallback;
  if (!trimmed.startsWith('https://')) return fallback;
  return trimmed.slice(0, 500);
}

function sanitizeAdditionalDriveEndpoints(rawList: unknown): DriveStorageEndpoint[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((item) => item && typeof item === 'object')
    .slice(0, 10)
    .map((item, idx) => {
      const obj = item as Partial<DriveStorageEndpoint>;
      const cleanUrl = sanitizeHttpsUrl(obj.url, '');
      const scope: DriveEndpointScope =
        obj.scope === 'client_docs' || obj.scope === 'admin_deliverables' ? obj.scope : 'all';
      return {
        id:
          String(obj.id || `drv-${Date.now()}-${idx}`)
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .slice(0, 64) || `drv-${idx}`,
        label: String(obj.label || `حساب تخزين ${idx + 2}`).trim().slice(0, 120) || `Drive ${idx + 2}`,
        url: cleanUrl,
        scope,
        enabled: obj.enabled !== false,
      };
    })
    .filter((entry) => Boolean(entry.url));
}

function emitSiteConfigUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SITE_CONFIG_UPDATED_EVENT));
  }
}

function sanitizeSiteConfigPayload(cfg: SiteConfig) {
  const style: AnnouncementStyle =
    cfg.announcementStyle === 'red' || cfg.announcementStyle === 'green'
      ? cfg.announcementStyle
      : 'gold';

  return {
    announcementEnabled: Boolean(cfg.announcementEnabled),
    announcementTextAr: String(cfg.announcementTextAr || '').slice(0, 500),
    announcementTextEn: String(cfg.announcementTextEn || '').slice(0, 500),
    announcementStyle: style,
    phoneNumber: String(cfg.phoneNumber || TravelRepository.PHONE_NUMBER).slice(0, 40),
    workingHoursAr: String(cfg.workingHoursAr || TravelRepository.WORKING_HOURS).slice(0, 200),
    workingHoursEn: String(cfg.workingHoursEn || '').slice(0, 200),
    heroHighlightAr: String(cfg.heroHighlightAr || '').slice(0, 500),
    heroHighlightEn: String(cfg.heroHighlightEn || '').slice(0, 500),
    primaryDriveWebAppUrl: sanitizeHttpsUrl(
      cfg.primaryDriveWebAppUrl,
      DEFAULT_PRIMARY_DRIVE_WEBAPP_URL
    ),
    additionalDriveWebApps: sanitizeAdditionalDriveEndpoints(cfg.additionalDriveWebApps),
    ...(cfg.fcmVapidKey ? { fcmVapidKey: String(cfg.fcmVapidKey).trim().slice(0, 256) } : {}),
    retentionDays: sanitizeRetentionDays(cfg.retentionDays),
    geminiApiKey: String(cfg.geminiApiKey || '').trim().slice(0, 256),
    updatedAt: new Date().toISOString(),
  };
}

function writeSiteConfigLocalOnly(next: SiteConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(next));
    emitSiteConfigUpdate();
  } catch {
    // Ignore quota errors
  }
}

async function syncSiteConfigToCloud(cfg: SiteConfig): Promise<void> {
  const payload = sanitizeSiteConfigPayload(cfg);
  try {
    await setDoc(doc(db, 'site_config', 'general'), payload);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, SITE_GENERAL_DOC_PATH);
    }
    console.warn('Site config cloud sync deferred (offline/cache active):', msg);
  }
}

export function subscribeSiteConfigCloud(): () => void {
  const ref = doc(db, 'site_config', 'general');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Partial<SiteConfig>;
      const merged: SiteConfig = {
        announcementEnabled:
          typeof data.announcementEnabled === 'boolean'
            ? data.announcementEnabled
            : DEFAULT_SITE_CONFIG.announcementEnabled,
        announcementTextAr: data.announcementTextAr ?? DEFAULT_SITE_CONFIG.announcementTextAr,
        announcementTextEn: data.announcementTextEn ?? DEFAULT_SITE_CONFIG.announcementTextEn,
        announcementStyle:
          data.announcementStyle === 'red' || data.announcementStyle === 'green'
            ? data.announcementStyle
            : 'gold',
        phoneNumber: data.phoneNumber ?? DEFAULT_SITE_CONFIG.phoneNumber,
        workingHoursAr: data.workingHoursAr ?? DEFAULT_SITE_CONFIG.workingHoursAr,
        workingHoursEn: data.workingHoursEn ?? DEFAULT_SITE_CONFIG.workingHoursEn,
        heroHighlightAr: data.heroHighlightAr ?? DEFAULT_SITE_CONFIG.heroHighlightAr,
        heroHighlightEn: data.heroHighlightEn ?? DEFAULT_SITE_CONFIG.heroHighlightEn,
        primaryDriveWebAppUrl: sanitizeHttpsUrl(
          data.primaryDriveWebAppUrl,
          DEFAULT_PRIMARY_DRIVE_WEBAPP_URL
        ),
        additionalDriveWebApps: sanitizeAdditionalDriveEndpoints(data.additionalDriveWebApps),
        fcmVapidKey: data.fcmVapidKey ? String(data.fcmVapidKey).trim().slice(0, 256) : '',
        retentionDays: sanitizeRetentionDays(data.retentionDays),
        geminiApiKey: data.geminiApiKey ? String(data.geminiApiKey).trim().slice(0, 256) : '',
      };
      writeSiteConfigLocalOnly(merged);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.GET, SITE_GENERAL_DOC_PATH);
      }
      console.warn('Site config cloud listener warning:', msg);
    }
  );
}

export async function fetchSiteConfigFromCloud(): Promise<SiteConfig> {
  const ref = doc(db, 'site_config', 'general');
  try {
    let snap;
    try {
      snap = await getDocFromServer(ref);
    } catch {
      snap = await getDoc(ref);
    }
    if (!snap.exists()) return getSiteConfig();
    const data = snap.data() as Partial<SiteConfig>;
    const current = getSiteConfig();
    const merged: SiteConfig = {
      ...current,
      announcementEnabled:
        typeof data.announcementEnabled === 'boolean'
          ? data.announcementEnabled
          : current.announcementEnabled,
      announcementTextAr: data.announcementTextAr ?? current.announcementTextAr,
      announcementTextEn: data.announcementTextEn ?? current.announcementTextEn,
      announcementStyle:
        data.announcementStyle === 'red' || data.announcementStyle === 'green'
          ? data.announcementStyle
          : data.announcementStyle === 'gold'
          ? 'gold'
          : current.announcementStyle,
      phoneNumber: data.phoneNumber ?? current.phoneNumber,
      workingHoursAr: data.workingHoursAr ?? current.workingHoursAr,
      workingHoursEn: data.workingHoursEn ?? current.workingHoursEn,
      heroHighlightAr: data.heroHighlightAr ?? current.heroHighlightAr,
      heroHighlightEn: data.heroHighlightEn ?? current.heroHighlightEn,
      primaryDriveWebAppUrl: sanitizeHttpsUrl(
        data.primaryDriveWebAppUrl,
        current.primaryDriveWebAppUrl || DEFAULT_PRIMARY_DRIVE_WEBAPP_URL
      ),
      additionalDriveWebApps:
        data.additionalDriveWebApps !== undefined
          ? sanitizeAdditionalDriveEndpoints(data.additionalDriveWebApps)
          : current.additionalDriveWebApps,
      fcmVapidKey: data.fcmVapidKey ? String(data.fcmVapidKey).trim().slice(0, 256) : current.fcmVapidKey,
      retentionDays:
        data.retentionDays !== undefined
          ? sanitizeRetentionDays(data.retentionDays)
          : current.retentionDays,
      geminiApiKey:
        data.geminiApiKey !== undefined
          ? String(data.geminiApiKey || '').trim().slice(0, 256)
          : current.geminiApiKey || '',
    };
    writeSiteConfigLocalOnly(merged);
    return merged;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, SITE_GENERAL_DOC_PATH);
    }
    return getSiteConfig();
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
      primaryDriveWebAppUrl: sanitizeHttpsUrl(
        parsed.primaryDriveWebAppUrl,
        DEFAULT_PRIMARY_DRIVE_WEBAPP_URL
      ),
      additionalDriveWebApps: sanitizeAdditionalDriveEndpoints(parsed.additionalDriveWebApps),
      retentionDays: sanitizeRetentionDays(parsed.retentionDays),
    };
  } catch {
    return DEFAULT_SITE_CONFIG;
  }
}

export function saveSiteConfig(partial: Partial<SiteConfig>): SiteConfig {
  const next: SiteConfig = {
    ...getSiteConfig(),
    ...partial,
    ...(partial.retentionDays !== undefined
      ? { retentionDays: sanitizeRetentionDays(partial.retentionDays) }
      : {}),
  };
  writeSiteConfigLocalOnly(next);
  void syncSiteConfigToCloud(next);
  return next;
}

export async function saveSiteConfigToCloudStrict(
  partial: Partial<SiteConfig>
): Promise<{ ok: boolean; config: SiteConfig; error?: string }> {
  const next: SiteConfig = {
    ...getSiteConfig(),
    ...partial,
    ...(partial.retentionDays !== undefined
      ? { retentionDays: sanitizeRetentionDays(partial.retentionDays) }
      : {}),
  };
  writeSiteConfigLocalOnly(next);
  const payload = sanitizeSiteConfigPayload(next);
  try {
    await setDoc(doc(db, 'site_config', 'general'), payload);
    return { ok: true, config: next };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, SITE_GENERAL_DOC_PATH);
    }
    return { ok: false, config: next, error: msg };
  }
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
  void syncSiteConfigToCloud(DEFAULT_SITE_CONFIG);
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

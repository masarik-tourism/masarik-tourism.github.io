import { sha256Hex } from '../firebase';
import { TravelerSessionMeta, TrustedDevice } from '../types/travel';

const DEVICE_SECRET_STORAGE_KEY = 'masarik_device_secret_v1';
const DEVICE_ID_CACHE_KEY = 'masarik_device_fp_v1';
const SESSION_META_STORAGE_KEY = 'masarik_session_meta_v1';
const SESSION_EXPIRED_FLAG_KEY = 'masarik_session_expired_notice_v1';
const SAVED_CLIENT_PHONE_STORAGE_KEY = 'masarik_saved_client_phone_v1';

export const TEMPORARY_SESSION_DURATION_MS = 60 * 60 * 1000; // Legacy constant kept for compatibility
export const INACTIVITY_LOCK_DURATION_MS = 12 * 60 * 60 * 1000; // 12-hour inactivity auto-lock

function generateSecureHex(bytesLen = 16): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint8Array(bytesLen);
    window.crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let out = '';
  for (let i = 0; i < bytesLen * 2; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

function getOrCreateDeviceSecret(): string {
  if (typeof window === 'undefined') return 'ssr_fallback_secret';
  try {
    const existing = window.localStorage.getItem(DEVICE_SECRET_STORAGE_KEY);
    if (existing && /^[a-f0-9]{24,64}$/.test(existing)) {
      return existing;
    }
    const created = generateSecureHex(20);
    window.localStorage.setItem(DEVICE_SECRET_STORAGE_KEY, created);
    return created;
  } catch {
    return 'mem_fallback_' + generateSecureHex(12);
  }
}

function collectBrowserTraits(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'server';
  }
  const ua = navigator.userAgent || '';
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    'unknown';
  const lang = navigator.language || 'ar';
  const tz =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '';
  const screenSignature =
    typeof screen !== 'undefined' ? `${screen.width}x${screen.height}x${screen.colorDepth}` : '';
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 0;
  const touch = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;

  return `${platform}|${lang}|${tz}|${screenSignature}|c${cores}|t${touch}|${ua.slice(0, 120)}`;
}

export function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent || '';
  const isWebView = /;\s*wv\)|MasarikApp|AndroidApp/i.test(ua);

  let os = 'Desktop Device';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (isWebView) browser = 'Masarik App';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return `${os} (${browser})`.slice(0, 100);
}

/**
 * Generates and persists a stable, privacy-safe Device Trust Fingerprint
 * combining an encrypted/random local secret with device/browser traits.
 */
export function getDeviceFingerprint(): { deviceId: string; label: string } {
  const label = detectDeviceLabel();
  if (typeof window === 'undefined') {
    return { deviceId: 'dev_server_default_0000', label };
  }

  try {
    const cached = window.localStorage.getItem(DEVICE_ID_CACHE_KEY);
    if (cached && /^dev_[a-f0-9]{24,40}$/.test(cached)) {
      return { deviceId: cached, label };
    }
  } catch {
    // Ignore storage read error
  }

  const secret = getOrCreateDeviceSecret();
  const traits = collectBrowserTraits();
  const digest = sha256Hex(`masarik_device:${secret}:${traits}`);
  const deviceId = `dev_${digest.slice(0, 32)}`;

  try {
    window.localStorage.setItem(DEVICE_ID_CACHE_KEY, deviceId);
  } catch {
    // Ignore storage write error
  }

  return { deviceId, label };
}

export function isDeviceInTrustedList(
  devices: TrustedDevice[] | undefined,
  deviceId?: string
): boolean {
  if (!Array.isArray(devices) || devices.length === 0) return false;
  const targetId = deviceId || getDeviceFingerprint().deviceId;
  return devices.some((d) => d && d.deviceId === targetId);
}

export function getSavedClientPhone(): string {
  if (typeof window === 'undefined') return '';
  try {
    const val = window.localStorage.getItem(SAVED_CLIENT_PHONE_STORAGE_KEY) || '';
    return /^[0-9]{8,20}$/.test(val.trim()) ? val.trim() : '';
  } catch {
    return '';
  }
}

export function setSavedClientPhone(phone: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = (phone || '').replace(/\D/g, '');
    if (/^[0-9]{8,20}$/.test(clean)) {
      window.localStorage.setItem(SAVED_CLIENT_PHONE_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(SAVED_CLIENT_PHONE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage error
  }
}

export function clearSavedClientPhone(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAVED_CLIENT_PHONE_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}

export function readStoredSessionMeta(): TravelerSessionMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TravelerSessionMeta;
      if (parsed && typeof parsed.phone === 'string') {
        return parsed;
      }
    }
  } catch {
    // Ignore localStorage error
  }
  try {
    const tempRaw = window.sessionStorage.getItem(SESSION_META_STORAGE_KEY);
    if (tempRaw) {
      const parsedTemp = JSON.parse(tempRaw) as TravelerSessionMeta;
      if (parsedTemp && typeof parsedTemp.phone === 'string') {
        return parsedTemp;
      }
    }
  } catch {
    // Ignore sessionStorage error
  }
  return null;
}

export function writeStoredSessionMeta(meta: TravelerSessionMeta | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!meta) {
      window.localStorage.removeItem(SESSION_META_STORAGE_KEY);
      window.sessionStorage.removeItem(SESSION_META_STORAGE_KEY);
      return;
    }
    window.sessionStorage.removeItem(SESSION_META_STORAGE_KEY);
    window.localStorage.setItem(SESSION_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Ignore storage write error
  }
}

export function touchStoredSessionActivity(): TravelerSessionMeta | null {
  const current = readStoredSessionMeta();
  if (!current) return null;
  const now = Date.now();
  const next: TravelerSessionMeta = {
    ...current,
    lastActivityAt: now,
    expiresAt: now + INACTIVITY_LOCK_DURATION_MS,
    persistInLocalStorage: true,
  };
  writeStoredSessionMeta(next);
  return next;
}

export function markSessionExpiredNotice(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_EXPIRED_FLAG_KEY, '1');
  } catch {
    // Ignore
  }
}

export function consumeSessionExpiredNotice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const flag = window.localStorage.getItem(SESSION_EXPIRED_FLAG_KEY);
    if (flag === '1') {
      window.localStorage.removeItem(SESSION_EXPIRED_FLAG_KEY);
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}

export function getRemainingTemporaryMinutes(meta: TravelerSessionMeta | null): number | null {
  if (!meta || !meta.expiresAt) return null;
  const remainingMs = meta.expiresAt - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / 60000));
}

export function formatRemainingSessionDuration(
  expiresAt: string | number | null | undefined,
  lang: 'ar' | 'en' = 'ar'
): string {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
    return lang === 'en' ? 'Permanent (Never expires)' : 'دائم (لا ينتهي تلقائياً)';
  }
  const expMs = typeof expiresAt === 'number' ? expiresAt : Date.parse(String(expiresAt));
  if (!Number.isFinite(expMs)) {
    return lang === 'en' ? 'Active' : 'نشط';
  }
  const diffMs = expMs - Date.now();
  if (diffMs <= 0) {
    return lang === 'en' ? 'Expired' : 'منتهية الصلاحية';
  }
  const totalMin = Math.max(1, Math.ceil(diffMs / 60000));
  if (totalMin < 60) {
    return lang === 'en' ? `${totalMin}m remaining` : `متبقي ${totalMin} دقيقة`;
  }
  const totalHours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  if (totalHours < 24) {
    if (lang === 'en') {
      return remMin > 0 ? `${totalHours}h ${remMin}m remaining` : `${totalHours}h remaining`;
    }
    return remMin > 0
      ? `متبقي ${totalHours} ساعة و ${remMin} دقيقة`
      : `متبقي ${totalHours} ساعة`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  if (lang === 'en') {
    return remHours > 0 ? `${days}d ${remHours}h remaining` : `${days}d remaining`;
  }
  return remHours > 0
    ? `متبقي ${days} يوم و ${remHours} ساعة`
    : `متبقي ${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : days <= 10 ? 'أيام' : 'يوماً'}`;
}

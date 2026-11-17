import { TravelerDocument, TravelerProfile, VisaOrderStatus } from '../types/travel';
import { TravelRepository } from '../data/travelData';

const TRAVELERS_STORAGE_KEY = 'masarik_travelers_v1';
const ACTIVE_PHONE_STORAGE_KEY = 'masarik_active_phone_v1';
const ADMIN_PIN_CODE = '7839';

export const OFFICIAL_SITE_BASE_URL = 'https://masarik-tourism.github.io/';
export const COMPANY_WHATSAPP_NUMBER = '201128440008';

export const VISA_ORDER_STATUSES: VisaOrderStatus[] = [
  'تم استلام الأوراق',
  'تم حجز موعد تساهيل',
  'تحت المراجعة',
  'صدرت التأشيرة',
];

export const TRAVELERS_UPDATED_EVENT = 'masarik-travelers-updated';

function emitUpdateEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TRAVELERS_UPDATED_EVENT));
  }
}

export function normalizeArabicDigits(input: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return input.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

export function normalizePhone(rawPhone: string): string {
  const digits = normalizeArabicDigits(rawPhone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  // Standard Egyptian mobile numbers: 010/011/012/015 -> 201...
  if (digits.startsWith('01') && digits.length === 11) {
    return `2${digits}`;
  }
  return digits;
}

export function formatPhoneForDisplay(rawPhone: string): string {
  const normalized = normalizePhone(rawPhone);
  if (normalized.startsWith('20') && normalized.length === 12) {
    return normalized.slice(1); // 01xxxxxxxxx
  }
  return rawPhone.trim() || normalized;
}

export function formatFirstLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function generateSixDigitOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function buildActivationMagicLink(phone: string, otp: string, name?: string): string {
  const cleanPhone = normalizePhone(phone);
  const params = new URLSearchParams({
    activate_phone: cleanPhone,
    otp: normalizeArabicDigits(otp).trim(),
  });
  if (name && name.trim()) {
    params.set('name', name.trim());
  }
  return `${OFFICIAL_SITE_BASE_URL}?${params.toString()}`;
}

export function buildAdminForwardActivationMessage(
  name: string,
  phone: string,
  otp: string,
  lang: 'ar' | 'en' = 'ar'
): string {
  const magicLink = buildActivationMagicLink(phone, otp, name);
  if (lang === 'en') {
    return `Hello ${name.trim()}, your Masarik Tourism (Traveler Profile) activation is ready ✅

🔐 *6-Digit Verification Code (OTP):* ${otp}

⚡ *Or click this direct one-tap activation link:*
${magicLink}

We are happy to assist you 24/7.`;
  }
  return `مرحباً ${name.trim()}، تم تجهيز تفعيل حسابك في منصة ${TravelRepository.COMPANY_NAME_AR} (ملف المسافر) بنجاح ✅

🔐 *كود التفعيل اليدوي (OTP):* ${otp}

⚡ *أو اضغط على رابط التفعيل المباشر للدخول فوراً بضغطة واحدة:*
${magicLink}

نسعد بخدمتك على مدار 24 ساعة.`;
}

export function buildClientWhatsAppRequestMessage(
  name: string,
  phone: string,
  otp: string,
  lang: 'ar' | 'en' = 'ar'
): string {
  const cleanDisplayPhone = formatPhoneForDisplay(phone);
  const forwardBlock = buildAdminForwardActivationMessage(name, phone, otp, lang);
  if (lang === 'en') {
    return `Hello Masarik Tourism team,
I would like to verify my *Traveler Profile* account:
👤 *Name:* ${name.trim()}
📱 *WhatsApp Number:* ${cleanDisplayPhone}
🔐 *Verification Code (OTP):* ${otp}

--- *Ready-to-forward activation message for client* ---
${forwardBlock}`;
  }
  return `السلام عليكم ورحمة الله وبركاته،
أرغب في تفعيل حسابي في *ملف المسافر* بمنصة مسارك للإنجاز السياحي:
👤 *الاسم:* ${name.trim()}
📱 *رقم الواتساب:* ${cleanDisplayPhone}
🔐 *كود التفعيل:* ${otp}

--- *رسالة جاهزة للنسخ وإعادة الإرسال للعميل* ---
${forwardBlock}`;
}

export function getAllTravelers(): Record<string, TravelerProfile> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TRAVELERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TravelerProfile>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAllTravelers(map: Record<string, TravelerProfile>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRAVELERS_STORAGE_KEY, JSON.stringify(map));
    emitUpdateEvent();
  } catch {
    // Handle storage quota gracefully if needed
  }
}

export function getActivePhone(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_PHONE_STORAGE_KEY);
}

export function getActiveTraveler(): TravelerProfile | null {
  const activePhone = getActivePhone();
  if (!activePhone) return null;
  const all = getAllTravelers();
  return all[activePhone] || null;
}

export function setActiveTravelerPhone(phone: string | null): void {
  if (typeof window === 'undefined') return;
  if (phone) {
    window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, normalizePhone(phone));
  } else {
    window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
  }
  emitUpdateEvent();
}

export function registerOrLoginTraveler(name: string, rawPhone: string): TravelerProfile {
  const phone = normalizePhone(rawPhone);
  const cleanName = name.trim();
  const all = getAllTravelers();
  const existing = all[phone];

  if (existing) {
    const updated: TravelerProfile = {
      ...existing,
      name: cleanName || existing.name,
      otp: existing.verified ? existing.otp : existing.otp || generateSixDigitOtp(),
    };
    all[phone] = updated;
    saveAllTravelers(all);
    setActiveTravelerPhone(phone);
    return updated;
  }

  const created: TravelerProfile = {
    phone,
    name: cleanName,
    otp: generateSixDigitOtp(),
    verified: false,
    createdAt: new Date().toISOString(),
    orderStatus: 'تم استلام الأوراق',
    documents: [],
  };
  all[phone] = created;
  saveAllTravelers(all);
  setActiveTravelerPhone(phone);
  return created;
}

export function verifyManualOtp(
  rawPhone: string,
  enteredOtp: string,
  lang: 'ar' | 'en' = 'ar'
): { ok: boolean; error?: string; profile?: TravelerProfile } {
  const phone = normalizePhone(rawPhone);
  const cleanOtp = normalizeArabicDigits(enteredOtp).replace(/\D/g, '');
  if (cleanOtp.length !== 6) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Please enter a valid 6-digit verification code.'
          : 'يرجى إدخال كود تفعيل مكوّن من 6 أرقام.',
    };
  }

  const all = getAllTravelers();
  const profile = all[phone];
  if (!profile) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Account not found on this device. Please sign in first.'
          : 'لم يتم العثور على طلب تسجيل لهذا الرقم على هذا الجهاز. يرجى التسجيل أولاً.',
    };
  }

  if (profile.otp !== cleanOtp) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Verification code does not match. Please double-check and try again.'
          : 'كود التفعيل غير مطابق للكود الصادر لهذا الرقم. يرجى التأكد والمحاولة مجدداً.',
    };
  }

  const verifiedProfile: TravelerProfile = {
    ...profile,
    verified: true,
    verifiedAt: new Date().toISOString(),
  };
  all[phone] = verifiedProfile;
  saveAllTravelers(all);
  setActiveTravelerPhone(phone);
  return { ok: true, profile: verifiedProfile };
}

export function activateViaMagicLink(
  rawPhone: string,
  rawOtp: string,
  nameFromUrl?: string | null
): { ok: boolean; error?: string; profile?: TravelerProfile } {
  const phone = normalizePhone(rawPhone);
  const cleanOtp = normalizeArabicDigits(rawOtp).replace(/\D/g, '');

  if (!phone || cleanOtp.length !== 6) {
    return { ok: false, error: 'رابط التفعيل غير مكتمل أو يحتوي على كود غير صالح.' };
  }

  const all = getAllTravelers();
  const existing = all[phone];

  if (existing) {
    if (existing.otp !== cleanOtp) {
      return { ok: false, error: 'كود التفعيل في الرابط غير مطابق لهذا الحساب.' };
    }
    const updated: TravelerProfile = {
      ...existing,
      name: nameFromUrl?.trim() || existing.name,
      verified: true,
      verifiedAt: existing.verifiedAt || new Date().toISOString(),
    };
    all[phone] = updated;
    saveAllTravelers(all);
    setActiveTravelerPhone(phone);
    return { ok: true, profile: updated };
  }

  // If opened from WhatsApp on a fresh browser session / WebView, restore & verify profile
  const restored: TravelerProfile = {
    phone,
    name: nameFromUrl?.trim() || `مسافر (${formatPhoneForDisplay(phone)})`,
    otp: cleanOtp,
    verified: true,
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    orderStatus: 'تم استلام الأوراق',
    documents: [],
  };
  all[phone] = restored;
  saveAllTravelers(all);
  setActiveTravelerPhone(phone);
  return { ok: true, profile: restored };
}

export function updateTravelerProfileDetails(
  rawPhone: string,
  updates: Partial<
    Pick<
      TravelerProfile,
      | 'name'
      | 'passportFullName'
      | 'passportNumber'
      | 'passportExpiryDate'
      | 'nationality'
      | 'preferredVisaType'
      | 'orderStatus'
      | 'adminNotes'
      | 'verified'
      | 'verifiedAt'
    >
  >
): TravelerProfile | null {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  const updated: TravelerProfile = {
    ...existing,
    ...updates,
  };
  all[phone] = updated;
  saveAllTravelers(all);
  return updated;
}

export function addDocumentToTraveler(
  rawPhone: string,
  doc: Omit<TravelerDocument, 'id' | 'uploadedAt'>
): TravelerProfile | null {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  const newDoc: TravelerDocument = {
    ...doc,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    uploadedAt: new Date().toISOString(),
  };
  const updated: TravelerProfile = {
    ...existing,
    documents: [newDoc, ...(existing.documents || [])],
  };
  all[phone] = updated;
  saveAllTravelers(all);
  return updated;
}

export function removeDocumentFromTraveler(
  rawPhone: string,
  docId: string
): TravelerProfile | null {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  const updated: TravelerProfile = {
    ...existing,
    documents: (existing.documents || []).filter((d) => d.id !== docId),
  };
  all[phone] = updated;
  saveAllTravelers(all);
  return updated;
}

export function verifyAdminPin(pin: string): boolean {
  return normalizeArabicDigits(pin).trim() === ADMIN_PIN_CODE;
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1100,
  quality = 0.74
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المختار.'));
    reader.onload = () => {
      const resultStr = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
          resolve({ dataUrl: resultStr, base64, mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outMime = 'image/jpeg';
        const compressed = canvas.toDataURL(outMime, quality);
        const base64 = compressed.split(',')[1] || '';
        resolve({ dataUrl: compressed, base64, mimeType: outMime });
      };
      img.src = resultStr;
    };
    reader.readAsDataURL(file);
  });
}

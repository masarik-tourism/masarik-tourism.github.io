import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { TravelerDocument, TravelerProfile, VisaOrderStatus } from '../types/travel';
import { TravelRepository } from '../data/travelData';
import { OperationType, db, handleFirestoreError, sha256Hex } from '../firebase';
import {
  deleteTravelerDocumentFromStorage,
  uploadTravelerDocumentToStorage,
} from './firebaseStorageHelper';
import { getSiteConfig } from './siteConfigStore';
import { getCmsState } from './cmsStore';

const TRAVELERS_STORAGE_KEY = 'masarik_travelers_v1';
const ACTIVE_PHONE_STORAGE_KEY = 'masarik_active_phone_v1';
const ADMIN_PIN_STORAGE_KEY = 'masarik_admin_pin_v1';
const ADMIN_PIN_HASH_STORAGE_KEY = 'masarik_admin_pin_hash_v1';
const DEFAULT_ADMIN_PIN = '202200';

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

function saveAllTravelersLocalOnly(map: Record<string, TravelerProfile>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRAVELERS_STORAGE_KEY, JSON.stringify(map));
    emitUpdateEvent();
  } catch {
    // Handle storage quota gracefully if needed
  }
}

function sanitizeClientForFirestore(profile: TravelerProfile): Record<string, unknown> {
  const safeStatus: VisaOrderStatus = VISA_ORDER_STATUSES.includes(profile.orderStatus)
    ? profile.orderStatus
    : 'تم استلام الأوراق';

  const safeOtp = /^\d{6}$/.test(String(profile.otp || ''))
    ? String(profile.otp)
    : generateSixDigitOtp();

  const safeDocs = Array.isArray(profile.documents)
    ? profile.documents.slice(0, 30).map((d) => ({
        id: String(d.id || `${Date.now()}`).slice(0, 80),
        label: String(d.label || 'مستند مسافر').slice(0, 160),
        docType: d.docType || 'other',
        fileName: String(d.fileName || 'document.jpg').slice(0, 200),
        // Never push multi-KB raw base64 blobs into Firestore; store Storage URLs only
        dataUrl: d.dataUrl && d.dataUrl.length <= 4096 ? d.dataUrl : '',
        ...(d.storagePath ? { storagePath: String(d.storagePath).slice(0, 300) } : {}),
        uploadedAt: String(d.uploadedAt || new Date().toISOString()).slice(0, 64),
      }))
    : [];

  const payload: Record<string, unknown> = {
    phone: normalizePhone(profile.phone).slice(0, 20),
    name: String(profile.name || 'مسافر').trim().slice(0, 160) || 'مسافر',
    otp: safeOtp,
    verified: Boolean(profile.verified),
    createdAt: String(profile.createdAt || new Date().toISOString()).slice(0, 64),
    updatedAt: new Date().toISOString(),
    orderStatus: safeStatus,
    documents: safeDocs,
  };

  if (profile.verifiedAt) payload.verifiedAt = String(profile.verifiedAt).slice(0, 64);
  if (profile.adminNotes !== undefined) payload.adminNotes = String(profile.adminNotes).slice(0, 1000);
  if (profile.preferredVisaType !== undefined)
    payload.preferredVisaType = String(profile.preferredVisaType).slice(0, 200);
  if (profile.passportNumber !== undefined)
    payload.passportNumber = String(profile.passportNumber).trim().toUpperCase().slice(0, 40);
  if (profile.passportFullName !== undefined)
    payload.passportFullName = String(profile.passportFullName).slice(0, 200);
  if (profile.passportExpiryDate !== undefined)
    payload.passportExpiryDate = String(profile.passportExpiryDate).slice(0, 32);
  if (profile.nationality !== undefined)
    payload.nationality = String(profile.nationality).slice(0, 100);

  return payload;
}

function mergeCloudClientWithLocal(
  cloudData: TravelerProfile,
  localExisting?: TravelerProfile
): TravelerProfile {
  const localDocsById = new Map<string, TravelerDocument>();
  if (localExisting?.documents) {
    localExisting.documents.forEach((d) => localDocsById.set(d.id, d));
  }

  const mergedDocs: TravelerDocument[] = Array.isArray(cloudData.documents)
    ? cloudData.documents.map((d) => {
        const localDoc = localDocsById.get(d.id);
        return {
          ...d,
          dataUrl: d.dataUrl || localDoc?.dataUrl || '',
        };
      })
    : localExisting?.documents || [];

  return {
    ...cloudData,
    documents: mergedDocs,
  };
}

export async function syncTravelerToCloud(profile: TravelerProfile): Promise<void> {
  const phone = normalizePhone(profile.phone);
  if (!/^[0-9]{8,20}$/.test(phone)) return;

  const path = `clients/${phone}`;
  const payload = sanitizeClientForFirestore({ ...profile, phone });
  try {
    await setDoc(doc(db, 'clients', phone), payload);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    console.warn('Client cloud sync deferred (offline/cache active):', msg);
  }
}

export function subscribeActiveTravelerCloud(phone: string | null): () => void {
  const normalized = phone ? normalizePhone(phone) : '';
  if (!/^[0-9]{8,20}$/.test(normalized)) {
    return () => {};
  }

  const path = `clients/${normalized}`;
  return onSnapshot(
    doc(db, 'clients', normalized),
    (snap) => {
      if (!snap.exists()) return;
      const cloudProfile = snap.data() as TravelerProfile;
      const all = getAllTravelers();
      all[normalized] = mergeCloudClientWithLocal(cloudProfile, all[normalized]);
      saveAllTravelersLocalOnly(all);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.GET, path);
      }
      console.warn('Active traveler listener warning:', msg);
    }
  );
}

export function subscribeAllClientsCloud(): () => void {
  const path = 'clients';
  const clientsQuery = query(
    collection(db, 'clients'),
    where('verified', 'in', [true, false])
  );
  return onSnapshot(
    clientsQuery,
    (snapshot) => {
      const currentLocal = getAllTravelers();
      const nextMap: Record<string, TravelerProfile> = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as TravelerProfile;
        const key = normalizePhone(data.phone || docSnap.id);
        if (key) {
          nextMap[key] = mergeCloudClientWithLocal({ ...data, phone: key }, currentLocal[key]);
        }
      });

      saveAllTravelersLocalOnly(nextMap);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.LIST, path);
      }
      console.warn('Clients collection listener warning:', msg);
    }
  );
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
    saveAllTravelersLocalOnly(all);
    setActiveTravelerPhone(phone);
    void syncTravelerToCloud(updated);
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
  saveAllTravelersLocalOnly(all);
  setActiveTravelerPhone(phone);
  void syncTravelerToCloud(created);
  return created;
}

export async function registerOrLoginTravelerCloud(
  name: string,
  rawPhone: string
): Promise<TravelerProfile> {
  const phone = normalizePhone(rawPhone);
  const cleanName = name.trim();
  const path = `clients/${phone}`;

  try {
    if (/^[0-9]{8,20}$/.test(phone)) {
      const snap = await getDoc(doc(db, 'clients', phone));
      if (snap.exists()) {
        const cloud = snap.data() as TravelerProfile;
        const all = getAllTravelers();
        const merged: TravelerProfile = {
          ...mergeCloudClientWithLocal(cloud, all[phone]),
          name: cleanName || cloud.name,
          otp: cloud.verified ? cloud.otp : cloud.otp || generateSixDigitOtp(),
        };
        all[phone] = merged;
        saveAllTravelersLocalOnly(all);
        setActiveTravelerPhone(phone);
        if (cleanName && cleanName !== cloud.name) {
          await syncTravelerToCloud(merged);
        }
        return merged;
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.warn('Cloud lookup skipped (offline fallback):', msg);
  }

  return registerOrLoginTraveler(name, rawPhone);
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
  saveAllTravelersLocalOnly(all);
  setActiveTravelerPhone(phone);
  void syncTravelerToCloud(verifiedProfile);
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
    saveAllTravelersLocalOnly(all);
    setActiveTravelerPhone(phone);
    void syncTravelerToCloud(updated);
    return { ok: true, profile: updated };
  }

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
  saveAllTravelersLocalOnly(all);
  setActiveTravelerPhone(phone);
  void syncTravelerToCloud(restored);
  return { ok: true, profile: restored };
}

export async function activateViaMagicLinkCloud(
  rawPhone: string,
  rawOtp: string,
  nameFromUrl?: string | null
): Promise<{ ok: boolean; error?: string; profile?: TravelerProfile }> {
  const phone = normalizePhone(rawPhone);
  const cleanOtp = normalizeArabicDigits(rawOtp).replace(/\D/g, '');

  if (!phone || cleanOtp.length !== 6) {
    return { ok: false, error: 'رابط التفعيل غير مكتمل أو يحتوي على كود غير صالح.' };
  }

  const path = `clients/${phone}`;
  try {
    if (/^[0-9]{8,20}$/.test(phone)) {
      const snap = await getDoc(doc(db, 'clients', phone));
      if (snap.exists()) {
        const cloud = snap.data() as TravelerProfile;
        if (cloud.otp !== cleanOtp) {
          return { ok: false, error: 'كود التفعيل في الرابط غير مطابق لهذا الحساب.' };
        }
        const updated: TravelerProfile = {
          ...mergeCloudClientWithLocal(cloud, getAllTravelers()[phone]),
          name: nameFromUrl?.trim() || cloud.name,
          verified: true,
          verifiedAt: cloud.verifiedAt || new Date().toISOString(),
        };
        const all = getAllTravelers();
        all[phone] = updated;
        saveAllTravelersLocalOnly(all);
        setActiveTravelerPhone(phone);
        await syncTravelerToCloud(updated);
        return { ok: true, profile: updated };
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.warn('Cloud magic-link lookup deferred:', msg);
  }

  return activateViaMagicLink(rawPhone, rawOtp, nameFromUrl);
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

  const cleanUpdates = { ...updates };
  if (typeof cleanUpdates.passportNumber === 'string') {
    cleanUpdates.passportNumber = cleanUpdates.passportNumber.trim().toUpperCase();
  }

  const updated: TravelerProfile = {
    ...existing,
    ...cleanUpdates,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  void syncTravelerToCloud(updated);
  return updated;
}

export function deleteTravelerProfile(rawPhone: string): boolean {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return false;

  const docs = existing.documents || [];
  delete all[phone];
  saveAllTravelersLocalOnly(all);
  if (getActivePhone() === phone) {
    setActiveTravelerPhone(null);
  }

  // Cleanup Storage assets + Firestore document
  docs.forEach((d) => {
    if (d.storagePath) {
      void deleteTravelerDocumentFromStorage(d.storagePath);
    }
  });

  if (/^[0-9]{8,20}$/.test(phone)) {
    const path = `clients/${phone}`;
    void deleteDoc(doc(db, 'clients', phone)).catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
      console.warn('Cloud delete client deferred:', msg);
    });
  }

  return true;
}

export function addDocumentToTraveler(
  rawPhone: string,
  docInput: Omit<TravelerDocument, 'id' | 'uploadedAt'>
): TravelerProfile | null {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  const newDoc: TravelerDocument = {
    ...docInput,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    uploadedAt: new Date().toISOString(),
  };
  const updated: TravelerProfile = {
    ...existing,
    documents: [newDoc, ...(existing.documents || [])],
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  void syncTravelerToCloud(updated);
  return updated;
}

export async function uploadAndAddDocumentToTraveler(
  rawPhone: string,
  docInput: Omit<TravelerDocument, 'id' | 'uploadedAt' | 'storagePath'>
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const uploaded = await uploadTravelerDocumentToStorage(phone, docId, docInput.dataUrl);

  const newDoc: TravelerDocument = {
    id: docId,
    label: docInput.label,
    docType: docInput.docType,
    fileName: docInput.fileName,
    dataUrl: uploaded ? uploaded.downloadUrl : docInput.dataUrl,
    ...(uploaded ? { storagePath: uploaded.storagePath } : {}),
    uploadedAt: new Date().toISOString(),
  };

  // Re-read latest map in case snapshot updated while uploading
  const latestAll = getAllTravelers();
  const latestExisting = latestAll[phone] || existing;
  const updated: TravelerProfile = {
    ...latestExisting,
    documents: [newDoc, ...(latestExisting.documents || [])],
  };
  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
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

  const target = (existing.documents || []).find((d) => d.id === docId);
  if (target?.storagePath) {
    void deleteTravelerDocumentFromStorage(target.storagePath);
  }

  const updated: TravelerProfile = {
    ...existing,
    documents: (existing.documents || []).filter((d) => d.id !== docId),
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  void syncTravelerToCloud(updated);
  return updated;
}

export function getAdminPin(): string {
  if (typeof window === 'undefined') return DEFAULT_ADMIN_PIN;
  try {
    const saved = window.localStorage.getItem(ADMIN_PIN_STORAGE_KEY);
    if (saved && saved.trim().length >= 4) {
      return saved.trim();
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_ADMIN_PIN;
}

export function getMasterAdminPinHash(): string {
  if (typeof window !== 'undefined') {
    try {
      const savedHash = window.localStorage.getItem(ADMIN_PIN_HASH_STORAGE_KEY);
      if (savedHash && /^[a-f0-9]{64}$/.test(savedHash)) {
        return savedHash;
      }
    } catch {
      // Ignore read errors
    }
  }
  return sha256Hex(getAdminPin());
}

export function setSyncedMasterPinHash(pinHash: string): void {
  if (typeof window === 'undefined') return;
  if (!/^[a-f0-9]{64}$/.test(pinHash)) return;
  try {
    window.localStorage.setItem(ADMIN_PIN_HASH_STORAGE_KEY, pinHash);
  } catch {
    // Ignore storage errors
  }
}

export function verifyAdminPin(pin: string): boolean {
  const clean = normalizeArabicDigits(pin).trim();
  if (!clean) return false;
  return sha256Hex(clean) === getMasterAdminPinHash();
}

export function updateAdminPin(
  currentPin: string,
  newPin: string,
  lang: 'ar' | 'en' = 'ar'
): { ok: boolean; error?: string } {
  if (!verifyAdminPin(currentPin)) {
    return {
      ok: false,
      error: lang === 'en' ? 'Current Admin PIN is incorrect.' : 'الرمز السري الحالي غير صحيح.',
    };
  }
  const cleanNew = normalizeArabicDigits(newPin).trim();
  if (cleanNew.length < 4) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'New PIN must be at least 4 characters or digits.'
          : 'يجب أن يتكون الرمز السري الجديد من 4 أرقام أو أحرف على الأقل.',
    };
  }
  const nextHash = sha256Hex(cleanNew);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ADMIN_PIN_STORAGE_KEY, cleanNew);
    window.localStorage.setItem(ADMIN_PIN_HASH_STORAGE_KEY, nextHash);
  }

  const path = 'admins/master';
  void updateDoc(doc(db, 'admins', 'master'), {
    pinHash: nextHash,
    updatedAt: new Date().toISOString(),
  }).catch(async (error) => {
    const code = (error as { code?: string })?.code;
    if (code === 'not-found') {
      try {
        await setDoc(doc(db, 'admins', 'master'), {
          id: 'master',
          role: 'super_admin',
          name: 'المدير العام',
          pinHash: nextHash,
          permissions: ['manage_clients', 'activate_otp', 'edit_content', 'delete_records'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return;
      } catch (innerErr) {
        const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (innerMsg.toLowerCase().includes('permission')) {
          handleFirestoreError(innerErr, OperationType.WRITE, path);
        }
      }
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    console.warn('Master PIN cloud sync deferred:', msg);
  });

  return { ok: true };
}

export function exportAllDataBackupJson(): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    platform: 'Masarik Tourism LLC',
    version: '1.0.0',
    clients: Object.values(getAllTravelers()),
    siteConfig: getSiteConfig(),
    cmsData: getCmsState(),
  };
  return JSON.stringify(payload, null, 2);
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

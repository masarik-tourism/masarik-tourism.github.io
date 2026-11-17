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
import {
  CanonicalVisaOrderStatus,
  ClientNotification,
  FamilyMember,
  FamilyRelationship,
  IssuedDocument,
  TravelerDocument,
  TravelerProfile,
  TravelerSessionMeta,
  TrustedDevice,
  VisaOrderStatus,
} from '../types/travel';
import {
  TravelRepository,
  normalizeOrderStatusValue,
  translateOrderStatus,
} from '../data/travelData';
import { OperationType, db, handleFirestoreError, sha256Hex } from '../firebase';
import {
  TEMPORARY_SESSION_DURATION_MS,
  getDeviceFingerprint,
  isDeviceInTrustedList,
  markSessionExpiredNotice,
  readStoredSessionMeta,
  writeStoredSessionMeta,
} from './deviceTrust';
import {
  deleteTravelerDocumentFromStorage,
  uploadFamilyMemberFileToStorage,
  uploadIssuedDeliverableToStorage,
  uploadTravelerAvatarToStorage,
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
export const OTP_ACTIVATION_WHATSAPP_NUMBER = '201119227270';

export const VISA_ORDER_STATUSES: CanonicalVisaOrderStatus[] = [
  'تم استلام الطلب',
  'قيد المراجعة والتنفيذ',
  'تم الحجز / الإصدار',
  'مكتمل',
];

export function getOrderStatusStageIndex(status?: string): number {
  const canonical = normalizeOrderStatusValue(status);
  if (canonical === 'تم تنفيذ الطلب' || canonical === 'مكتمل') {
    return VISA_ORDER_STATUSES.length - 1;
  }
  const idx = VISA_ORDER_STATUSES.indexOf(canonical);
  return idx >= 0 ? idx : 0;
}

export { normalizeOrderStatusValue };

export const TRAVELERS_UPDATED_EVENT = 'masarik-travelers-updated';

export const FAMILY_RELATIONSHIPS: FamilyRelationship[] = [
  'spouse',
  'child',
  'parent',
  'sibling',
  'other',
];

export const RELATIONSHIP_LABELS: Record<FamilyRelationship, { ar: string; en: string }> = {
  spouse: { ar: 'زوج / زوجة', en: 'Spouse' },
  child: { ar: 'ابن / ابنة', en: 'Son / Daughter' },
  parent: { ar: 'أب / أم', en: 'Father / Mother' },
  sibling: { ar: 'أخ / أخت', en: 'Brother / Sister' },
  other: { ar: 'قريب / مرافق آخر', en: 'Other Relative / Companion' },
};

export function getRelationshipLabel(rel: FamilyRelationship, lang: 'ar' | 'en' = 'ar'): string {
  const entry = RELATIONSHIP_LABELS[rel] || RELATIONSHIP_LABELS.other;
  return lang === 'en' ? entry.en : entry.ar;
}

export function formatTravelersOrderSummary(
  traveler: TravelerProfile | null,
  selectedIds: string[],
  lang: 'ar' | 'en' = 'ar'
): string {
  if (!traveler || selectedIds.length === 0) return '';

  const lines: string[] = [];
  const selectedSet = new Set(selectedIds);
  const ownerNames = getTravelerDisplayNames(traveler);
  const ownerPassportDoc = (traveler.documents || []).find((d) => d.docType === 'passport');

  if (selectedSet.has('owner')) {
    const ownerRole = lang === 'en' ? 'Account Holder' : 'صاحب الحساب';
    const passportNo = traveler.passportNumber || (lang === 'en' ? 'Not set' : 'غير مسجل');
    const passportUrl =
      ownerPassportDoc?.dataUrl && ownerPassportDoc.dataUrl.startsWith('http')
        ? ownerPassportDoc.dataUrl
        : '';
    const photoUrl =
      traveler.avatarUrl && traveler.avatarUrl.startsWith('http') ? traveler.avatarUrl : '';

    lines.push(
      lang === 'en'
        ? `• Traveler (${ownerRole}): ${ownerNames.fullDisplayName} | Passport: ${passportNo}`
        : `• المسافر (${ownerRole}): ${ownerNames.fullDisplayName} | جواز: ${passportNo}`
    );
    if (passportUrl) {
      lines.push(
        lang === 'en' ? `  Passport Link: ${passportUrl}` : `  رابط الجواز: ${passportUrl}`
      );
    }
    if (photoUrl) {
      lines.push(
        lang === 'en' ? `  Photo Link: ${photoUrl}` : `  رابط الصورة الشخصية: ${photoUrl}`
      );
    }
  }

  for (const member of traveler.familyMembers || []) {
    if (!selectedSet.has(member.id)) continue;
    const memberName = `${member.firstName} ${member.lastName}`.trim();
    const relLabel = getRelationshipLabel(member.relationship, lang);
    const passportUrl =
      member.passportPhotoUrl && member.passportPhotoUrl.startsWith('http')
        ? member.passportPhotoUrl
        : '';
    const photoUrl =
      member.personalPhotoUrl && member.personalPhotoUrl.startsWith('http')
        ? member.personalPhotoUrl
        : '';

    lines.push(
      lang === 'en'
        ? `• Traveler (${relLabel}): ${memberName} | Passport: ${member.passportNumber}`
        : `• المسافر (${relLabel}): ${memberName} | جواز: ${member.passportNumber}`
    );
    if (passportUrl) {
      lines.push(
        lang === 'en' ? `  Passport Link: ${passportUrl}` : `  رابط الجواز: ${passportUrl}`
      );
    }
    if (photoUrl) {
      lines.push(
        lang === 'en' ? `  Photo Link: ${photoUrl}` : `  رابط الصورة الشخصية: ${photoUrl}`
      );
    }
  }

  return lines.join('\n');
}

export interface StagedDraftDocument {
  id: string;
  label: string;
  docType: TravelerDocument['docType'];
  fileName: string;
  dataUrl: string;
}

export interface TravelerProfileDraft {
  firstName: string;
  lastName: string;
  passportFullName: string;
  passportNumber: string;
  passportExpiryDate: string;
  nationality: string;
  preferredVisaType: string;
  pendingAvatarPreviewUrl: string;
  pendingDocuments: StagedDraftDocument[];
  removedDocIds: string[];
  isDirty: boolean;
}

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

export function splitPassportName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export function formatFirstLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function getTravelerDisplayNames(profile: TravelerProfile | null): {
  firstName: string;
  lastName: string;
  fullDisplayName: string;
} {
  if (!profile) {
    return { firstName: '', lastName: '', fullDisplayName: '' };
  }
  const split = splitPassportName(profile.name || '');
  const firstName = (profile.firstName || split.firstName || '').trim();
  const lastName = (profile.lastName || split.lastName || '').trim();
  const fullDisplayName = `${firstName} ${lastName}`.trim() || profile.name || '';
  return { firstName, lastName, fullDisplayName };
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
    return `Hello ${name.trim()}, your Masarik Tourism activation code is: ${otp}

Direct one-tap activation link:
${magicLink}`;
  }
  return `مرحباً ${name.trim()}، كود تفعيل حسابك في ${TravelRepository.COMPANY_NAME_AR}: ${otp}

رابط التفعيل المباشر بضغطة واحدة:
${magicLink}`;
}

// Anti-Spoofing & Zero-Leak Request: NEVER include OTP or user inputs in client WhatsApp request
export function buildClientWhatsAppRequestMessage(lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') {
    return 'Masarik Activation Code';
  }
  return 'كود تفعيل مسارك';
}

export function buildClientOtpWhatsAppUrl(lang: 'ar' | 'en' = 'ar'): string {
  return `https://wa.me/${OTP_ACTIVATION_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    buildClientWhatsAppRequestMessage(lang)
  )}`;
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
  const safeStatus: VisaOrderStatus = normalizeOrderStatusValue(profile.orderStatus);

  const safeOtp = /^\d{6}$/.test(String(profile.otp || ''))
    ? String(profile.otp)
    : generateSixDigitOtp();

  const normalized = normalizePhone(profile.phone).slice(0, 20);
  const split = splitPassportName(profile.name || '');
  const firstName = String(profile.firstName ?? split.firstName ?? '')
    .trim()
    .slice(0, 80);
  const lastName = String(profile.lastName ?? split.lastName ?? '')
    .trim()
    .slice(0, 80);
  const combinedName =
    `${firstName} ${lastName}`.trim().slice(0, 160) ||
    String(profile.name || 'مسافر').trim().slice(0, 160) ||
    'مسافر';

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

  const validRelations = new Set<FamilyRelationship>(FAMILY_RELATIONSHIPS);
  const safeFamilyMembers: FamilyMember[] = Array.isArray(profile.familyMembers)
    ? profile.familyMembers.slice(0, 25).map((m) => {
        const rel: FamilyRelationship = validRelations.has(m.relationship)
          ? m.relationship
          : 'other';
        return {
          id: String(m.id || `fm-${Date.now()}`).slice(0, 80),
          relationship: rel,
          firstName: String(m.firstName || '').trim().slice(0, 80),
          lastName: String(m.lastName || '').trim().slice(0, 80),
          ...(m.passportFullName
            ? { passportFullName: String(m.passportFullName).trim().slice(0, 200) }
            : {}),
          passportNumber: String(m.passportNumber || '').trim().toUpperCase().slice(0, 40),
          ...(m.passportExpiryDate
            ? { passportExpiryDate: String(m.passportExpiryDate).slice(0, 32) }
            : {}),
          ...(m.nationality ? { nationality: String(m.nationality).trim().slice(0, 100) } : {}),
          passportPhotoUrl:
            m.passportPhotoUrl && m.passportPhotoUrl.length <= 4096 ? m.passportPhotoUrl : '',
          ...(m.passportStoragePath
            ? { passportStoragePath: String(m.passportStoragePath).slice(0, 300) }
            : {}),
          personalPhotoUrl:
            m.personalPhotoUrl && m.personalPhotoUrl.length <= 4096 ? m.personalPhotoUrl : '',
          ...(m.personalPhotoStoragePath
            ? { personalPhotoStoragePath: String(m.personalPhotoStoragePath).slice(0, 300) }
            : {}),
          createdAt: String(m.createdAt || new Date().toISOString()).slice(0, 64),
          ...(m.updatedAt ? { updatedAt: String(m.updatedAt).slice(0, 64) } : {}),
        };
      })
    : [];

  const validDevices: TrustedDevice[] = Array.isArray(profile.trustedDevices)
    ? profile.trustedDevices
        .filter(
          (d) =>
            d &&
            typeof d.deviceId === 'string' &&
            /^[a-zA-Z0-9_\-]{8,64}$/.test(d.deviceId)
        )
        .slice(0, 15)
        .map((d) => ({
          deviceId: String(d.deviceId).slice(0, 64),
          label: String(d.label || 'Web Device').trim().slice(0, 120) || 'Web Device',
          addedAt: String(d.addedAt || new Date().toISOString()).slice(0, 64),
          lastUsedAt: String(d.lastUsedAt || new Date().toISOString()).slice(0, 64),
        }))
    : [];

  const safeIssuedDocuments: IssuedDocument[] = Array.isArray(profile.issuedDocuments)
    ? profile.issuedDocuments
        .filter((d) => d && typeof d.id === 'string' && d.id.trim().length > 0)
        .slice(0, 30)
        .map((d) => ({
          id: String(d.id).slice(0, 80),
          docTypeLabel: String(d.docTypeLabel || 'مستند تنفيذ').trim().slice(0, 160) || 'مستند تنفيذ',
          fileName: String(d.fileName || 'deliverable.pdf').slice(0, 220),
          mimeType: String(d.mimeType || 'application/pdf').slice(0, 120),
          downloadUrl:
            d.downloadUrl && d.downloadUrl.length <= 4096 ? String(d.downloadUrl) : '',
          ...(d.storagePath ? { storagePath: String(d.storagePath).slice(0, 300) } : {}),
          ...(d.notes ? { notes: String(d.notes).trim().slice(0, 300) } : {}),
          issuedAt: String(d.issuedAt || new Date().toISOString()).slice(0, 64),
          ...(d.issuedBy ? { issuedBy: String(d.issuedBy).trim().slice(0, 100) } : {}),
        }))
    : [];

  const safeNotifications: ClientNotification[] = Array.isArray(profile.notifications)
    ? profile.notifications
        .filter((n) => n && typeof n.id === 'string' && n.id.trim().length > 0)
        .slice(0, 30)
        .map((n) => ({
          id: String(n.id).slice(0, 80),
          titleAr: String(n.titleAr || 'تحديث جديد').slice(0, 160),
          titleEn: String(n.titleEn || 'New Update').slice(0, 160),
          bodyAr: String(n.bodyAr || '').slice(0, 400),
          bodyEn: String(n.bodyEn || '').slice(0, 400),
          type: n.type === 'deliverable' ? 'deliverable' : 'status',
          ...(n.docId ? { docId: String(n.docId).slice(0, 80) } : {}),
          createdAt: String(n.createdAt || new Date().toISOString()).slice(0, 64),
          read: Boolean(n.read),
        }))
    : [];

  const payload: Record<string, unknown> = {
    phone: normalized,
    phoneNormalized: normalized,
    firstName,
    lastName,
    name: combinedName,
    otp: safeOtp,
    verified: Boolean(profile.verified),
    createdAt: String(profile.createdAt || new Date().toISOString()).slice(0, 64),
    updatedAt: new Date().toISOString(),
    orderStatus: safeStatus,
    documents: safeDocs,
    familyMembers: safeFamilyMembers,
    trustedDevices: validDevices,
    issuedDocuments: safeIssuedDocuments,
    notifications: safeNotifications,
  };

  if (profile.pinHash && /^[a-f0-9]{64}$/.test(profile.pinHash)) {
    payload.pinHash = profile.pinHash;
  }
  if (profile.pinUpdatedAt) {
    payload.pinUpdatedAt = String(profile.pinUpdatedAt).slice(0, 64);
  }
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
  if (profile.avatarUrl && profile.avatarUrl.length <= 4096) {
    payload.avatarUrl = profile.avatarUrl;
  }
  if (profile.avatarStoragePath) {
    payload.avatarStoragePath = String(profile.avatarStoragePath).slice(0, 300);
  }

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

  const localFamilyById = new Map<string, FamilyMember>();
  if (localExisting?.familyMembers) {
    localExisting.familyMembers.forEach((m) => localFamilyById.set(m.id, m));
  }

  const mergedFamilyMembers: FamilyMember[] = Array.isArray(cloudData.familyMembers)
    ? cloudData.familyMembers.map((m) => {
        const localMember = localFamilyById.get(m.id);
        return {
          ...m,
          passportPhotoUrl: m.passportPhotoUrl || localMember?.passportPhotoUrl || '',
          personalPhotoUrl: m.personalPhotoUrl || localMember?.personalPhotoUrl || '',
        };
      })
    : localExisting?.familyMembers || [];

  const localIssuedById = new Map<string, IssuedDocument>();
  if (localExisting?.issuedDocuments) {
    localExisting.issuedDocuments.forEach((d) => localIssuedById.set(d.id, d));
  }
  const mergedIssuedDocs: IssuedDocument[] = Array.isArray(cloudData.issuedDocuments)
    ? cloudData.issuedDocuments.map((d) => {
        const localDoc = localIssuedById.get(d.id);
        return {
          ...d,
          downloadUrl: d.downloadUrl || localDoc?.downloadUrl || '',
        };
      })
    : localExisting?.issuedDocuments || [];

  const mergedNotifications: ClientNotification[] = Array.isArray(cloudData.notifications)
    ? cloudData.notifications
    : localExisting?.notifications || [];

  const split = splitPassportName(cloudData.name || '');

  return {
    ...cloudData,
    phoneNormalized: cloudData.phoneNormalized || normalizePhone(cloudData.phone),
    firstName: cloudData.firstName || split.firstName,
    lastName: cloudData.lastName || split.lastName,
    pinHash: cloudData.pinHash || localExisting?.pinHash || undefined,
    pinUpdatedAt: cloudData.pinUpdatedAt || localExisting?.pinUpdatedAt || undefined,
    trustedDevices: Array.isArray(cloudData.trustedDevices)
      ? cloudData.trustedDevices
      : localExisting?.trustedDevices || [],
    avatarUrl: cloudData.avatarUrl || localExisting?.avatarUrl || undefined,
    avatarStoragePath: cloudData.avatarStoragePath || localExisting?.avatarStoragePath || undefined,
    documents: mergedDocs,
    familyMembers: mergedFamilyMembers,
    issuedDocuments: mergedIssuedDocs,
    notifications: mergedNotifications,
  };
}

export async function syncTravelerToCloud(profile: TravelerProfile): Promise<void> {
  const phone = normalizePhone(profile.phone);
  if (!/^[0-9]{8,20}$/.test(phone)) return;

  const path = `clients/${phone}`;
  const payload = sanitizeClientForFirestore({ ...profile, phone, phoneNormalized: phone });
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
        const key = normalizePhone(data.phoneNormalized || data.phone || docSnap.id);
        if (key) {
          nextMap[key] = mergeCloudClientWithLocal(
            { ...data, phone: key, phoneNormalized: key },
            currentLocal[key]
          );
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

export function hashClientPin(rawPhone: string, rawPin: string): string {
  const phone = normalizePhone(rawPhone);
  const cleanPin = normalizeArabicDigits(rawPin).replace(/\D/g, '');
  return sha256Hex(`client_pin:${phone}:${cleanPin}`);
}

export function getTravelerSessionMeta(): TravelerSessionMeta | null {
  if (typeof window === 'undefined') return null;
  const activePhone = window.localStorage.getItem(ACTIVE_PHONE_STORAGE_KEY);
  if (!activePhone) return null;
  const meta = readStoredSessionMeta();
  if (!meta || meta.phone !== activePhone) return null;
  if (meta.mode === 'temporary' && meta.expiresAt && Date.now() >= meta.expiresAt) {
    window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
    writeStoredSessionMeta(null);
    markSessionExpiredNotice();
    emitUpdateEvent();
    return null;
  }
  return meta;
}

export function getActivePhone(): string | null {
  if (typeof window === 'undefined') return null;
  const rawPhone = window.localStorage.getItem(ACTIVE_PHONE_STORAGE_KEY);
  if (!rawPhone) return null;
  const meta = readStoredSessionMeta();
  if (meta && meta.phone === rawPhone && meta.mode === 'temporary' && meta.expiresAt) {
    if (Date.now() >= meta.expiresAt) {
      window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
      writeStoredSessionMeta(null);
      markSessionExpiredNotice();
      return null;
    }
  }
  return rawPhone;
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
    const cleanPhone = normalizePhone(phone);
    window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, cleanPhone);
  } else {
    window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
    writeStoredSessionMeta(null);
  }
  emitUpdateEvent();
}

export function startTravelerSession(
  rawPhone: string,
  mode: 'trusted' | 'temporary'
): TravelerSessionMeta {
  const phone = normalizePhone(rawPhone);
  const { deviceId } = getDeviceFingerprint();
  const now = Date.now();
  const meta: TravelerSessionMeta = {
    phone,
    mode,
    deviceId,
    startedAt: now,
    expiresAt: mode === 'temporary' ? now + TEMPORARY_SESSION_DURATION_MS : null,
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, phone);
    writeStoredSessionMeta(meta);
    emitUpdateEvent();
  }
  return meta;
}

export function logoutTravelerSession(reason: 'manual' | 'expired' = 'manual'): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
  writeStoredSessionMeta(null);
  if (reason === 'expired') {
    markSessionExpiredNotice();
  }
  emitUpdateEvent();
}

export async function checkClientAccountAndDeviceCloud(rawPhone: string): Promise<{
  validPhone: boolean;
  phone: string;
  exists: boolean;
  profile?: TravelerProfile;
  hasPin: boolean;
  isTrustedDevice: boolean;
  currentDeviceId: string;
  currentDeviceLabel: string;
}> {
  const phone = normalizePhone(rawPhone);
  const { deviceId, label } = getDeviceFingerprint();
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return {
      validPhone: false,
      phone: '',
      exists: false,
      hasPin: false,
      isTrustedDevice: false,
      currentDeviceId: deviceId,
      currentDeviceLabel: label,
    };
  }

  const localAll = getAllTravelers();
  let target: TravelerProfile | undefined = localAll[phone];
  const path = `clients/${phone}`;

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, localAll[phone]);
      localAll[phone] = target;
      saveAllTravelersLocalOnly(localAll);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.warn('Cloud device trust lookup deferred:', msg);
  }

  if (!target) {
    return {
      validPhone: true,
      phone,
      exists: false,
      hasPin: false,
      isTrustedDevice: false,
      currentDeviceId: deviceId,
      currentDeviceLabel: label,
    };
  }

  return {
    validPhone: true,
    phone,
    exists: true,
    profile: target,
    hasPin: Boolean(target.pinHash && /^[a-f0-9]{64}$/.test(target.pinHash)),
    isTrustedDevice: isDeviceInTrustedList(target.trustedDevices, deviceId),
    currentDeviceId: deviceId,
    currentDeviceLabel: label,
  };
}

export async function loginWithTrustedDevicePinCloud(
  rawPhone: string,
  enteredPin: string,
  lang: 'ar' | 'en' = 'ar'
): Promise<{
  ok: boolean;
  error?: string;
  fallbackToOtp?: boolean;
  profile?: TravelerProfile;
}> {
  const phone = normalizePhone(rawPhone);
  const cleanPin = normalizeArabicDigits(enteredPin).replace(/\D/g, '');
  if (!/^[0-9]{8,20}$/.test(phone) || cleanPin.length !== 6) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Please enter your valid phone number and 6-digit PIN.'
          : 'يرجى إدخال رقم الواتساب ورمز الـ PIN المكون من 6 أرقام.',
    };
  }

  const check = await checkClientAccountAndDeviceCloud(phone);
  if (!check.exists || !check.profile) {
    return {
      ok: false,
      fallbackToOtp: true,
      error:
        lang === 'en'
          ? 'Account not found. Please verify via WhatsApp OTP.'
          : 'لم يتم العثور على الحساب. يرجى التحقق عبر كود الواتساب.',
    };
  }

  if (!check.isTrustedDevice || !check.hasPin || !check.profile.pinHash) {
    return {
      ok: false,
      fallbackToOtp: true,
      error:
        lang === 'en'
          ? 'This device is not trusted or PIN is not set. Switching to WhatsApp OTP verification.'
          : 'هذا الجهاز غير موثوق أو لم يتم تعيين رمز PIN بعد. سيتم التحقق عبر كود واتساب OTP.',
    };
  }

  const enteredHash = hashClientPin(phone, cleanPin);
  if (enteredHash !== check.profile.pinHash) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Incorrect 6-digit PIN. Please try again or tap Forgot PIN to verify via WhatsApp OTP.'
          : 'رمز الـ PIN غير صحيح. يرجى المحاولة مرة أخرى أو استخدام خيار نسيت رمز الـ PIN.',
    };
  }

  const nowIso = new Date().toISOString();
  const updatedDevices: TrustedDevice[] = (check.profile.trustedDevices || []).map((d) =>
    d.deviceId === check.currentDeviceId
      ? { ...d, label: check.currentDeviceLabel, lastUsedAt: nowIso }
      : d
  );

  const updated: TravelerProfile = {
    ...check.profile,
    trustedDevices: updatedDevices,
  };
  const all = getAllTravelers();
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  startTravelerSession(phone, 'trusted');
  await syncTravelerToCloud(updated);
  return { ok: true, profile: updated };
}

/**
 * Step 1 of Zero-Leak Client Login:
 * Generates a brand-new random 6-digit OTP in Firestore (`clients/{phoneNormalized}`),
 * saves `firstName`, `lastName`, `name`, `phone`, and `phoneNormalized`,
 * and DOES NOT unlock the session until OTP + PIN/Device Trust steps succeed.
 */
export async function initiateTravelerOtpLoginCloud(
  firstNameInput: string,
  lastNameInput: string,
  rawPhone: string
): Promise<{ ok: boolean; phone: string; isExisting: boolean; error?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, phone: '', isExisting: false, error: 'رقم الهاتف غير صالح.' };
  }

  const cleanFirst = firstNameInput.trim();
  const cleanLast = lastNameInput.trim();
  const combinedName = `${cleanFirst} ${cleanLast}`.trim();
  const freshOtp = generateSixDigitOtp();
  const path = `clients/${phone}`;

  const localAll = getAllTravelers();
  let existing: TravelerProfile | undefined = localAll[phone];

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      existing = mergeCloudClientWithLocal(snap.data() as TravelerProfile, localAll[phone]);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.warn('Cloud lookup during OTP initiation deferred (offline fallback):', msg);
  }

  if (existing) {
    const existingSplit = splitPassportName(existing.name || '');
    const finalFirst = cleanFirst || existing.firstName || existingSplit.firstName;
    const finalLast = cleanLast || existing.lastName || existingSplit.lastName;
    const finalName = `${finalFirst} ${finalLast}`.trim() || existing.name;

    const updated: TravelerProfile = {
      ...existing,
      phone,
      phoneNormalized: phone,
      firstName: finalFirst,
      lastName: finalLast,
      name: finalName,
      otp: freshOtp,
    };

    localAll[phone] = updated;
    saveAllTravelersLocalOnly(localAll);
    await syncTravelerToCloud(updated);
    return { ok: true, phone, isExisting: true };
  }

  const created: TravelerProfile = {
    phone,
    phoneNormalized: phone,
    firstName: cleanFirst,
    lastName: cleanLast,
    name: combinedName || `مسافر (${formatPhoneForDisplay(phone)})`,
    otp: freshOtp,
    trustedDevices: [],
    verified: false,
    createdAt: new Date().toISOString(),
    orderStatus: 'تم استلام الطلب',
    documents: [],
  };

  localAll[phone] = created;
  saveAllTravelersLocalOnly(localAll);
  await syncTravelerToCloud(created);
  return { ok: true, phone, isExisting: false };
}

/**
 * Generates a fresh 6-digit OTP on an existing client account (used for Forgot PIN or Change PIN).
 */
export async function requestAccountSecurityOtpCloud(
  rawPhone: string
): Promise<{ ok: boolean; phone: string; error?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, phone: '', error: 'رقم الهاتف غير صالح.' };
  }
  const freshOtp = generateSixDigitOtp();
  const path = `clients/${phone}`;
  const localAll = getAllTravelers();
  let existing: TravelerProfile | undefined = localAll[phone];

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      existing = mergeCloudClientWithLocal(snap.data() as TravelerProfile, localAll[phone]);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  if (!existing) {
    return { ok: false, phone, error: 'الحساب غير موجود.' };
  }

  const updated: TravelerProfile = {
    ...existing,
    otp: freshOtp,
  };
  localAll[phone] = updated;
  saveAllTravelersLocalOnly(localAll);
  await syncTravelerToCloud(updated);
  return { ok: true, phone };
}

/**
 * Verifies a 6-digit security OTP against Firestore without creating/changing active session state.
 */
export async function verifyAccountSecurityOtpCloud(
  rawPhone: string,
  enteredOtp: string,
  lang: 'ar' | 'en' = 'ar'
): Promise<{ ok: boolean; error?: string; profile?: TravelerProfile }> {
  const phone = normalizePhone(rawPhone);
  const cleanOtp = normalizeArabicDigits(enteredOtp).replace(/\D/g, '');
  if (!/^[0-9]{8,20}$/.test(phone) || cleanOtp.length !== 6) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Please enter the 6-digit verification code.'
          : 'يرجى إدخال كود التحقق المكون من 6 أرقام.',
    };
  }

  const path = `clients/${phone}`;
  const all = getAllTravelers();
  let target: TravelerProfile | undefined = all[phone];

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, all[phone]);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  if (!target || String(target.otp || '').trim() !== cleanOtp) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Verification code is incorrect. Please check WhatsApp and try again.'
          : 'كود التحقق غير صحيح. يرجى مراجعة رسالة الواتساب والمحاولة مجدداً.',
    };
  }

  return { ok: true, profile: target };
}

/**
 * Step 2 of Zero-Leak Client Login:
 * Verifies the user-entered 6-digit OTP against Firestore `clients/{phoneNormalized}`
 * and returns PIN/device trust requirements before finalizing the session.
 */
export async function verifyLoginOtpCloud(
  rawPhone: string,
  enteredOtp: string,
  lang: 'ar' | 'en' = 'ar'
): Promise<{
  ok: boolean;
  error?: string;
  profile?: TravelerProfile;
  needsPinSetup?: boolean;
  isDeviceTrusted?: boolean;
}> {
  const phone = normalizePhone(rawPhone);
  const cleanOtp = normalizeArabicDigits(enteredOtp).replace(/\D/g, '');
  if (!/^[0-9]{8,20}$/.test(phone) || cleanOtp.length !== 6) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Please enter a valid 6-digit login code.'
          : 'يرجى إدخال كود الدخول المكون من 6 أرقام.',
    };
  }

  const path = `clients/${phone}`;
  const all = getAllTravelers();
  let target: TravelerProfile | undefined = all[phone];

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, all[phone]);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.warn('Cloud OTP verify read deferred (offline fallback):', msg);
  }

  if (!target) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Account not found for this WhatsApp number. Please start login again.'
          : 'لم يتم العثور على حساب مسجل لهذا الرقم. يرجى إعادة خطوة الدخول.',
    };
  }

  if (String(target.otp || '').trim() !== cleanOtp) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'The entered login code is incorrect. Please check WhatsApp and try again.'
          : 'كود الدخول المدخل غير صحيح. يرجى التأكد من الكود المرسل لكم عبر واتساب.',
    };
  }

  const verifiedProfile: TravelerProfile = {
    ...target,
    phone,
    phoneNormalized: phone,
    verified: true,
    verifiedAt: target.verifiedAt || new Date().toISOString(),
  };

  all[phone] = verifiedProfile;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(verifiedProfile);

  const hasPin = Boolean(verifiedProfile.pinHash && /^[a-f0-9]{64}$/.test(verifiedProfile.pinHash));
  const trusted = isDeviceInTrustedList(verifiedProfile.trustedDevices);

  return {
    ok: true,
    profile: verifiedProfile,
    needsPinSetup: !hasPin,
    isDeviceTrusted: trusted,
  };
}

export async function setClientPinCloud(
  rawPhone: string,
  newPin: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const cleanPin = normalizeArabicDigits(newPin).replace(/\D/g, '');
  if (!/^[0-9]{8,20}$/.test(phone) || cleanPin.length !== 6) return null;

  const all = getAllTravelers();
  let existing: TravelerProfile | undefined = all[phone];
  const path = `clients/${phone}`;

  if (!existing) {
    try {
      const snap = await getDoc(doc(db, 'clients', phone));
      if (snap.exists()) {
        existing = mergeCloudClientWithLocal(snap.data() as TravelerProfile, all[phone]);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }
  }

  if (!existing) return null;

  const updated: TravelerProfile = {
    ...existing,
    pinHash: hashClientPin(phone, cleanPin),
    pinUpdatedAt: new Date().toISOString(),
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  return updated;
}

export async function trustCurrentDeviceCloud(
  rawPhone: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return null;

  const all = getAllTravelers();
  let existing: TravelerProfile | undefined = all[phone];
  const path = `clients/${phone}`;

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      existing = mergeCloudClientWithLocal(snap.data() as TravelerProfile, all[phone]);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  if (!existing) return null;

  const { deviceId, label } = getDeviceFingerprint();
  const nowIso = new Date().toISOString();
  const currentList = Array.isArray(existing.trustedDevices) ? existing.trustedDevices : [];
  const existingEntry = currentList.find((d) => d.deviceId === deviceId);

  const nextDevice: TrustedDevice = {
    deviceId,
    label,
    addedAt: existingEntry?.addedAt || nowIso,
    lastUsedAt: nowIso,
  };

  const filtered = currentList.filter((d) => d.deviceId !== deviceId);
  const nextList = [nextDevice, ...filtered].slice(0, 15);

  const updated: TravelerProfile = {
    ...existing,
    trustedDevices: nextList,
  };

  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  startTravelerSession(phone, 'trusted');
  await syncTravelerToCloud(updated);
  return updated;
}

export async function revokeTrustedDeviceCloud(
  rawPhone: string,
  targetDeviceId: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return null;

  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  const nextDevices = (existing.trustedDevices || []).filter(
    (d) => d.deviceId !== targetDeviceId
  );

  const updated: TravelerProfile = {
    ...existing,
    trustedDevices: nextDevices,
  };

  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  // If the client revoked trust from the current device while on a permanent session,
  // convert the current session into a 60-minute temporary session so future logins require OTP.
  const currentDeviceId = getDeviceFingerprint().deviceId;
  const meta = getTravelerSessionMeta();
  if (targetDeviceId === currentDeviceId && meta?.phone === phone && meta.mode === 'trusted') {
    startTravelerSession(phone, 'temporary');
  }

  await syncTravelerToCloud(updated);
  return updated;
}

/**
 * Admin Quick-Add / Update Client helper (does NOT overwrite client session state).
 */
export async function adminCreateClientCloud(
  firstNameInput: string,
  lastNameInput: string,
  rawPhone: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return null;

  const cleanFirst = firstNameInput.trim();
  const cleanLast = lastNameInput.trim();
  const fullName = `${cleanFirst} ${cleanLast}`.trim();
  const path = `clients/${phone}`;
  const all = getAllTravelers();
  let existing: TravelerProfile | undefined = all[phone];

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      existing = mergeCloudClientWithLocal(snap.data() as TravelerProfile, all[phone]);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  const profile: TravelerProfile = existing
    ? {
        ...existing,
        phone,
        phoneNormalized: phone,
        firstName: cleanFirst || existing.firstName,
        lastName: cleanLast || existing.lastName,
        name: fullName || existing.name,
        otp: existing.otp || generateSixDigitOtp(),
      }
    : {
        phone,
        phoneNormalized: phone,
        firstName: cleanFirst,
        lastName: cleanLast,
        name: fullName || `مسافر (${formatPhoneForDisplay(phone)})`,
        otp: generateSixDigitOtp(),
        verified: false,
        createdAt: new Date().toISOString(),
        orderStatus: 'تم استلام الطلب',
        documents: [],
      };

  all[phone] = profile;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(profile);
  return profile;
}

export function registerOrLoginTraveler(name: string, rawPhone: string): TravelerProfile {
  const phone = normalizePhone(rawPhone);
  const cleanName = name.trim();
  const split = splitPassportName(cleanName);
  const all = getAllTravelers();
  const existing = all[phone];

  if (existing) {
    const updated: TravelerProfile = {
      ...existing,
      phone,
      phoneNormalized: phone,
      firstName: split.firstName || existing.firstName,
      lastName: split.lastName || existing.lastName,
      name: cleanName || existing.name,
      otp: generateSixDigitOtp(),
    };
    all[phone] = updated;
    saveAllTravelersLocalOnly(all);
    void syncTravelerToCloud(updated);
    return updated;
  }

  const created: TravelerProfile = {
    phone,
    phoneNormalized: phone,
    firstName: split.firstName,
    lastName: split.lastName,
    name: cleanName,
    otp: generateSixDigitOtp(),
    verified: false,
    createdAt: new Date().toISOString(),
    orderStatus: 'تم استلام الطلب',
    documents: [],
  };
  all[phone] = created;
  saveAllTravelersLocalOnly(all);
  void syncTravelerToCloud(created);
  return created;
}

export async function registerOrLoginTravelerCloud(
  name: string,
  rawPhone: string
): Promise<TravelerProfile> {
  const split = splitPassportName(name);
  const created = await adminCreateClientCloud(split.firstName, split.lastName, rawPhone);
  return created || registerOrLoginTraveler(name, rawPhone);
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
    phone,
    phoneNormalized: phone,
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
    const split = splitPassportName(nameFromUrl || existing.name);
    const updated: TravelerProfile = {
      ...existing,
      phone,
      phoneNormalized: phone,
      firstName: existing.firstName || split.firstName,
      lastName: existing.lastName || split.lastName,
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

  const fallbackName = nameFromUrl?.trim() || `مسافر (${formatPhoneForDisplay(phone)})`;
  const split = splitPassportName(fallbackName);
  const restored: TravelerProfile = {
    phone,
    phoneNormalized: phone,
    firstName: split.firstName,
    lastName: split.lastName,
    name: fallbackName,
    otp: cleanOtp,
    verified: true,
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    orderStatus: 'تم استلام الطلب',
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
): Promise<{
  ok: boolean;
  error?: string;
  profile?: TravelerProfile;
  needsPinSetup?: boolean;
  isDeviceTrusted?: boolean;
}> {
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
        const split = splitPassportName(nameFromUrl || cloud.name);
        const merged = mergeCloudClientWithLocal(cloud, getAllTravelers()[phone]);
        const updated: TravelerProfile = {
          ...merged,
          phone,
          phoneNormalized: phone,
          firstName: merged.firstName || split.firstName,
          lastName: merged.lastName || split.lastName,
          name: nameFromUrl?.trim() || merged.name,
          verified: true,
          verifiedAt: cloud.verifiedAt || new Date().toISOString(),
        };

        const hasPin = Boolean(updated.pinHash && /^[a-f0-9]{64}$/.test(updated.pinHash));
        const { deviceId, label } = getDeviceFingerprint();
        const trusted = isDeviceInTrustedList(updated.trustedDevices, deviceId);

        if (hasPin && trusted) {
          const nowIso = new Date().toISOString();
          updated.trustedDevices = (updated.trustedDevices || []).map((d) =>
            d.deviceId === deviceId ? { ...d, label, lastUsedAt: nowIso } : d
          );
          const all = getAllTravelers();
          all[phone] = updated;
          saveAllTravelersLocalOnly(all);
          startTravelerSession(phone, 'trusted');
          await syncTravelerToCloud(updated);
          return { ok: true, profile: updated, needsPinSetup: false, isDeviceTrusted: true };
        }

        const all = getAllTravelers();
        all[phone] = updated;
        saveAllTravelersLocalOnly(all);
        await syncTravelerToCloud(updated);
        return {
          ok: true,
          profile: updated,
          needsPinSetup: !hasPin,
          isDeviceTrusted: trusted,
        };
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.warn('Cloud magic-link lookup deferred:', msg);
  }

  const localRes = activateViaMagicLink(rawPhone, rawOtp, nameFromUrl);
  if (!localRes.ok || !localRes.profile) return localRes;

  const hasPin = Boolean(
    localRes.profile.pinHash && /^[a-f0-9]{64}$/.test(localRes.profile.pinHash)
  );
  const trusted = isDeviceInTrustedList(localRes.profile.trustedDevices);
  if (!hasPin || !trusted) {
    // Undo direct session unlock from legacy offline helper so PIN & Trust prompt always execute
    setActiveTravelerPhone(null);
  } else {
    startTravelerSession(localRes.profile.phone, 'trusted');
  }
  return {
    ok: true,
    profile: localRes.profile,
    needsPinSetup: !hasPin,
    isDeviceTrusted: trusted,
  };
}

export function updateTravelerProfileDetails(
  rawPhone: string,
  updates: Partial<
    Pick<
      TravelerProfile,
      | 'firstName'
      | 'lastName'
      | 'name'
      | 'phoneNormalized'
      | 'avatarUrl'
      | 'avatarStoragePath'
      | 'passportFullName'
      | 'passportNumber'
      | 'passportExpiryDate'
      | 'nationality'
      | 'preferredVisaType'
      | 'orderStatus'
      | 'adminNotes'
      | 'verified'
      | 'verifiedAt'
      | 'issuedDocuments'
      | 'notifications'
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

  const nextFirst =
    cleanUpdates.firstName !== undefined
      ? cleanUpdates.firstName.trim()
      : existing.firstName || splitPassportName(existing.name).firstName;
  const nextLast =
    cleanUpdates.lastName !== undefined
      ? cleanUpdates.lastName.trim()
      : existing.lastName || splitPassportName(existing.name).lastName;
  const nextCombined =
    cleanUpdates.name !== undefined
      ? cleanUpdates.name.trim()
      : `${nextFirst} ${nextLast}`.trim() || existing.name;

  // Automatically create a live notification when the order status stage advances/changes
  let nextNotifications = cleanUpdates.notifications ?? existing.notifications ?? [];
  if (
    cleanUpdates.orderStatus &&
    normalizeOrderStatusValue(cleanUpdates.orderStatus) !==
      normalizeOrderStatusValue(existing.orderStatus)
  ) {
    const statusAr = translateOrderStatus(cleanUpdates.orderStatus, 'ar');
    const statusEn = translateOrderStatus(cleanUpdates.orderStatus, 'en');
    const statusNote: ClientNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      titleAr: 'تحديث حالة الطلب',
      titleEn: 'Order Status Updated',
      bodyAr: `تم تحديث حالة طلبك الآن إلى: ${statusAr}.`,
      bodyEn: `Your order status has been updated to: ${statusEn}.`,
      type: 'status',
      createdAt: new Date().toISOString(),
      read: false,
    };
    nextNotifications = [statusNote, ...nextNotifications].slice(0, 30);
  }

  const updated: TravelerProfile = {
    ...existing,
    ...cleanUpdates,
    notifications: nextNotifications,
    phone,
    phoneNormalized: phone,
    firstName: nextFirst,
    lastName: nextLast,
    name: nextCombined,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  void syncTravelerToCloud(updated);
  return updated;
}

/**
 * Admin Action: Uploads an official completion deliverable (PDF or high-quality image) to Firebase Storage,
 * saves it into `issuedDocuments`, updates `orderStatus` automatically to 'تم تنفيذ الطلب',
 * and pushes an unread real-time notification to the client's bell.
 */
export async function approveAndDeliverDocumentCloud(
  rawPhone: string,
  input: {
    file: File;
    docTypeLabel: string;
    notes?: string;
    adminName?: string;
  }
): Promise<{
  ok: boolean;
  profile?: TravelerProfile;
  deliverable?: IssuedDocument;
  error?: string;
}> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, error: 'رقم الهاتف غير صالح.' };
  }
  const cleanLabel = input.docTypeLabel.trim();
  if (!cleanLabel) {
    return { ok: false, error: 'يرجى تحديد أو كتابة نوع المستند أولاً.' };
  }

  const deliverableId = `del-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let uploadResult: {
    downloadUrl: string;
    storagePath: string;
    fileName: string;
    mimeType: string;
  };

  try {
    uploadResult = await uploadIssuedDeliverableToStorage(phone, deliverableId, input.file);
  } catch (err) {
    console.warn('Issued deliverable Firebase Storage upload failed:', err);
    return {
      ok: false,
      error:
        'تعذر رفع المستند إلى التخزين السحابي Firebase Storage. يرجى التحقق من الاتصال والمحاولة مجدداً.',
    };
  }

  // Re-read freshest client record from Firestore or local cache before writing
  const all = getAllTravelers();
  let latestExisting: TravelerProfile | undefined = all[phone];
  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      latestExisting = mergeCloudClientWithLocal(snap.data() as TravelerProfile, all[phone]);
    }
  } catch {
    // Use local cache if offline
  }

  if (!latestExisting) {
    return { ok: false, error: 'لم يتم العثور على ملف العميل.' };
  }

  const nowIso = new Date().toISOString();
  const deliverable: IssuedDocument = {
    id: deliverableId,
    docTypeLabel: cleanLabel.slice(0, 160),
    fileName: uploadResult.fileName.slice(0, 220),
    mimeType: uploadResult.mimeType.slice(0, 120),
    downloadUrl: uploadResult.downloadUrl,
    storagePath: uploadResult.storagePath,
    ...(input.notes?.trim() ? { notes: input.notes.trim().slice(0, 300) } : {}),
    issuedAt: nowIso,
    ...(input.adminName?.trim() ? { issuedBy: input.adminName.trim().slice(0, 100) } : {}),
  };

  const deliverableNotification: ClientNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    titleAr: 'تم تنفيذ الطلب وإرفاق مستند',
    titleEn: 'Order Completed & Document Ready',
    bodyAr: `تم تنفيذ طلبك وإرفاق مستند: ${cleanLabel}، جاهز للتحميل الآن.`,
    bodyEn: `Your order has been completed and "${cleanLabel}" is ready to download now.`,
    type: 'deliverable',
    docId: deliverableId,
    createdAt: nowIso,
    read: false,
  };

  const updated: TravelerProfile = {
    ...latestExisting,
    orderStatus: 'تم تنفيذ الطلب',
    issuedDocuments: [deliverable, ...(latestExisting.issuedDocuments || [])].slice(0, 30),
    notifications: [deliverableNotification, ...(latestExisting.notifications || [])].slice(0, 30),
  };

  const latestAll = getAllTravelers();
  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  return { ok: true, profile: updated, deliverable };
}

export async function removeIssuedDeliverableCloud(
  rawPhone: string,
  docId: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  const target = (existing.issuedDocuments || []).find((d) => d.id === docId);
  if (target?.storagePath) {
    void deleteTravelerDocumentFromStorage(target.storagePath);
  }

  const updated: TravelerProfile = {
    ...existing,
    issuedDocuments: (existing.issuedDocuments || []).filter((d) => d.id !== docId),
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  return updated;
}

export async function markClientNotificationsReadCloud(
  rawPhone: string,
  notificationId?: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing || !existing.notifications || existing.notifications.length === 0) {
    return existing || null;
  }

  let changed = false;
  const nextNotifications = existing.notifications.map((n) => {
    if (!n.read && (!notificationId || n.id === notificationId)) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });

  if (!changed) return existing;

  const updated: TravelerProfile = {
    ...existing,
    notifications: nextNotifications,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  return updated;
}

export async function attachPreOrderFilesToTravelerCloud(
  rawPhone: string,
  input: {
    passportDataUrl?: string;
    passportFileName?: string;
    avatarDataUrl?: string;
    serviceTitle?: string;
  }
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  let nextAvatarUrl = existing.avatarUrl;
  let nextAvatarStoragePath = existing.avatarStoragePath;
  const addedDocs: TravelerDocument[] = [];

  if (input.avatarDataUrl && input.avatarDataUrl.startsWith('data:')) {
    const upAvatar = await uploadTravelerAvatarToStorage(phone, input.avatarDataUrl);
    if (upAvatar) {
      if (existing.avatarStoragePath && existing.avatarStoragePath !== upAvatar.storagePath) {
        void deleteTravelerDocumentFromStorage(existing.avatarStoragePath);
      }
      nextAvatarUrl = upAvatar.downloadUrl;
      nextAvatarStoragePath = upAvatar.storagePath;
    } else {
      nextAvatarUrl = input.avatarDataUrl;
    }
  }

  if (input.passportDataUrl && input.passportDataUrl.startsWith('data:')) {
    const docId = `pre-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const upPass = await uploadTravelerDocumentToStorage(phone, docId, input.passportDataUrl);
    addedDocs.push({
      id: docId,
      label: 'صورة جواز السفر (مرفوعة مع الطلب)',
      docType: 'passport',
      fileName: input.passportFileName || 'passport.jpg',
      dataUrl: upPass ? upPass.downloadUrl : input.passportDataUrl,
      ...(upPass ? { storagePath: upPass.storagePath } : {}),
      uploadedAt: new Date().toISOString(),
    });
  }

  const latestAll = getAllTravelers();
  const latest = latestAll[phone] || existing;
  const updated: TravelerProfile = {
    ...latest,
    ...(input.serviceTitle ? { preferredVisaType: input.serviceTitle.slice(0, 200) } : {}),
    ...(nextAvatarUrl ? { avatarUrl: nextAvatarUrl } : {}),
    ...(nextAvatarStoragePath ? { avatarStoragePath: nextAvatarStoragePath } : {}),
    documents: [...addedDocs, ...(latest.documents || [])].slice(0, 30),
  };

  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  return updated;
}

/**
 * Commits staged traveler draft edits, personal profile photo (avatar),
 * newly staged wallet/passport documents, and document removals in one atomic save.
 */
export async function commitTravelerProfileDraftCloud(
  rawPhone: string,
  draft: TravelerProfileDraft
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  // 1. Upload staged personal avatar if changed
  let nextAvatarUrl = existing.avatarUrl;
  let nextAvatarStoragePath = existing.avatarStoragePath;

  if (draft.pendingAvatarPreviewUrl) {
    if (draft.pendingAvatarPreviewUrl.startsWith('data:')) {
      const uploadedAvatar = await uploadTravelerAvatarToStorage(
        phone,
        draft.pendingAvatarPreviewUrl
      );
      if (uploadedAvatar) {
        if (existing.avatarStoragePath && existing.avatarStoragePath !== uploadedAvatar.storagePath) {
          void deleteTravelerDocumentFromStorage(existing.avatarStoragePath);
        }
        nextAvatarUrl = uploadedAvatar.downloadUrl;
        nextAvatarStoragePath = uploadedAvatar.storagePath;
      } else {
        // Offline local fallback (sanitizeClientForFirestore skips >4096 base64 from Firestore)
        nextAvatarUrl = draft.pendingAvatarPreviewUrl;
      }
    } else {
      nextAvatarUrl = draft.pendingAvatarPreviewUrl;
    }
  }

  // 2. Remove staged deletions
  const removedSet = new Set(draft.removedDocIds || []);
  const keptDocs: TravelerDocument[] = [];
  for (const docItem of existing.documents || []) {
    if (removedSet.has(docItem.id)) {
      if (docItem.storagePath) {
        void deleteTravelerDocumentFromStorage(docItem.storagePath);
      }
    } else {
      keptDocs.push(docItem);
    }
  }

  // 3. Upload newly staged documents
  const uploadedNewDocs: TravelerDocument[] = [];
  for (const staged of draft.pendingDocuments || []) {
    const uploaded = await uploadTravelerDocumentToStorage(phone, staged.id, staged.dataUrl);
    uploadedNewDocs.push({
      id: staged.id,
      label: staged.label,
      docType: staged.docType,
      fileName: staged.fileName,
      dataUrl: uploaded ? uploaded.downloadUrl : staged.dataUrl,
      ...(uploaded ? { storagePath: uploaded.storagePath } : {}),
      uploadedAt: new Date().toISOString(),
    });
  }

  const cleanFirst = draft.firstName.trim();
  const cleanLast = draft.lastName.trim();
  const fullDisplayName = `${cleanFirst} ${cleanLast}`.trim() || existing.name;

  // Re-read latest map in case snapshot arrived while uploading
  const latestAll = getAllTravelers();
  const latestExisting = latestAll[phone] || existing;

  const updated: TravelerProfile = {
    ...latestExisting,
    phone,
    phoneNormalized: phone,
    firstName: cleanFirst,
    lastName: cleanLast,
    name: fullDisplayName,
    passportFullName: draft.passportFullName.trim() || fullDisplayName,
    passportNumber: draft.passportNumber.trim().toUpperCase(),
    passportExpiryDate: draft.passportExpiryDate,
    nationality: draft.nationality.trim(),
    preferredVisaType: draft.preferredVisaType.trim(),
    ...(nextAvatarUrl ? { avatarUrl: nextAvatarUrl } : {}),
    ...(nextAvatarStoragePath ? { avatarStoragePath: nextAvatarStoragePath } : {}),
    documents: [...uploadedNewDocs, ...keptDocs],
  };

  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  return updated;
}

export async function saveFamilyMemberCloud(
  rawPhone: string,
  memberInput: {
    id?: string;
    relationship: FamilyRelationship;
    firstName: string;
    lastName: string;
    passportFullName?: string;
    passportNumber: string;
    passportExpiryDate?: string;
    nationality?: string;
    passportPhotoUrl: string;
    personalPhotoUrl: string;
  }
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existingProfile = all[phone];
  if (!existingProfile) return null;

  const memberId =
    memberInput.id || `fm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const existingMember = (existingProfile.familyMembers || []).find((m) => m.id === memberId);

  // Upload passport photo to Firebase Storage if a fresh dataUrl was provided
  let finalPassportPhotoUrl = memberInput.passportPhotoUrl || existingMember?.passportPhotoUrl || '';
  let finalPassportStoragePath = existingMember?.passportStoragePath;

  if (finalPassportPhotoUrl.startsWith('data:')) {
    const uploadedPassport = await uploadFamilyMemberFileToStorage(
      phone,
      memberId,
      'passport',
      finalPassportPhotoUrl
    );
    if (uploadedPassport) {
      if (
        existingMember?.passportStoragePath &&
        existingMember.passportStoragePath !== uploadedPassport.storagePath
      ) {
        void deleteTravelerDocumentFromStorage(existingMember.passportStoragePath);
      }
      finalPassportPhotoUrl = uploadedPassport.downloadUrl;
      finalPassportStoragePath = uploadedPassport.storagePath;
    }
  }

  // Upload personal photo to Firebase Storage if a fresh dataUrl was provided
  let finalPersonalPhotoUrl = memberInput.personalPhotoUrl || existingMember?.personalPhotoUrl || '';
  let finalPersonalStoragePath = existingMember?.personalPhotoStoragePath;

  if (finalPersonalPhotoUrl.startsWith('data:')) {
    const uploadedPersonal = await uploadFamilyMemberFileToStorage(
      phone,
      memberId,
      'photo',
      finalPersonalPhotoUrl
    );
    if (uploadedPersonal) {
      if (
        existingMember?.personalPhotoStoragePath &&
        existingMember.personalPhotoStoragePath !== uploadedPersonal.storagePath
      ) {
        void deleteTravelerDocumentFromStorage(existingMember.personalPhotoStoragePath);
      }
      finalPersonalPhotoUrl = uploadedPersonal.downloadUrl;
      finalPersonalStoragePath = uploadedPersonal.storagePath;
    }
  }

  const nowIso = new Date().toISOString();
  const cleanFirst = memberInput.firstName.trim();
  const cleanLast = memberInput.lastName.trim();

  const savedMember: FamilyMember = {
    id: memberId,
    relationship: memberInput.relationship,
    firstName: cleanFirst,
    lastName: cleanLast,
    ...(memberInput.passportFullName?.trim()
      ? { passportFullName: memberInput.passportFullName.trim() }
      : {}),
    passportNumber: memberInput.passportNumber.trim().toUpperCase(),
    ...(memberInput.passportExpiryDate
      ? { passportExpiryDate: memberInput.passportExpiryDate }
      : {}),
    ...(memberInput.nationality?.trim() ? { nationality: memberInput.nationality.trim() } : {}),
    passportPhotoUrl: finalPassportPhotoUrl,
    ...(finalPassportStoragePath ? { passportStoragePath: finalPassportStoragePath } : {}),
    personalPhotoUrl: finalPersonalPhotoUrl,
    ...(finalPersonalStoragePath ? { personalPhotoStoragePath: finalPersonalStoragePath } : {}),
    createdAt: existingMember?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  // Re-read latest map in case snapshot arrived while uploading
  const latestAll = getAllTravelers();
  const latestProfile = latestAll[phone] || existingProfile;
  const currentList = latestProfile.familyMembers || [];
  const existingIdx = currentList.findIndex((m) => m.id === memberId);

  const nextList =
    existingIdx >= 0
      ? currentList.map((m, idx) => (idx === existingIdx ? savedMember : m))
      : [...currentList, savedMember];

  const updated: TravelerProfile = {
    ...latestProfile,
    familyMembers: nextList,
  };

  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  return updated;
}

export async function deleteFamilyMemberCloud(
  rawPhone: string,
  memberId: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existingProfile = all[phone];
  if (!existingProfile) return null;

  const target = (existingProfile.familyMembers || []).find((m) => m.id === memberId);
  if (target?.passportStoragePath) {
    void deleteTravelerDocumentFromStorage(target.passportStoragePath);
  }
  if (target?.personalPhotoStoragePath) {
    void deleteTravelerDocumentFromStorage(target.personalPhotoStoragePath);
  }

  const updated: TravelerProfile = {
    ...existingProfile,
    familyMembers: (existingProfile.familyMembers || []).filter((m) => m.id !== memberId),
  };

  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  return updated;
}

export function deleteTravelerProfile(rawPhone: string): boolean {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return false;

  const docs = existing.documents || [];
  const familyMembers = existing.familyMembers || [];
  const issuedDocs = existing.issuedDocuments || [];
  const avatarPath = existing.avatarStoragePath;
  delete all[phone];
  saveAllTravelersLocalOnly(all);
  if (getActivePhone() === phone) {
    setActiveTravelerPhone(null);
  }

  // Cleanup Storage assets + Firestore document
  if (avatarPath) {
    void deleteTravelerDocumentFromStorage(avatarPath);
  }
  docs.forEach((d) => {
    if (d.storagePath) {
      void deleteTravelerDocumentFromStorage(d.storagePath);
    }
  });
  issuedDocs.forEach((d) => {
    if (d.storagePath) {
      void deleteTravelerDocumentFromStorage(d.storagePath);
    }
  });
  familyMembers.forEach((fm) => {
    if (fm.passportStoragePath) {
      void deleteTravelerDocumentFromStorage(fm.passportStoragePath);
    }
    if (fm.personalPhotoStoragePath) {
      void deleteTravelerDocumentFromStorage(fm.personalPhotoStoragePath);
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

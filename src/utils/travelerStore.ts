import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AccountType,
  ActiveSessionMode,
  ActiveSessionRecord,
  AppointmentDetails,
  CanonicalVisaOrderStatus,
  ClientNotification,
  DocumentReviewStatus,
  FamilyMember,
  FamilyRelationship,
  IssuedDocument,
  PendingDeviceRequest,
  PendingLoginRequest,
  PublicOrderStatusSummary,
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
  MAX_IMAGE_BYTES,
  STORAGE_FREE_LIMIT_BYTES,
  deleteTravelerDocumentFromStorage,
  estimateDataUrlBytes,
  uploadChatAttachmentToDrive,
  uploadFamilyMemberFileToStorage,
  uploadIssuedDeliverableToStorage,
  uploadTravelerAvatarToStorage,
  uploadTravelerDocumentToStorage,
} from './firebaseStorageHelper';
import { sendChatMessageCloud } from './chatStore';
import { dispatchRemotePushNotification } from './fcmPushService';
import { getSiteConfig } from './siteConfigStore';
import { getCmsState } from './cmsStore';

const TRAVELERS_STORAGE_KEY = 'masarik_travelers_v1';
const ACTIVE_PHONE_STORAGE_KEY = 'masarik_active_phone_v1';
const PENDING_VERIFICATION_PHONE_KEY = 'masarik_pending_verification_phone_v1';
const ADMIN_PIN_STORAGE_KEY = 'masarik_admin_pin_v1';
const ADMIN_PIN_HASH_STORAGE_KEY = 'masarik_admin_pin_hash_v1';
const DEFAULT_ADMIN_PIN = '202200';

export const OFFICIAL_SITE_BASE_URL = 'https://masarik-tourism.github.io/';
export const COMPANY_WHATSAPP_NUMBER = '201128440008';
export const OTP_ACTIVATION_WHATSAPP_NUMBER = COMPANY_WHATSAPP_NUMBER;
export const OTP_VALIDITY_MS = 24 * 60 * 60 * 1000;

export function getPendingVerificationPhone(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_VERIFICATION_PHONE_KEY);
    if (!raw) return null;
    const norm = normalizePhone(raw);
    return /^[0-9]{8,20}$/.test(norm) ? norm : null;
  } catch {
    return null;
  }
}

export function setPendingVerificationPhone(rawPhone: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!rawPhone) {
      window.localStorage.removeItem(PENDING_VERIFICATION_PHONE_KEY);
      return;
    }
    const norm = normalizePhone(rawPhone);
    if (/^[0-9]{8,20}$/.test(norm)) {
      window.localStorage.setItem(PENDING_VERIFICATION_PHONE_KEY, norm);
    } else {
      window.localStorage.removeItem(PENDING_VERIFICATION_PHONE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

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

export function buildOrderCodeFromPhone(rawPhone?: string): string {
  const digits = normalizePhone(rawPhone || '').replace(/\D/g, '');
  if (!digits) return 'MSK-000000';
  const suffix = digits.slice(-6).padStart(6, '0');
  return `MSK-${suffix}`;
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

export function digitsOnly(raw: string, maxLength?: number): string {
  const clean = normalizeArabicDigits(raw || '').replace(/\D/g, '');
  return typeof maxLength === 'number' ? clean.slice(0, maxLength) : clean;
}

export function normalizePhone(rawPhone: string): string {
  const digits = digitsOnly(rawPhone);
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

export function isOtpActiveAndUnexpired(profile?: Partial<TravelerProfile> | null): boolean {
  if (!profile) return false;
  if (!/^\d{6}$/.test(String(profile.otp || ''))) return false;
  if (profile.otpConsumed === true) return false;
  if (profile.otpExpiresAt) {
    const expMs = Date.parse(profile.otpExpiresAt);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      return false;
    }
    return true;
  }
  const genMs = Date.parse(profile.otpGeneratedAt || profile.createdAt || '');
  if (Number.isFinite(genMs)) {
    return genMs + OTP_VALIDITY_MS > Date.now();
  }
  return false;
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
        // Never push multi-KB raw base64 blobs into Firestore; store Storage/Drive URLs only
        dataUrl: d.dataUrl && d.dataUrl.length <= 4096 ? d.dataUrl : '',
        ...(d.viewUrl && d.viewUrl.length <= 4096 ? { viewUrl: String(d.viewUrl) } : {}),
        ...(d.storagePath ? { storagePath: String(d.storagePath).slice(0, 300) } : {}),
        ...(typeof d.sizeBytes === 'number'
          ? { sizeBytes: Math.max(0, Math.round(d.sizeBytes)) }
          : {}),
        uploadedAt: String(d.uploadedAt || new Date().toISOString()).slice(0, 64),
        ...(d.status &&
        ['pending_completion', 'received', 'completed'].includes(d.status)
          ? { status: d.status }
          : {}),
        ...(d.statusNote ? { statusNote: String(d.statusNote).trim().slice(0, 300) } : {}),
        ...(d.statusUpdatedAt
          ? { statusUpdatedAt: String(d.statusUpdatedAt).slice(0, 64) }
          : {}),
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
          ...(typeof m.passportSizeBytes === 'number'
            ? { passportSizeBytes: Math.max(0, Math.round(m.passportSizeBytes)) }
            : {}),
          personalPhotoUrl:
            m.personalPhotoUrl && m.personalPhotoUrl.length <= 4096 ? m.personalPhotoUrl : '',
          ...(m.personalPhotoStoragePath
            ? { personalPhotoStoragePath: String(m.personalPhotoStoragePath).slice(0, 300) }
            : {}),
          ...(typeof m.personalPhotoSizeBytes === 'number'
            ? { personalPhotoSizeBytes: Math.max(0, Math.round(m.personalPhotoSizeBytes)) }
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

  const validLoginRequests: PendingLoginRequest[] = Array.isArray(profile.pendingLoginRequests)
    ? profile.pendingLoginRequests
        .filter(
          (r) =>
            r &&
            typeof r.requestId === 'string' &&
            r.requestId.trim().length >= 6 &&
            typeof r.deviceId === 'string' &&
            r.deviceId.trim().length >= 8
        )
        .slice(0, 10)
        .map((r) => ({
          requestId: String(r.requestId).slice(0, 80),
          deviceId: String(r.deviceId).slice(0, 64),
          deviceLabel: String(r.deviceLabel || 'Web Device').trim().slice(0, 120) || 'Web Device',
          status: (['pending', 'approved', 'rejected', 'expired'].includes(r.status)
            ? r.status
            : 'pending') as PendingLoginRequest['status'],
          createdAt: String(r.createdAt || new Date().toISOString()).slice(0, 64),
          expiresAt: String(
            r.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString()
          ).slice(0, 64),
          ...(r.respondedAt ? { respondedAt: String(r.respondedAt).slice(0, 64) } : {}),
        }))
    : [];

  const validPendingDevices: PendingDeviceRequest[] = Array.isArray(profile.pendingDevices)
    ? profile.pendingDevices
        .filter(
          (r) =>
            r &&
            typeof r.requestId === 'string' &&
            r.requestId.trim().length >= 6 &&
            typeof r.deviceId === 'string' &&
            /^[a-zA-Z0-9_\-]{8,64}$/.test(r.deviceId)
        )
        .slice(0, 15)
        .map((r) => ({
          requestId: String(r.requestId).slice(0, 80),
          ...(r.phoneId ? { phoneId: String(r.phoneId).slice(0, 20) } : {}),
          deviceId: String(r.deviceId).slice(0, 64),
          deviceName: String(r.deviceName || 'Web Device').trim().slice(0, 120) || 'Web Device',
          status: ([
            'pending',
            'approved_trusted',
            'approved_temporary',
            'rejected',
            'blocked',
            'expired',
          ].includes(r.status)
            ? r.status
            : 'pending') as PendingDeviceRequest['status'],
          ...(r.approvalMode === 'trusted' || r.approvalMode === 'temporary'
            ? { approvalMode: r.approvalMode }
            : {}),
          ...(typeof r.temporaryDurationHours === 'number' &&
          Number.isInteger(r.temporaryDurationHours) &&
          r.temporaryDurationHours >= 1 &&
          r.temporaryDurationHours <= 24
            ? { temporaryDurationHours: r.temporaryDurationHours as 1 | 24 }
            : {}),
          createdAt: String(r.createdAt || new Date().toISOString()).slice(0, 64),
          expiresAt: String(
            r.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString()
          ).slice(0, 64),
          ...(r.respondedAt ? { respondedAt: String(r.respondedAt).slice(0, 64) } : {}),
        }))
    : [];

  const validActiveSessions: ActiveSessionRecord[] = Array.isArray(profile.activeSessions)
    ? profile.activeSessions
        .filter(
          (s) =>
            s &&
            typeof s.sessionId === 'string' &&
            s.sessionId.trim().length >= 6 &&
            typeof s.deviceId === 'string' &&
            s.deviceId.trim().length >= 8
        )
        .slice(0, 20)
        .map((s) => ({
          sessionId: String(s.sessionId).slice(0, 100),
          deviceId: String(s.deviceId).slice(0, 64),
          deviceName: String(s.deviceName || 'Web Device').trim().slice(0, 120) || 'Web Device',
          mode: (s.mode === 'temporary' ? 'temporary' : 'trusted') as ActiveSessionMode,
          loggedInAt: String(s.loggedInAt || new Date().toISOString()).slice(0, 64),
          lastActiveAt: String(s.lastActiveAt || new Date().toISOString()).slice(0, 64),
          expiresAt: s.expiresAt ? String(s.expiresAt).slice(0, 64) : null,
          ...(s.authMethod && ['pin', 'otp', 'approval'].includes(s.authMethod)
            ? { authMethod: s.authMethod }
            : {}),
        }))
    : [];

  const validBlockedDevices: string[] = Array.isArray(profile.blockedDevices)
    ? Array.from(
        new Set(
          profile.blockedDevices
            .map((id) => String(id || '').trim().slice(0, 64))
            .filter((id) => id.length >= 8)
        )
      ).slice(0, 25)
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
          ...(d.viewUrl && d.viewUrl.length <= 4096 ? { viewUrl: String(d.viewUrl) } : {}),
          ...(d.storagePath ? { storagePath: String(d.storagePath).slice(0, 300) } : {}),
          ...(typeof d.fileSizeBytes === 'number'
            ? { fileSizeBytes: Math.max(0, Math.round(d.fileSizeBytes)) }
            : {}),
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
    orderCode: String(profile.orderCode || buildOrderCodeFromPhone(normalized)).slice(0, 40),
    accountType: profile.accountType === 'b2b_partner' ? 'b2b_partner' : 'individual',
    ...(profile.companyName
      ? { companyName: String(profile.companyName).trim().slice(0, 160) }
      : {}),
    ...(profile.contactPersonName
      ? { contactPersonName: String(profile.contactPersonName).trim().slice(0, 120) }
      : {}),
    ...(typeof profile.isOnline === 'boolean' ? { isOnline: profile.isOnline } : {}),
    ...(profile.lastSeenAt
      ? { lastSeenAt: String(profile.lastSeenAt).slice(0, 64) }
      : {}),
    firstName,
    lastName,
    name: combinedName,
    otp: safeOtp,
    ...(profile.otpGeneratedAt
      ? { otpGeneratedAt: String(profile.otpGeneratedAt).slice(0, 64) }
      : {}),
    ...(profile.otpExpiresAt
      ? { otpExpiresAt: String(profile.otpExpiresAt).slice(0, 64) }
      : {}),
    ...(typeof profile.otpConsumed === 'boolean' ? { otpConsumed: profile.otpConsumed } : {}),
    ...(typeof profile.activatedByAdmin === 'boolean'
      ? { activatedByAdmin: profile.activatedByAdmin }
      : {}),
    ...(profile.adminBypassOtpAt
      ? { adminBypassOtpAt: String(profile.adminBypassOtpAt).slice(0, 64) }
      : {}),
    verified: Boolean(profile.verified),
    accountStatus: profile.verified ? 'verified' : 'pending_verification',
    createdAt: String(profile.createdAt || new Date().toISOString()).slice(0, 64),
    updatedAt: new Date().toISOString(),
    orderStatus: safeStatus,
    documents: safeDocs,
    familyMembers: safeFamilyMembers,
    trustedDevices: validDevices,
    ...(validLoginRequests.length > 0 ? { pendingLoginRequests: validLoginRequests } : {}),
    ...(validPendingDevices.length > 0 || Array.isArray(profile.pendingDevices)
      ? { pendingDevices: validPendingDevices }
      : {}),
    ...(validActiveSessions.length > 0 || Array.isArray(profile.activeSessions)
      ? { activeSessions: validActiveSessions }
      : {}),
    ...(validBlockedDevices.length > 0 || Array.isArray(profile.blockedDevices)
      ? { blockedDevices: validBlockedDevices }
      : {}),
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
  if (profile.avatarSizeBytes !== undefined && typeof profile.avatarSizeBytes === 'number') {
    payload.avatarSizeBytes = Math.max(0, Math.round(profile.avatarSizeBytes));
  }
  if (profile.appointmentDetails && typeof profile.appointmentDetails === 'object') {
    const appt = profile.appointmentDetails;
    const sType = String(appt.serviceType || '').trim().slice(0, 160);
    const aDate = String(appt.appointmentDate || '').trim().slice(0, 40);
    const aTime = String(appt.appointmentTime || '').trim().slice(0, 40);
    const aLoc = String(appt.location || '').trim().slice(0, 200);
    const aRef = String(appt.referenceNumber || '').trim().slice(0, 80);
    if (sType || aDate || aTime) {
      const cleanAppt: AppointmentDetails = {
        serviceType:
          sType ||
          String(profile.preferredVisaType || 'موعد خدمة سياحية').trim().slice(0, 160),
        appointmentDate: aDate,
        appointmentTime: aTime,
        ...(aLoc ? { location: aLoc } : {}),
        ...(aRef ? { referenceNumber: aRef } : {}),
        updatedAt: String(appt.updatedAt || new Date().toISOString()).slice(0, 64),
      };
      payload.appointmentDetails = cleanAppt;
    }
  }
  const normalizedTokens = normalizeFcmTokenList(profile.fcmTokens, profile.fcmToken, 10);
  if (profile.fcmToken) {
    payload.fcmToken = String(profile.fcmToken).trim().slice(0, 512);
  } else if (normalizedTokens.length > 0) {
    payload.fcmToken = normalizedTokens[0];
  }
  if (normalizedTokens.length > 0 || Array.isArray(profile.fcmTokens)) {
    payload.fcmTokens = normalizedTokens;
  }
  if (profile.fcmUpdatedAt) {
    payload.fcmUpdatedAt = String(profile.fcmUpdatedAt).slice(0, 64);
  }
  if (typeof profile.pushNotificationsEnabled === 'boolean') {
    payload.pushNotificationsEnabled = profile.pushNotificationsEnabled;
  }

  return payload;
}

function normalizeFcmTokenList(
  existingTokens?: unknown,
  primaryToken?: string,
  max = 10
): string[] {
  const prev = Array.isArray(existingTokens)
    ? existingTokens
        .map((t) => String(t || '').trim())
        .filter((t) => t.length >= 10 && t.length <= 512)
    : [];
  const cleanPrimary = String(primaryToken || '').trim().slice(0, 512);
  if (cleanPrimary.length >= 10) {
    return [cleanPrimary, ...prev.filter((t) => t !== cleanPrimary)].slice(0, max);
  }
  return Array.from(new Set(prev)).slice(0, max);
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
          ...(d.viewUrl || localDoc?.viewUrl ? { viewUrl: d.viewUrl || localDoc?.viewUrl } : {}),
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
          ...(d.viewUrl || localDoc?.viewUrl ? { viewUrl: d.viewUrl || localDoc?.viewUrl } : {}),
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
    orderCode: cloudData.orderCode || buildOrderCodeFromPhone(cloudData.phone),
    accountType:
      cloudData.accountType === 'b2b_partner' || localExisting?.accountType === 'b2b_partner'
        ? cloudData.accountType || localExisting?.accountType || 'individual'
        : 'individual',
    companyName: cloudData.companyName ?? localExisting?.companyName,
    contactPersonName: cloudData.contactPersonName ?? localExisting?.contactPersonName,
    isOnline:
      typeof cloudData.isOnline === 'boolean' ? cloudData.isOnline : localExisting?.isOnline,
    lastSeenAt: cloudData.lastSeenAt || localExisting?.lastSeenAt,
    accountStatus:
      cloudData.accountStatus ||
      (cloudData.verified ? 'verified' : 'pending_verification'),
    firstName: cloudData.firstName || split.firstName,
    lastName: cloudData.lastName || split.lastName,
    otpGeneratedAt: cloudData.otpGeneratedAt || localExisting?.otpGeneratedAt,
    otpExpiresAt: cloudData.otpExpiresAt || localExisting?.otpExpiresAt,
    otpConsumed:
      typeof cloudData.otpConsumed === 'boolean'
        ? cloudData.otpConsumed
        : localExisting?.otpConsumed,
    activatedByAdmin:
      typeof cloudData.activatedByAdmin === 'boolean'
        ? cloudData.activatedByAdmin
        : localExisting?.activatedByAdmin,
    adminBypassOtpAt: cloudData.adminBypassOtpAt || localExisting?.adminBypassOtpAt,
    pinHash: cloudData.pinHash || localExisting?.pinHash || undefined,
    pinUpdatedAt: cloudData.pinUpdatedAt || localExisting?.pinUpdatedAt || undefined,
    trustedDevices: Array.isArray(cloudData.trustedDevices)
      ? cloudData.trustedDevices
      : localExisting?.trustedDevices || [],
    pendingLoginRequests: Array.isArray(cloudData.pendingLoginRequests)
      ? cloudData.pendingLoginRequests
      : localExisting?.pendingLoginRequests || [],
    pendingDevices: Array.isArray(cloudData.pendingDevices)
      ? cloudData.pendingDevices
      : localExisting?.pendingDevices || [],
    activeSessions: Array.isArray(cloudData.activeSessions)
      ? cloudData.activeSessions
      : localExisting?.activeSessions || [],
    blockedDevices: Array.isArray(cloudData.blockedDevices)
      ? cloudData.blockedDevices
      : localExisting?.blockedDevices || [],
    avatarUrl: cloudData.avatarUrl || localExisting?.avatarUrl || undefined,
    avatarStoragePath: cloudData.avatarStoragePath || localExisting?.avatarStoragePath || undefined,
    avatarSizeBytes:
      typeof cloudData.avatarSizeBytes === 'number'
        ? cloudData.avatarSizeBytes
        : localExisting?.avatarSizeBytes,
    appointmentDetails: cloudData.appointmentDetails || localExisting?.appointmentDetails,
    documents: mergedDocs,
    familyMembers: mergedFamilyMembers,
    issuedDocuments: mergedIssuedDocs,
    notifications: mergedNotifications,
    fcmToken: cloudData.fcmToken || localExisting?.fcmToken,
    fcmTokens: normalizeFcmTokenList(
      [
        ...(Array.isArray(cloudData.fcmTokens) ? cloudData.fcmTokens : []),
        ...(Array.isArray(localExisting?.fcmTokens) ? localExisting.fcmTokens : []),
      ],
      cloudData.fcmToken || localExisting?.fcmToken,
      10
    ),
    fcmUpdatedAt: cloudData.fcmUpdatedAt || localExisting?.fcmUpdatedAt,
    pushNotificationsEnabled:
      typeof cloudData.pushNotificationsEnabled === 'boolean'
        ? cloudData.pushNotificationsEnabled
        : localExisting?.pushNotificationsEnabled,
  };
}

export async function syncPublicOrderStatusDoc(profile: TravelerProfile): Promise<void> {
  const phone = normalizePhone(profile.phone);
  if (!/^[0-9]{8,20}$/.test(phone)) return;

  const summary: PublicOrderStatusSummary = {
    phoneId: phone,
    orderCode: (profile.orderCode || buildOrderCodeFromPhone(phone)).toUpperCase().slice(0, 32),
    orderStatus: normalizeOrderStatusValue(profile.orderStatus),
    hasIssuedDocuments: Array.isArray(profile.issuedDocuments) && profile.issuedDocuments.length > 0,
    updatedAt: String(profile.updatedAt || new Date().toISOString()).slice(0, 64),
  };

  try {
    await setDoc(doc(db, 'order_status', phone), summary);
  } catch (err) {
    console.warn('Public order_status sync skipped:', err);
  }
}

/**
 * Non-PII public lookup by Order Reference Code (e.g. MSK-5002428) OR Phone Number.
 * Strictly returns ONLY general order status and whether final documents exist—never any personal info.
 */
export async function lookupPublicOrderStatusCloud(rawQuery: string): Promise<{
  found: boolean;
  statusSummary?: PublicOrderStatusSummary;
}> {
  const trimmed = normalizeArabicDigits(rawQuery || '').trim();
  if (!trimmed || trimmed.length < 4) {
    return { found: false };
  }

  const upperCode = trimmed.toUpperCase().replace(/\s+/g, '');
  const normalizedCodeCandidate = upperCode.startsWith('MSK-')
    ? upperCode
    : /^[0-9]{6}$/.test(upperCode)
    ? `MSK-${upperCode}`
    : null;

  const phoneDigits = normalizePhone(trimmed);
  const isPhoneLike = /^[0-9]{8,20}$/.test(phoneDigits) && !upperCode.startsWith('MSK-');

  // 1. Direct lookup on non-PII /order_status by phone
  if (isPhoneLike) {
    try {
      const snap = await getDoc(doc(db, 'order_status', phoneDigits));
      if (snap.exists()) {
        const data = snap.data() as PublicOrderStatusSummary;
        return { found: true, statusSummary: data };
      }
    } catch {
      // Continue to fallback
    }
  }

  // 2. Lookup on non-PII /order_status by exact orderCode
  if (normalizedCodeCandidate) {
    try {
      const q = query(
        collection(db, 'order_status'),
        where('orderCode', '==', normalizedCodeCandidate),
        limit(1)
      );
      const snaps = await getDocs(q);
      if (!snaps.empty) {
        return {
          found: true,
          statusSummary: snaps.docs[0].data() as PublicOrderStatusSummary,
        };
      }
    } catch {
      // Continue to legacy client fallback
    }
  }

  // 3. Fallback for legacy clients created prior to /order_status split (extracts ONLY non-PII status fields)
  if (isPhoneLike) {
    try {
      const clientSnap = await getDoc(doc(db, 'clients', phoneDigits));
      if (clientSnap.exists()) {
        const cData = clientSnap.data() as TravelerProfile;
        const summary: PublicOrderStatusSummary = {
          phoneId: phoneDigits,
          orderCode: cData.orderCode || buildOrderCodeFromPhone(phoneDigits),
          orderStatus: normalizeOrderStatusValue(cData.orderStatus),
          hasIssuedDocuments: Array.isArray(cData.issuedDocuments) && cData.issuedDocuments.length > 0,
          updatedAt: String(cData.updatedAt || cData.createdAt || new Date().toISOString()).slice(0, 64),
        };
        return { found: true, statusSummary: summary };
      }
    } catch {
      // Ignore offline
    }
  }

  // 4. Local cache fallback (extracting strictly non-PII status only)
  const localMap = getAllTravelers();
  const matchedLocal = Object.values(localMap).find((tr) => {
    const code = (tr.orderCode || buildOrderCodeFromPhone(tr.phone)).toUpperCase();
    return (
      (isPhoneLike && normalizePhone(tr.phone) === phoneDigits) ||
      (normalizedCodeCandidate && code === normalizedCodeCandidate)
    );
  });

  if (matchedLocal) {
    return {
      found: true,
      statusSummary: {
        phoneId: normalizePhone(matchedLocal.phone),
        orderCode: matchedLocal.orderCode || buildOrderCodeFromPhone(matchedLocal.phone),
        orderStatus: normalizeOrderStatusValue(matchedLocal.orderStatus),
        hasIssuedDocuments:
          Array.isArray(matchedLocal.issuedDocuments) && matchedLocal.issuedDocuments.length > 0,
        updatedAt: String(
          matchedLocal.updatedAt || matchedLocal.createdAt || new Date().toISOString()
        ).slice(0, 64),
      },
    };
  }

  return { found: false };
}

export async function syncTravelerToCloud(profile: TravelerProfile): Promise<void> {
  const phone = normalizePhone(profile.phone);
  if (!/^[0-9]{8,20}$/.test(phone)) return;

  const path = `clients/${phone}`;
  const payload = sanitizeClientForFirestore({ ...profile, phone, phoneNormalized: phone });
  try {
    await setDoc(doc(db, 'clients', phone), payload);
    await syncPublicOrderStatusDoc({
      ...profile,
      phone,
      orderCode: String(payload.orderCode || buildOrderCodeFromPhone(phone)),
      updatedAt: String(payload.updatedAt || new Date().toISOString()),
    });
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
      const merged = mergeCloudClientWithLocal(cloudProfile, all[normalized]);
      all[normalized] = merged;
      saveAllTravelersLocalOnly(all);

      const meta = readStoredSessionMeta();
      if (!meta || meta.phone !== normalized) return;

      // 1. Immediate block check: if current device is in blockedDevices, terminate session instantly
      if (
        Array.isArray(merged.blockedDevices) &&
        merged.blockedDevices.includes(meta.deviceId)
      ) {
        logoutTravelerSession('manual');
        return;
      }

      // 2. Real-time activeSessions tracking (remote kick-out, expiry sync & trust promotion)
      const cloudSessions = Array.isArray(cloudProfile.activeSessions)
        ? cloudProfile.activeSessions
        : null;
      const cloudSession =
        cloudSessions && meta.sessionId
          ? cloudSessions.find((s) => s.sessionId === meta.sessionId)
          : undefined;

      if (
        meta.sessionId &&
        meta.cloudRegistered &&
        cloudSessions !== null &&
        Date.now() - meta.startedAt > 5000 &&
        !cloudSession
      ) {
        // Session was remotely kicked / logged out from another trusted device
        logoutTravelerSession('manual');
        return;
      }

      if (cloudSession) {
        if (cloudSession.expiresAt) {
          const cloudExpMs = Date.parse(cloudSession.expiresAt);
          if (Number.isFinite(cloudExpMs)) {
            if (Date.now() >= cloudExpMs) {
              // Session duration expired -> remove from Firestore & log out immediately
              const remaining = (cloudSessions || []).filter(
                (s) => s.sessionId !== cloudSession.sessionId
              );
              void updateDoc(doc(db, 'clients', normalized), {
                activeSessions: remaining,
                updatedAt: new Date().toISOString(),
              }).catch(() => {});
              logoutTravelerSession('expired');
              return;
            }
            if (
              meta.mode !== cloudSession.mode ||
              meta.expiresAt === null ||
              Math.abs((meta.expiresAt || 0) - cloudExpMs) > 1500
            ) {
              const nextMeta: TravelerSessionMeta = {
                ...meta,
                mode: cloudSession.mode,
                expiresAt: cloudExpMs,
                persistInLocalStorage: cloudSession.mode === 'trusted' ? true : meta.persistInLocalStorage ?? true,
                cloudRegistered: true,
              };
              try {
                if (nextMeta.persistInLocalStorage || nextMeta.mode === 'trusted') {
                  window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
                  window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, normalized);
                }
              } catch {
                // Ignore storage error
              }
              writeStoredSessionMeta(nextMeta);
              emitUpdateEvent();
            }
          }
        } else if (cloudSession.mode === 'trusted' && (meta.mode !== 'trusted' || meta.expiresAt !== null)) {
          // Promoted remotely to Permanent Trusted Session
          const nextMeta: TravelerSessionMeta = {
            ...meta,
            mode: 'trusted',
            expiresAt: null,
            persistInLocalStorage: true,
            cloudRegistered: true,
          };
          try {
            window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
            window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, normalized);
          } catch {
            // Ignore storage error
          }
          writeStoredSessionMeta(nextMeta);
          emitUpdateEvent();
        }
        return;
      }

      // 3. Fallback legacy revocation check when device has no sessionId registered yet
      if (
        meta.mode === 'trusted' &&
        Date.now() - meta.startedAt > 6000 &&
        !isDeviceInTrustedList(merged.trustedDevices, meta.deviceId)
      ) {
        logoutTravelerSession('manual');
      }
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

/**
 * Real-time listener used on the OTP verification screen so that when the General Manager
 * taps "تفعيل الحساب فوراً (بدون OTP)", the waiting client screen immediately advances to PIN/Device Trust setup.
 */
export function subscribePendingClientCloud(
  rawPhone: string | null,
  onUpdate: (profile: TravelerProfile) => void
): () => void {
  const normalized = rawPhone ? normalizePhone(rawPhone) : '';
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
      const merged = mergeCloudClientWithLocal(cloudProfile, all[normalized]);
      all[normalized] = merged;
      saveAllTravelersLocalOnly(all);
      onUpdate(merged);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.GET, path);
      }
      console.warn('Pending client OTP listener warning:', msg);
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
  const meta = readStoredSessionMeta();
  if (!meta) return null;

  const isSessionOnlyTemp = meta.mode === 'temporary' && meta.persistInLocalStorage !== true;
  let activePhone: string | null = null;
  try {
    activePhone = isSessionOnlyTemp
      ? window.sessionStorage.getItem(ACTIVE_PHONE_STORAGE_KEY)
      : window.localStorage.getItem(ACTIVE_PHONE_STORAGE_KEY);
  } catch {
    activePhone = null;
  }

  if (!activePhone || meta.phone !== activePhone) return null;
  if (meta.expiresAt && Date.now() >= meta.expiresAt) {
    try {
      window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
      window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
    } catch {
      // Ignore
    }
    writeStoredSessionMeta(null);
    markSessionExpiredNotice();
    emitUpdateEvent();
    return null;
  }
  return meta;
}

export function getActivePhone(): string | null {
  if (typeof window === 'undefined') return null;
  const meta = readStoredSessionMeta();
  try {
    const tempPhone = window.sessionStorage.getItem(ACTIVE_PHONE_STORAGE_KEY);
    if (tempPhone) {
      if (meta && meta.phone === tempPhone && meta.expiresAt && Date.now() >= meta.expiresAt) {
        window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
        writeStoredSessionMeta(null);
        markSessionExpiredNotice();
        return null;
      }
      return tempPhone;
    }

    const persistentPhone = window.localStorage.getItem(ACTIVE_PHONE_STORAGE_KEY);
    if (!persistentPhone) return null;
    if (
      !meta ||
      meta.phone !== persistentPhone ||
      (meta.mode === 'temporary' && meta.persistInLocalStorage !== true)
    ) {
      window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
      return null;
    }
    if (meta.expiresAt && Date.now() >= meta.expiresAt) {
      window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
      writeStoredSessionMeta(null);
      markSessionExpiredNotice();
      return null;
    }
    return persistentPhone;
  } catch {
    return null;
  }
}

export function getActiveTraveler(): TravelerProfile | null {
  const activePhone = getActivePhone();
  if (!activePhone) return null;
  const all = getAllTravelers();
  const profile = all[activePhone];
  if (!profile || !profile.verified || profile.accountStatus === 'pending_verification') {
    return null;
  }
  return profile;
}

export function setActiveTravelerPhone(phone: string | null): void {
  if (typeof window === 'undefined') return;
  if (phone) {
    const cleanPhone = normalizePhone(phone);
    window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, cleanPhone);
  } else {
    window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
    window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
    writeStoredSessionMeta(null);
  }
  emitUpdateEvent();
}

export function startTravelerSession(
  rawPhone: string,
  mode: 'trusted' | 'temporary',
  options?: {
    sessionId?: string;
    customExpiresAtMs?: number | null;
    persistInLocalStorage?: boolean;
    cloudRegistered?: boolean;
  }
): TravelerSessionMeta {
  const phone = normalizePhone(rawPhone);
  const { deviceId } = getDeviceFingerprint();
  const now = Date.now();
  const persistInLocalStorage = options?.persistInLocalStorage ?? mode === 'trusted';
  const expiresAt =
    options?.customExpiresAtMs !== undefined
      ? options.customExpiresAtMs
      : mode === 'temporary'
      ? now + TEMPORARY_SESSION_DURATION_MS
      : null;
  const sessionId =
    options?.sessionId ||
    `sess_${deviceId.slice(0, 12)}_${now}_${Math.random().toString(36).slice(2, 6)}`;

  const meta: TravelerSessionMeta = {
    sessionId,
    phone,
    mode,
    deviceId,
    startedAt: now,
    expiresAt,
    persistInLocalStorage,
    cloudRegistered: Boolean(options?.cloudRegistered),
  };
  if (typeof window !== 'undefined') {
    try {
      if (mode === 'temporary' && !persistInLocalStorage) {
        // Temporary browser-only sessions live inside sessionStorage so closing browser auto-expires immediately
        window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
        window.sessionStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, phone);
      } else {
        window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
        window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, phone);
      }
    } catch {
      // Ignore
    }
    writeStoredSessionMeta(meta);
    emitUpdateEvent();
  }
  return meta;
}

export const ONLINE_HEARTBEAT_TIMEOUT_MS = 85 * 1000;

export function isUserCurrentlyOnline(profile?: Partial<TravelerProfile> | null): boolean {
  if (!profile || profile.isOnline !== true) return false;
  if (!profile.lastSeenAt) return true;
  const lastMs = Date.parse(profile.lastSeenAt);
  if (!Number.isFinite(lastMs)) return true;
  return Date.now() - lastMs <= ONLINE_HEARTBEAT_TIMEOUT_MS;
}

export function formatLastSeenRelative(
  lastSeenAt?: string,
  isOnline?: boolean,
  lang: 'ar' | 'en' = 'ar'
): string {
  if (isOnline) {
    return lang === 'en' ? 'Online now' : 'متصل الآن';
  }
  if (!lastSeenAt) {
    return lang === 'en' ? 'Not signed in yet' : 'لم يسجل دخول بعد';
  }
  const ts = Date.parse(lastSeenAt);
  if (!Number.isFinite(ts)) {
    return lang === 'en' ? 'Offline' : 'غير متصل';
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) {
    return lang === 'en' ? 'Last seen moments ago' : 'آخر ظهور منذ لحظات';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return lang === 'en'
      ? `Last seen ${diffMin}m ago`
      : `آخر ظهور منذ ${diffMin} ${diffMin === 1 ? 'دقيقة' : diffMin <= 10 ? 'دقائق' : 'دقيقة'}`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return lang === 'en'
      ? `Last seen ${diffHours}h ago`
      : `آخر ظهور منذ ${diffHours === 1 ? 'ساعة' : diffHours === 2 ? 'ساعتين' : `${diffHours} ساعات`}`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return lang === 'en'
      ? `Last seen ${diffDays}d ago`
      : `آخر ظهور منذ ${diffDays === 1 ? 'يوم' : diffDays === 2 ? 'يومين' : `${diffDays} أيام`}`;
  }
  return lang === 'en'
    ? `Last seen ${lastSeenAt.slice(0, 10)}`
    : `آخر ظهور ${lastSeenAt.slice(0, 10)}`;
}

export function sortProfilesByPresence(profiles: TravelerProfile[]): TravelerProfile[] {
  return [...profiles].sort((a, b) => {
    const aOnline = isUserCurrentlyOnline(a) ? 1 : 0;
    const bOnline = isUserCurrentlyOnline(b) ? 1 : 0;
    if (aOnline !== bOnline) {
      return bOnline - aOnline;
    }
    const aTs = Date.parse(a.lastSeenAt || a.updatedAt || a.createdAt || '') || 0;
    const bTs = Date.parse(b.lastSeenAt || b.updatedAt || b.createdAt || '') || 0;
    return bTs - aTs;
  });
}

export async function updateUserPresenceCloud(
  rawPhone: string,
  isOnline: boolean
): Promise<void> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return;

  const nowIso = new Date().toISOString();
  const all = getAllTravelers();
  if (all[phone]) {
    all[phone] = {
      ...all[phone],
      isOnline,
      lastSeenAt: nowIso,
    };
    saveAllTravelersLocalOnly(all);
  }

  try {
    await updateDoc(doc(db, 'clients', phone), {
      isOnline,
      lastSeenAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'not-found' && all[phone]) {
      void syncTravelerToCloud(all[phone]);
    }
  }
}

export function logoutTravelerSession(reason: 'manual' | 'expired' = 'manual'): void {
  if (typeof window === 'undefined') return;
  const prevMeta = readStoredSessionMeta();
  let prevPhone: string | null = null;
  try {
    prevPhone =
      window.sessionStorage.getItem(ACTIVE_PHONE_STORAGE_KEY) ||
      window.localStorage.getItem(ACTIVE_PHONE_STORAGE_KEY);
    window.localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
    window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
  } catch {
    prevPhone = null;
  }
  writeStoredSessionMeta(null);
  if (prevPhone) {
    void updateUserPresenceCloud(prevPhone, false);
    if (prevMeta?.sessionId) {
      const cleanPhone = normalizePhone(prevPhone);
      const all = getAllTravelers();
      const target = all[cleanPhone];
      if (target && Array.isArray(target.activeSessions)) {
        const remaining = target.activeSessions.filter(
          (s) => s.sessionId !== prevMeta.sessionId
        );
        if (remaining.length !== target.activeSessions.length) {
          all[cleanPhone] = { ...target, activeSessions: remaining };
          saveAllTravelersLocalOnly(all);
          void updateDoc(doc(db, 'clients', cleanPhone), {
            activeSessions: remaining,
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    }
  }
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
  accountType: AccountType;
  companyName: string;
  contactPersonName: string;
  isB2BPartner: boolean;
  hasPin: boolean;
  isTrustedDevice: boolean;
  currentDeviceId: string;
  currentDeviceLabel: string;
}> {
  const rawDigits = digitsOnly(rawPhone);
  const phone = normalizePhone(rawPhone);
  const { deviceId, label } = getDeviceFingerprint();
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return {
      validPhone: false,
      phone: '',
      exists: false,
      accountType: 'individual',
      companyName: '',
      contactPersonName: '',
      isB2BPartner: false,
      hasPin: false,
      isTrustedDevice: false,
      currentDeviceId: deviceId,
      currentDeviceLabel: label,
    };
  }

  const localAll = getAllTravelers();
  let target: TravelerProfile | undefined = localAll[phone] || localAll[rawDigits];
  let resolvedPhone = target?.phoneNormalized || (target ? normalizePhone(target.phone) : phone);
  const path = `clients/${phone}`;

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, localAll[phone]);
      resolvedPhone = normalizePhone(target.phone || phone);
      localAll[resolvedPhone] = target;
      saveAllTravelersLocalOnly(localAll);
    } else if (rawDigits && rawDigits !== phone && /^[0-9]{8,20}$/.test(rawDigits)) {
      const legacySnap = await getDoc(doc(db, 'clients', rawDigits));
      if (legacySnap.exists()) {
        target = mergeCloudClientWithLocal(
          legacySnap.data() as TravelerProfile,
          localAll[rawDigits] || localAll[phone]
        );
        resolvedPhone = rawDigits;
        localAll[rawDigits] = target;
        saveAllTravelersLocalOnly(localAll);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('Cloud device trust lookup deferred:', path, msg);
  }

  if (!target) {
    return {
      validPhone: true,
      phone,
      exists: false,
      accountType: 'individual',
      companyName: '',
      contactPersonName: '',
      isB2BPartner: false,
      hasPin: false,
      isTrustedDevice: false,
      currentDeviceId: deviceId,
      currentDeviceLabel: label,
    };
  }

  const accountType: AccountType =
    target.accountType === 'b2b_partner' ? 'b2b_partner' : 'individual';

  return {
    validPhone: true,
    phone: resolvedPhone,
    exists: true,
    profile: target,
    accountType,
    companyName: target.companyName || '',
    contactPersonName: target.contactPersonName || '',
    isB2BPartner: accountType === 'b2b_partner',
    hasPin: Boolean(target.pinHash && /^[a-f0-9]{64}$/.test(target.pinHash)),
    isTrustedDevice: isDeviceInTrustedList(target.trustedDevices, deviceId),
    currentDeviceId: deviceId,
    currentDeviceLabel: label,
  };
}

/**
 * Verifies a 6-digit PIN strictly on an ALREADY-TRUSTED device and opens trusted session.
 * Untrusted devices must use verifyClientPinForNewDeviceCloud -> mandatory privacy device choice!
 */
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
          ? 'This device is not yet trusted. Please complete New Device Verification first.'
          : 'هذا الجهاز غير موثوق بعد. يرجى إكمال التحقق من الجهاز الجديد أولاً.',
    };
  }

  const enteredHash = hashClientPin(check.phone, cleanPin);
  if (enteredHash !== check.profile.pinHash) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Incorrect 6-digit PIN. Please try again or use Forgot PIN.'
          : 'رمز الـ PIN غير صحيح. يرجى المحاولة مرة أخرى أو استخدام خيار نسيت رمز الـ PIN.',
    };
  }

  if (
    Array.isArray(check.profile.blockedDevices) &&
    check.profile.blockedDevices.includes(check.currentDeviceId)
  ) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'This device has been blocked from accessing this account.'
          : 'تم حظر هذا الجهاز من الوصول إلى الحساب.',
    };
  }

  const nowIso = new Date().toISOString();
  const currentList = check.profile.trustedDevices || [];
  const updatedDevices: TrustedDevice[] = currentList.map((d) =>
    d.deviceId === check.currentDeviceId
      ? { ...d, label: check.currentDeviceLabel, lastUsedAt: nowIso }
      : d
  );

  const meta = startTravelerSession(check.phone, 'trusted', {
    persistInLocalStorage: true,
    cloudRegistered: false,
  });
  const sessionRecord: ActiveSessionRecord = {
    sessionId: meta.sessionId || `sess_${Date.now()}`,
    deviceId: check.currentDeviceId,
    deviceName: check.currentDeviceLabel,
    mode: 'trusted',
    loggedInAt: nowIso,
    lastActiveAt: nowIso,
    expiresAt: null,
    authMethod: 'pin',
  };
  const nextSessions = buildNextActiveSessionsList(check.profile.activeSessions, sessionRecord);

  const updated: TravelerProfile = {
    ...check.profile,
    isOnline: true,
    lastSeenAt: nowIso,
    trustedDevices: updatedDevices,
    activeSessions: nextSessions,
  };
  const all = getAllTravelers();
  all[check.phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  markCurrentSessionCloudRegistered();
  return { ok: true, profile: updated };
}

/**
 * Option 2 on New Device Verification Screen:
 * Verifies the client's permanent 6-digit PIN on a NEW untrusted device WITHOUT opening the session
 * and WITHOUT auto-saving the device into trustedDevices. Routes to Privacy Device-Type Step next.
 */
export async function verifyClientPinForNewDeviceCloud(
  rawPhone: string,
  enteredPin: string,
  lang: 'ar' | 'en' = 'ar'
): Promise<{
  ok: boolean;
  error?: string;
  profile?: TravelerProfile;
}> {
  const cleanPin = normalizeArabicDigits(enteredPin).replace(/\D/g, '');
  if (cleanPin.length !== 6) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Please enter your 6-digit personal PIN.'
          : 'يرجى إدخال رمز الـ PIN الشخصي المكون من 6 أرقام.',
    };
  }

  const check = await checkClientAccountAndDeviceCloud(rawPhone);
  if (!check.exists || !check.profile) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Account not found. Please check your WhatsApp number.'
          : 'لم يتم العثور على الحساب. تأكد من رقم الواتساب.',
    };
  }

  if (!check.hasPin || !check.profile.pinHash) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'No PIN is set on this account yet. Please verify using backup WhatsApp OTP.'
          : 'لم يتم تعيين رمز PIN لهذا الحساب بعد. يرجى اختيار كود التفعيل عبر واتساب.',
    };
  }

  const enteredHash = hashClientPin(check.phone, cleanPin);
  if (enteredHash !== check.profile.pinHash) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Incorrect 6-digit PIN. Try again, or use Approved Device / WhatsApp OTP.'
          : 'رمز الـ PIN غير صحيح. حاول مرة أخرى أو استخدم الموافقة من الجهاز الموثوق أو كود الواتساب.',
    };
  }

  return { ok: true, profile: check.profile };
}

function markCurrentSessionCloudRegistered(targetSessionId?: string): void {
  const current = readStoredSessionMeta();
  if (!current) return;
  if (targetSessionId && current.sessionId !== targetSessionId) return;
  if (current.cloudRegistered) return;
  writeStoredSessionMeta({ ...current, cloudRegistered: true });
  emitUpdateEvent();
}

function buildNextActiveSessionsList(
  existing: ActiveSessionRecord[] | undefined,
  newRecord: ActiveSessionRecord
): ActiveSessionRecord[] {
  const nowMs = Date.now();
  const prev = Array.isArray(existing) ? existing : [];
  const cleaned = prev.filter((s) => {
    if (!s || !s.sessionId) return false;
    if (s.sessionId === newRecord.sessionId) return false;
    // Deduplicate same deviceId when creating/updating a session so each physical device stays clean
    if (s.deviceId === newRecord.deviceId) return false;
    // Prune expired sessions
    if (s.expiresAt) {
      const expMs = Date.parse(s.expiresAt);
      if (Number.isFinite(expMs) && expMs <= nowMs) return false;
    }
    return true;
  });
  return [newRecord, ...cleaned].slice(0, 20);
}

/**
 * Registers or updates the active session record in Firestore clients/{phone}.activeSessions
 * so every logged-in device (Trusted or Temporary) appears in real time inside Connected Sessions.
 */
export async function upsertActiveSessionCloud(
  rawPhone: string,
  opts: {
    sessionId: string;
    mode: ActiveSessionMode;
    expiresAtMs: number | null;
    authMethod?: 'pin' | 'otp' | 'approval';
    persistInLocalStorage?: boolean;
  }
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone) || !opts.sessionId) return null;

  const { deviceId, label } = getDeviceFingerprint();
  const all = getAllTravelers();
  let target = all[phone];
  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, target);
    }
  } catch {
    // Offline cache fallback
  }
  if (!target) return null;

  const nowIso = new Date().toISOString();
  const expiresIso = opts.expiresAtMs ? new Date(opts.expiresAtMs).toISOString() : null;
  const record: ActiveSessionRecord = {
    sessionId: opts.sessionId.slice(0, 100),
    deviceId,
    deviceName: label,
    mode: opts.mode,
    loggedInAt: nowIso,
    lastActiveAt: nowIso,
    expiresAt: expiresIso,
    ...(opts.authMethod ? { authMethod: opts.authMethod } : {}),
  };

  const nextSessions = buildNextActiveSessionsList(target.activeSessions, record);
  const updated: TravelerProfile = {
    ...target,
    isOnline: true,
    lastSeenAt: nowIso,
    activeSessions: nextSessions,
    updatedAt: nowIso,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  try {
    await updateDoc(doc(db, 'clients', phone), {
      isOnline: true,
      lastSeenAt: nowIso,
      activeSessions: nextSessions,
      updatedAt: nowIso,
    });
  } catch {
    await syncTravelerToCloud(updated);
  }
  markCurrentSessionCloudRegistered(opts.sessionId);
  return updated;
}

/**
 * Ensures sessions created prior to activeSessions tracking get registered cleanly once in Firestore.
 */
export async function ensureCurrentSessionRegisteredCloud(rawPhone: string): Promise<void> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return;

  const meta = getTravelerSessionMeta();
  if (!meta || meta.phone !== phone) return;

  const sessionId =
    meta.sessionId || `sess_${meta.deviceId.slice(0, 12)}_${meta.startedAt || Date.now()}`;
  if (!meta.sessionId) {
    writeStoredSessionMeta({ ...meta, sessionId });
    emitUpdateEvent();
  }

  if (meta.cloudRegistered) return;

  const all = getAllTravelers();
  const profile = all[phone];
  const alreadyInCloud = Boolean(
    profile &&
      Array.isArray(profile.activeSessions) &&
      profile.activeSessions.some((s) => s.sessionId === sessionId)
  );
  if (alreadyInCloud) {
    markCurrentSessionCloudRegistered(sessionId);
    return;
  }

  await upsertActiveSessionCloud(phone, {
    sessionId,
    mode: meta.mode,
    expiresAtMs: meta.expiresAt ?? null,
    authMethod: 'pin',
    persistInLocalStorage: meta.persistInLocalStorage,
  });
}

/**
 * Option 1 on New Device Verification Screen:
 * Creates approval request in BOTH clients/{phone}.pendingDevices (+ pendingLoginRequests)
 * AND collection deviceApprovals/{requestId}, then pushes notification via Cloudflare Worker.
 */
export async function requestTrustedDeviceLoginApprovalCloud(rawPhone: string): Promise<{
  ok: boolean;
  request?: PendingLoginRequest;
  deviceRequest?: PendingDeviceRequest;
  error?: string;
}> {
  const check = await checkClientAccountAndDeviceCloud(rawPhone);
  if (!check.exists || !check.profile) {
    return { ok: false, error: 'لم يتم العثور على الحساب.' };
  }

  const phone = check.phone;
  const { deviceId, label } = getDeviceFingerprint();

  if (
    Array.isArray(check.profile.blockedDevices) &&
    check.profile.blockedDevices.includes(deviceId)
  ) {
    return {
      ok: false,
      error:
        'تم حظر هذا الجهاز من الوصول إلى الحساب من قبل جهازك الموثوق. يمكنك فك الحظر من إعدادات الأمان في الجهاز الموثوق.',
    };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + 10 * 60 * 1000).toISOString();
  const requestId = `req_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;

  const request: PendingLoginRequest = {
    requestId,
    deviceId,
    deviceLabel: label,
    status: 'pending',
    createdAt: nowIso,
    expiresAt: expiresIso,
  };

  const deviceReq: PendingDeviceRequest = {
    requestId,
    phoneId: phone,
    deviceId,
    deviceName: label,
    status: 'pending',
    createdAt: nowIso,
    expiresAt: expiresIso,
  };

  const prevLoginReqs = Array.isArray(check.profile.pendingLoginRequests)
    ? check.profile.pendingLoginRequests
    : [];
  const nextLoginReqs = [
    request,
    ...prevLoginReqs.filter(
      (r) => r && r.deviceId !== deviceId && Date.parse(r.expiresAt) > nowMs - 60000
    ),
  ].slice(0, 10);

  const prevPendingDevices = Array.isArray(check.profile.pendingDevices)
    ? check.profile.pendingDevices
    : [];
  const nextPendingDevices = [
    deviceReq,
    ...prevPendingDevices.filter(
      (r) => r && r.deviceId !== deviceId && Date.parse(r.expiresAt) > nowMs - 60000
    ),
  ].slice(0, 15);

  const updated: TravelerProfile = {
    ...check.profile,
    pendingLoginRequests: nextLoginReqs,
    pendingDevices: nextPendingDevices,
    updatedAt: nowIso,
  };
  const all = getAllTravelers();
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  // 1. Write to deviceApprovals/{requestId} collection
  try {
    await setDoc(doc(db, 'deviceApprovals', requestId), {
      requestId,
      phoneId: phone,
      deviceId,
      deviceName: label,
      status: 'pending',
      createdAt: nowIso,
      expiresAt: expiresIso,
    });
  } catch (err) {
    console.warn('deviceApprovals create warning:', err);
  }

  // 2. Write pendingDevices & pendingLoginRequests onto clients/{phone}
  try {
    await updateDoc(doc(db, 'clients', phone), {
      pendingLoginRequests: nextLoginReqs,
      pendingDevices: nextPendingDevices,
      updatedAt: nowIso,
    });
  } catch {
    await syncTravelerToCloud(updated);
  }

  // 3. Immediate Cloudflare Worker Push to all client FCM tokens
  void dispatchRemotePushNotification({
    targetRole: 'client',
    targetPhone: phone,
    title: 'تنبيه أمني: محاولة دخول من جهاز جديد 🔐',
    body: 'جهاز جديد يطلب الموافقة للدخول إلى حسابك.',
    data: { role: 'client', action: 'account', phone },
  });

  return { ok: true, request, deviceRequest: deviceReq };
}

export function subscribeDeviceApprovalRequestCloud(
  requestId: string | null,
  onUpdate: (req: PendingDeviceRequest) => void
): () => void {
  if (!requestId || !/^[a-zA-Z0-9_\-]{6,80}$/.test(requestId)) {
    return () => {};
  }
  const path = `deviceApprovals/${requestId}`;
  return onSnapshot(
    doc(db, 'deviceApprovals', requestId),
    (snap) => {
      if (!snap.exists()) return;
      onUpdate(snap.data() as PendingDeviceRequest);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.GET, path);
      }
      console.warn('Device approval request listener warning:', msg);
    }
  );
}

export function subscribeDeviceApprovalsByPhoneCloud(
  rawPhone: string | null,
  onUpdate: (requests: PendingDeviceRequest[]) => void
): () => void {
  const phone = rawPhone ? normalizePhone(rawPhone) : '';
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return () => {};
  }
  const q = query(collection(db, 'deviceApprovals'), where('phoneId', '==', phone));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: PendingDeviceRequest[] = [];
      snapshot.forEach((d) => {
        items.push(d.data() as PendingDeviceRequest);
      });
      items.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
      onUpdate(items);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.LIST, 'deviceApprovals');
      }
      console.warn('Device approvals phone query warning:', msg);
    }
  );
}

/**
 * Trusted Device Response:
 * Supports permanent trusted approval, temporary (1h / 24h) approval, or reject & block.
 */
export async function respondToDeviceApprovalCloud(
  rawPhone: string,
  requestId: string,
  opts: {
    decision: 'approved_trusted' | 'approved_temporary' | 'rejected' | 'blocked';
    temporaryDurationHours?: 1 | 24;
    fallbackDeviceId?: string;
    fallbackDeviceName?: string;
  }
): Promise<boolean> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone) || !requestId) return false;

  const all = getAllTravelers();
  let target = all[phone];
  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, target);
    }
  } catch {
    // Use local cache fallback
  }
  if (!target) return false;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const approvalMode: 'trusted' | 'temporary' | undefined =
    opts.decision === 'approved_trusted'
      ? 'trusted'
      : opts.decision === 'approved_temporary'
      ? 'temporary'
      : undefined;
  const tempHours: 1 | 24 | undefined =
    opts.decision === 'approved_temporary'
      ? opts.temporaryDurationHours === 24
        ? 24
        : 1
      : undefined;

  const existingPendingDev = (target.pendingDevices || []).find((r) => r.requestId === requestId);
  const existingLoginReq = (target.pendingLoginRequests || []).find(
    (r) => r.requestId === requestId
  );

  const reqDeviceId =
    existingPendingDev?.deviceId || existingLoginReq?.deviceId || opts.fallbackDeviceId || '';
  const reqDeviceName =
    existingPendingDev?.deviceName ||
    existingLoginReq?.deviceLabel ||
    opts.fallbackDeviceName ||
    'New Device';

  const nextPendingDevices: PendingDeviceRequest[] = (target.pendingDevices || []).map((r) =>
    r.requestId === requestId
      ? {
          ...r,
          status: opts.decision,
          ...(approvalMode ? { approvalMode } : {}),
          ...(tempHours ? { temporaryDurationHours: tempHours } : {}),
          respondedAt: nowIso,
        }
      : r
  );

  const mappedLegacyStatus: PendingLoginRequest['status'] =
    opts.decision === 'approved_trusted' || opts.decision === 'approved_temporary'
      ? 'approved'
      : 'rejected';
  const nextLoginReqs: PendingLoginRequest[] = (target.pendingLoginRequests || []).map((r) =>
    r.requestId === requestId
      ? {
          ...r,
          status: mappedLegacyStatus,
          ...(approvalMode ? { approvalMode } : {}),
          ...(tempHours ? { temporaryDurationHours: tempHours } : {}),
          respondedAt: nowIso,
        }
      : r
  );

  let nextTrustedDevices = Array.isArray(target.trustedDevices) ? [...target.trustedDevices] : [];
  let nextBlockedDevices = Array.isArray(target.blockedDevices) ? [...target.blockedDevices] : [];
  let nextActiveSessions = Array.isArray(target.activeSessions) ? [...target.activeSessions] : [];

  if (reqDeviceId) {
    if (opts.decision === 'approved_trusted') {
      nextBlockedDevices = nextBlockedDevices.filter((id) => id !== reqDeviceId);
      const existingDev = nextTrustedDevices.find((d) => d.deviceId === reqDeviceId);
      const trustedEntry: TrustedDevice = {
        deviceId: reqDeviceId,
        label: reqDeviceName.slice(0, 120),
        addedAt: existingDev?.addedAt || nowIso,
        lastUsedAt: nowIso,
      };
      nextTrustedDevices = [
        trustedEntry,
        ...nextTrustedDevices.filter((d) => d.deviceId !== reqDeviceId),
      ].slice(0, 15);
    } else if (opts.decision === 'approved_temporary') {
      nextBlockedDevices = nextBlockedDevices.filter((id) => id !== reqDeviceId);
    } else if (opts.decision === 'blocked') {
      if (!nextBlockedDevices.includes(reqDeviceId)) {
        nextBlockedDevices = [reqDeviceId, ...nextBlockedDevices].slice(0, 25);
      }
      nextTrustedDevices = nextTrustedDevices.filter((d) => d.deviceId !== reqDeviceId);
      nextActiveSessions = nextActiveSessions.filter((s) => s.deviceId !== reqDeviceId);
    }
  }

  const updated: TravelerProfile = {
    ...target,
    pendingDevices: nextPendingDevices,
    pendingLoginRequests: nextLoginReqs,
    trustedDevices: nextTrustedDevices,
    blockedDevices: nextBlockedDevices,
    activeSessions: nextActiveSessions,
    updatedAt: nowIso,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  // Update deviceApprovals/{requestId} document
  try {
    const approvalPatch: Record<string, unknown> = {
      status: opts.decision,
      respondedAt: nowIso,
    };
    if (approvalMode) approvalPatch.approvalMode = approvalMode;
    if (tempHours) approvalPatch.temporaryDurationHours = tempHours;
    if (opts.decision === 'approved_temporary' && tempHours) {
      approvalPatch.expiresAt = new Date(nowMs + tempHours * 3600 * 1000).toISOString();
    }
    await updateDoc(doc(db, 'deviceApprovals', requestId), approvalPatch);
  } catch (err) {
    console.warn('deviceApprovals update warning:', err);
  }

  try {
    await updateDoc(doc(db, 'clients', phone), {
      pendingDevices: nextPendingDevices,
      pendingLoginRequests: nextLoginReqs,
      trustedDevices: nextTrustedDevices,
      blockedDevices: nextBlockedDevices,
      activeSessions: nextActiveSessions,
      updatedAt: nowIso,
    });
    return true;
  } catch {
    await syncTravelerToCloud(updated);
    return true;
  }
}

export async function respondToLoginApprovalRequestCloud(
  rawPhone: string,
  requestId: string,
  decision: 'approved' | 'rejected'
): Promise<boolean> {
  return respondToDeviceApprovalCloud(rawPhone, requestId, {
    decision: decision === 'approved' ? 'approved_trusted' : 'blocked',
  });
}

/**
 * Automatically opens the account on a waiting new device the exact instant
 * the trusted device taps Approve (Permanent Trusted or 1h/24h Temporary).
 */
export async function completeApprovedNewDeviceLoginCloud(
  rawPhone: string,
  approvalMode: 'trusted' | 'temporary',
  temporaryDurationHours: 1 | 24 = 1
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return null;

  const all = getAllTravelers();
  let target = all[phone];
  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, target);
    }
  } catch {
    // Offline fallback
  }
  if (!target) return null;

  const { deviceId, label } = getDeviceFingerprint();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const expiresAtMs =
    approvalMode === 'temporary' ? nowMs + temporaryDurationHours * 3600 * 1000 : null;
  const expiresAtIso = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;

  const meta = startTravelerSession(phone, approvalMode, {
    customExpiresAtMs: expiresAtMs,
    persistInLocalStorage: true,
    cloudRegistered: false,
  });

  let nextTrustedDevices = Array.isArray(target.trustedDevices) ? [...target.trustedDevices] : [];
  if (approvalMode === 'trusted') {
    const existingDev = nextTrustedDevices.find((d) => d.deviceId === deviceId);
    const trustedEntry: TrustedDevice = {
      deviceId,
      label,
      addedAt: existingDev?.addedAt || nowIso,
      lastUsedAt: nowIso,
    };
    nextTrustedDevices = [
      trustedEntry,
      ...nextTrustedDevices.filter((d) => d.deviceId !== deviceId),
    ].slice(0, 15);
  }

  const sessionRecord: ActiveSessionRecord = {
    sessionId: meta.sessionId || `sess_${nowMs}`,
    deviceId,
    deviceName: label,
    mode: approvalMode,
    loggedInAt: nowIso,
    lastActiveAt: nowIso,
    expiresAt: expiresAtIso,
    authMethod: 'approval',
  };
  const nextSessions = buildNextActiveSessionsList(target.activeSessions, sessionRecord);

  const updated: TravelerProfile = {
    ...target,
    isOnline: true,
    lastSeenAt: nowIso,
    trustedDevices: nextTrustedDevices,
    activeSessions: nextSessions,
    updatedAt: nowIso,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  markCurrentSessionCloudRegistered(meta.sessionId);
  return updated;
}

/**
 * Promotes any connected temporary/expiring session into a Permanent Trusted Device
 * and persists the updated mode across Firestore so the remote device upgrades live.
 */
export async function promoteSessionToTrustedCloud(
  rawPhone: string,
  targetSessionId: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone) || !targetSessionId) return null;

  const all = getAllTravelers();
  let target = all[phone];
  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, target);
    }
  } catch {
    // Offline fallback
  }
  if (!target) return null;

  const sessions = Array.isArray(target.activeSessions) ? target.activeSessions : [];
  const match = sessions.find((s) => s.sessionId === targetSessionId);
  if (!match) return null;

  const nowIso = new Date().toISOString();
  const nextSessions: ActiveSessionRecord[] = sessions.map((s) =>
    s.sessionId === targetSessionId
      ? { ...s, mode: 'trusted', expiresAt: null, lastActiveAt: nowIso }
      : s
  );

  const existingTrust = (target.trustedDevices || []).find((d) => d.deviceId === match.deviceId);
  const trustedEntry: TrustedDevice = {
    deviceId: match.deviceId,
    label: match.deviceName || 'Trusted Device',
    addedAt: existingTrust?.addedAt || nowIso,
    lastUsedAt: nowIso,
  };
  const nextTrustedDevices: TrustedDevice[] = [
    trustedEntry,
    ...(target.trustedDevices || []).filter((d) => d.deviceId !== match.deviceId),
  ].slice(0, 15);

  const nextBlockedDevices = (target.blockedDevices || []).filter(
    (id) => id !== match.deviceId
  );

  const updated: TravelerProfile = {
    ...target,
    trustedDevices: nextTrustedDevices,
    activeSessions: nextSessions,
    blockedDevices: nextBlockedDevices,
    updatedAt: nowIso,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  // If promoting the current device's session, upgrade local storage immediately
  const localMeta = readStoredSessionMeta();
  if (localMeta && localMeta.phone === phone && localMeta.sessionId === targetSessionId) {
    try {
      window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
      window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, phone);
    } catch {
      // Ignore
    }
    writeStoredSessionMeta({
      ...localMeta,
      mode: 'trusted',
      expiresAt: null,
      persistInLocalStorage: true,
    });
    emitUpdateEvent();
  }

  try {
    await updateDoc(doc(db, 'clients', phone), {
      trustedDevices: nextTrustedDevices,
      activeSessions: nextSessions,
      blockedDevices: nextBlockedDevices,
      updatedAt: nowIso,
    });
  } catch {
    await syncTravelerToCloud(updated);
  }
  return updated;
}

/**
 * Sets or updates a custom expiration window (1h / 24h / 7d / 30d) on any connected session.
 * When expiresAt is reached, that device auto-logs out immediately.
 */
export async function updateActiveSessionExpiryCloud(
  rawPhone: string,
  targetSessionId: string,
  durationHours: 1 | 24 | 168 | 720
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone) || !targetSessionId) return null;

  const all = getAllTravelers();
  let target = all[phone];
  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, target);
    }
  } catch {
    // Offline fallback
  }
  if (!target) return null;

  const sessions = Array.isArray(target.activeSessions) ? target.activeSessions : [];
  if (!sessions.some((s) => s.sessionId === targetSessionId)) return null;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAtMs = nowMs + durationHours * 3600 * 1000;
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  const nextSessions: ActiveSessionRecord[] = sessions.map((s) =>
    s.sessionId === targetSessionId
      ? { ...s, mode: 'temporary', expiresAt: expiresAtIso, lastActiveAt: nowIso }
      : s
  );

  const updated: TravelerProfile = {
    ...target,
    activeSessions: nextSessions,
    updatedAt: nowIso,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  const localMeta = readStoredSessionMeta();
  if (localMeta && localMeta.phone === phone && localMeta.sessionId === targetSessionId) {
    try {
      window.sessionStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
      window.localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, phone);
    } catch {
      // Ignore
    }
    writeStoredSessionMeta({
      ...localMeta,
      mode: 'temporary',
      expiresAt: expiresAtMs,
      persistInLocalStorage: true,
    });
    emitUpdateEvent();
  }

  try {
    await updateDoc(doc(db, 'clients', phone), {
      activeSessions: nextSessions,
      updatedAt: nowIso,
    });
  } catch {
    await syncTravelerToCloud(updated);
  }
  return updated;
}

/**
 * Instantly removes a connected session from Firestore activeSessions so the target device
 * is logged out instantaneously via onSnapshot.
 */
export async function kickActiveSessionCloud(
  rawPhone: string,
  targetSessionId: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone) || !targetSessionId) return null;

  const all = getAllTravelers();
  let target = all[phone];
  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      target = mergeCloudClientWithLocal(snap.data() as TravelerProfile, target);
    }
  } catch {
    // Offline fallback
  }
  if (!target) return null;

  const nowIso = new Date().toISOString();
  const prevSessions = Array.isArray(target.activeSessions) ? target.activeSessions : [];
  const nextSessions = prevSessions.filter((s) => s.sessionId !== targetSessionId);

  const updated: TravelerProfile = {
    ...target,
    activeSessions: nextSessions,
    updatedAt: nowIso,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  try {
    await updateDoc(doc(db, 'clients', phone), {
      activeSessions: nextSessions,
      updatedAt: nowIso,
    });
  } catch {
    await syncTravelerToCloud(updated);
  }

  const localMeta = readStoredSessionMeta();
  if (localMeta && localMeta.phone === phone && localMeta.sessionId === targetSessionId) {
    logoutTravelerSession('manual');
  }

  return updated;
}

export async function unblockDeviceCloud(
  rawPhone: string,
  targetDeviceId: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone) || !targetDeviceId) return null;

  const all = getAllTravelers();
  const target = all[phone];
  if (!target) return null;

  const nowIso = new Date().toISOString();
  const nextBlocked = (target.blockedDevices || []).filter((id) => id !== targetDeviceId);
  const updated: TravelerProfile = {
    ...target,
    blockedDevices: nextBlocked,
    updatedAt: nowIso,
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  try {
    await updateDoc(doc(db, 'clients', phone), {
      blockedDevices: nextBlocked,
      updatedAt: nowIso,
    });
  } catch {
    await syncTravelerToCloud(updated);
  }
  return updated;
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
  rawPhone: string,
  options?: { forceNew?: boolean }
): Promise<{
  ok: boolean;
  phone: string;
  isExisting: boolean;
  otpExpiresAt?: string;
  profile?: TravelerProfile;
  error?: string;
}> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, phone: '', isExisting: false, error: 'رقم الهاتف غير صالح.' };
  }

  const cleanFirst = firstNameInput.trim();
  const cleanLast = lastNameInput.trim();
  const combinedName = `${cleanFirst} ${cleanLast}`.trim();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const nextExpiryIso = new Date(nowMs + OTP_VALIDITY_MS).toISOString();
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

    // Preserve active unconsumed 6-digit OTP during its 24-hour validity window when client closes & reopens page
    const canKeepExistingOtp =
      !options?.forceNew &&
      !existing.verified &&
      isOtpActiveAndUnexpired(existing);

    const activeOtp = canKeepExistingOtp ? existing.otp : generateSixDigitOtp();
    const activeGeneratedAt = canKeepExistingOtp
      ? existing.otpGeneratedAt || existing.createdAt || nowIso
      : nowIso;
    const activeExpiresAt = canKeepExistingOtp
      ? existing.otpExpiresAt ||
        new Date(
          (Date.parse(activeGeneratedAt) || nowMs) + OTP_VALIDITY_MS
        ).toISOString()
      : nextExpiryIso;

    const updated: TravelerProfile = {
      ...existing,
      phone,
      phoneNormalized: phone,
      firstName: finalFirst,
      lastName: finalLast,
      name: finalName,
      otp: activeOtp,
      otpGeneratedAt: activeGeneratedAt,
      otpExpiresAt: activeExpiresAt,
      otpConsumed: false,
      accountStatus: existing.verified ? 'verified' : 'pending_verification',
      ...(!existing.verified ? { activatedByAdmin: false } : {}),
    };

    localAll[phone] = updated;
    saveAllTravelersLocalOnly(localAll);
    await syncTravelerToCloud(updated);
    return { ok: true, phone, isExisting: true, otpExpiresAt: activeExpiresAt, profile: updated };
  }

  const freshOtp = generateSixDigitOtp();
  const created: TravelerProfile = {
    phone,
    phoneNormalized: phone,
    firstName: cleanFirst,
    lastName: cleanLast,
    name: combinedName || `مسافر (${formatPhoneForDisplay(phone)})`,
    otp: freshOtp,
    otpGeneratedAt: nowIso,
    otpExpiresAt: nextExpiryIso,
    otpConsumed: false,
    activatedByAdmin: false,
    trustedDevices: [],
    verified: false,
    accountStatus: 'pending_verification',
    createdAt: nowIso,
    orderStatus: 'تم استلام الطلب',
    documents: [],
  };

  localAll[phone] = created;
  saveAllTravelersLocalOnly(localAll);
  await syncTravelerToCloud(created);
  return { ok: true, phone, isExisting: false, otpExpiresAt: nextExpiryIso, profile: created };
}

/**
 * Generates (or reuses an unexpired) 6-digit numeric OTP on an existing client account (Forgot PIN or Change PIN).
 */
export async function requestAccountSecurityOtpCloud(
  rawPhone: string,
  options?: { forceNew?: boolean }
): Promise<{ ok: boolean; phone: string; otpExpiresAt?: string; error?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, phone: '', error: 'رقم الهاتف غير صالح.' };
  }
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const nextExpiryIso = new Date(nowMs + OTP_VALIDITY_MS).toISOString();
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

  const keepCurrent = !options?.forceNew && isOtpActiveAndUnexpired(existing) && Boolean(existing.otpExpiresAt);
  const nextOtp = keepCurrent ? existing.otp : generateSixDigitOtp();
  const nextGenAt = keepCurrent ? existing.otpGeneratedAt || nowIso : nowIso;
  const nextExpAt = keepCurrent ? existing.otpExpiresAt || nextExpiryIso : nextExpiryIso;

  const updated: TravelerProfile = {
    ...existing,
    otp: nextOtp,
    otpGeneratedAt: nextGenAt,
    otpExpiresAt: nextExpAt,
    otpConsumed: false,
  };
  localAll[phone] = updated;
  saveAllTravelersLocalOnly(localAll);
  await syncTravelerToCloud(updated);
  return { ok: true, phone, otpExpiresAt: nextExpAt };
}

/**
 * Verifies a 6-digit security OTP against Firestore (24h validity + one-time use) without altering session mode.
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
          ? 'Please enter the 6-digit verification code (0-9 only).'
          : 'يرجى إدخال كود التحقق المكون من 6 أرقام (0-9 فقط).',
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

  if (!target) {
    return {
      ok: false,
      error: lang === 'en' ? 'Account not found.' : 'الحساب غير موجود.',
    };
  }

  if (target.otpConsumed === true) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'This verification code has already been used. Please request a new code.'
          : 'تم استخدام هذا الكود مسبقاً. يرجى طلب كود تحقق جديد.',
    };
  }

  if (target.otpExpiresAt && Date.parse(target.otpExpiresAt) <= Date.now()) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Verification code expired (24-hour validity elapsed). Please issue a new code.'
          : 'انتهت صلاحية كود التحقق (24 ساعة). يرجى إصدار كود جديد.',
    };
  }

  if (String(target.otp || '').trim() !== cleanOtp) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Verification code is incorrect. Please check WhatsApp and try again.'
          : 'كود التحقق غير صحيح. يرجى مراجعة رسالة الواتساب والمحاولة مجدداً.',
    };
  }

  // Consume OTP immediately (One-Time Use) while maintaining ^[0-9]{6}$ schema constraint
  const consumed: TravelerProfile = {
    ...target,
    otp: generateSixDigitOtp(),
    otpConsumed: true,
    otpExpiresAt: new Date(0).toISOString(),
  };
  all[phone] = consumed;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(consumed);

  return { ok: true, profile: consumed };
}

/**
 * Step 2 of Zero-Leak Client Login:
 * Verifies the user-entered 6-digit OTP against Firestore (24h validity & one-time use),
 * consumes the OTP immediately, and returns PIN/device trust requirements.
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
          ? 'Please enter a valid 6-digit numeric login code.'
          : 'يرجى إدخال كود التفعيل المكون من 6 أرقام فقط (0-9).',
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

  if (target.otpConsumed === true) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'This activation code has already been used or replaced. Please request a fresh code via WhatsApp.'
          : 'تم استخدام كود التفعيل هذا مسبقاً أو تم استبداله. يرجى إصدار كود جديد عبر واتساب.',
    };
  }

  if (target.otpExpiresAt && Date.parse(target.otpExpiresAt) <= Date.now()) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'This activation code has expired (24h limit). Tap "Issue New Code" and request via WhatsApp.'
          : 'انتهت صلاحية كود التفعيل (24 ساعة). يرجى الضغط على "إصدار كود جديد" لطلبه عبر واتساب.',
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
    otp: generateSixDigitOtp(),
    otpConsumed: true,
    otpExpiresAt: new Date(0).toISOString(),
    verified: true,
    accountStatus: 'verified',
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
  const nextBlocked = (existing.blockedDevices || []).filter((id) => id !== deviceId);

  const meta = startTravelerSession(phone, 'trusted', {
    persistInLocalStorage: true,
    cloudRegistered: false,
  });
  const sessionRecord: ActiveSessionRecord = {
    sessionId: meta.sessionId || `sess_${Date.now()}`,
    deviceId,
    deviceName: label,
    mode: 'trusted',
    loggedInAt: nowIso,
    lastActiveAt: nowIso,
    expiresAt: null,
    authMethod: 'otp',
  };
  const nextSessions = buildNextActiveSessionsList(existing.activeSessions, sessionRecord);

  const updated: TravelerProfile = {
    ...existing,
    isOnline: true,
    lastSeenAt: nowIso,
    trustedDevices: nextList,
    blockedDevices: nextBlocked,
    activeSessions: nextSessions,
  };

  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  markCurrentSessionCloudRegistered(meta.sessionId);
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

  // If removing another trusted device, also kick any remote active sessions belonging to that device
  const currentDeviceId = getDeviceFingerprint().deviceId;
  const nowIso = new Date().toISOString();
  let nextSessions = Array.isArray(existing.activeSessions) ? [...existing.activeSessions] : [];
  if (targetDeviceId !== currentDeviceId) {
    nextSessions = nextSessions.filter((s) => s.deviceId !== targetDeviceId);
  } else {
    nextSessions = nextSessions.map((s) =>
      s.deviceId === currentDeviceId
        ? {
            ...s,
            mode: 'temporary',
            expiresAt: new Date(Date.now() + TEMPORARY_SESSION_DURATION_MS).toISOString(),
            lastActiveAt: nowIso,
          }
        : s
    );
  }

  const updated: TravelerProfile = {
    ...existing,
    trustedDevices: nextDevices,
    activeSessions: nextSessions,
  };

  all[phone] = updated;
  saveAllTravelersLocalOnly(all);

  const meta = getTravelerSessionMeta();
  if (targetDeviceId === currentDeviceId && meta?.phone === phone && meta.mode === 'trusted') {
    startTravelerSession(phone, 'temporary', {
      sessionId: meta.sessionId,
      persistInLocalStorage: false,
      cloudRegistered: meta.cloudRegistered,
    });
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

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiryIso = new Date(nowMs + OTP_VALIDITY_MS).toISOString();

  const profile: TravelerProfile = existing
    ? {
        ...existing,
        phone,
        phoneNormalized: phone,
        firstName: cleanFirst || existing.firstName,
        lastName: cleanLast || existing.lastName,
        name: fullName || existing.name,
        otp: isOtpActiveAndUnexpired(existing) ? existing.otp : generateSixDigitOtp(),
        otpGeneratedAt: existing.otpGeneratedAt || nowIso,
        otpExpiresAt: existing.otpExpiresAt || expiryIso,
        otpConsumed: existing.otpConsumed ?? false,
      }
    : {
        phone,
        phoneNormalized: phone,
        firstName: cleanFirst,
        lastName: cleanLast,
        name: fullName || `مسافر (${formatPhoneForDisplay(phone)})`,
        otp: generateSixDigitOtp(),
        otpGeneratedAt: nowIso,
        otpExpiresAt: expiryIso,
        otpConsumed: false,
        activatedByAdmin: false,
        verified: false,
        accountStatus: 'pending_verification',
        createdAt: nowIso,
        orderStatus: 'تم استلام الطلب',
        documents: [],
      };

  all[phone] = profile;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(profile);
  return profile;
}

/**
 * Admin Action: Instantly activates a client's account WITHOUT requiring an OTP code.
 * Updates Firestore immediately so any waiting client screen transitions straight to PIN Setup / Device Trust.
 */
export async function adminInstantActivateClientCloud(
  rawPhone: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return null;

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

  if (!existing) return null;

  const nowIso = new Date().toISOString();
  const updated: TravelerProfile = {
    ...existing,
    phone,
    phoneNormalized: phone,
    verified: true,
    accountStatus: 'verified',
    verifiedAt: existing.verifiedAt || nowIso,
    activatedByAdmin: true,
    adminBypassOtpAt: nowIso,
    otp: generateSixDigitOtp(),
    otpConsumed: true,
    otpExpiresAt: new Date(0).toISOString(),
    updatedAt: nowIso,
  };

  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  return updated;
}

/**
 * Admin Action: Creates a dedicated Business/Travel Company (B2B Partner) account OR upgrades an existing individual account.
 */
export async function adminCreateOrUpgradeB2BPartnerCloud(input: {
  companyName: string;
  contactPersonName: string;
  phone: string;
  initialPin?: string;
}): Promise<{ ok: boolean; profile?: TravelerProfile; error?: string }> {
  const phone = normalizePhone(input.phone);
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, error: 'رقم الهاتف المربوط غير صالح (أرقام 0-9 فقط).' };
  }

  const cleanCompany = input.companyName.trim().slice(0, 160);
  const cleanContact = input.contactPersonName.trim().slice(0, 120);
  if (!cleanCompany) {
    return { ok: false, error: 'يرجى إدخال اسم الشركة أو الوكالة السياحية.' };
  }

  const cleanPin = normalizeArabicDigits(input.initialPin || '').replace(/\D/g, '');
  if (cleanPin && cleanPin.length !== 6) {
    return { ok: false, error: 'الرقم السري (PIN) للشركة يجب أن يتكون من 6 أرقام (0-9).' };
  }

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

  const nowIso = new Date().toISOString();
  const splitContact = splitPassportName(cleanContact || cleanCompany);

  const profile: TravelerProfile = existing
    ? {
        ...existing,
        phone,
        phoneNormalized: phone,
        accountType: 'b2b_partner',
        companyName: cleanCompany,
        ...(cleanContact ? { contactPersonName: cleanContact } : {}),
        name: cleanCompany,
        firstName: splitContact.firstName || existing.firstName,
        lastName: splitContact.lastName || existing.lastName,
        verified: true,
        accountStatus: 'verified',
        verifiedAt: existing.verifiedAt || nowIso,
        activatedByAdmin: true,
        adminBypassOtpAt: nowIso,
        otpConsumed: true,
        otpExpiresAt: new Date(0).toISOString(),
        ...(cleanPin
          ? {
              pinHash: hashClientPin(phone, cleanPin),
              pinUpdatedAt: nowIso,
            }
          : {}),
        updatedAt: nowIso,
      }
    : {
        phone,
        phoneNormalized: phone,
        orderCode: buildOrderCodeFromPhone(phone),
        accountType: 'b2b_partner',
        companyName: cleanCompany,
        ...(cleanContact ? { contactPersonName: cleanContact } : {}),
        firstName: splitContact.firstName || cleanCompany,
        lastName: splitContact.lastName || '',
        name: cleanCompany,
        otp: generateSixDigitOtp(),
        otpGeneratedAt: nowIso,
        otpExpiresAt: new Date(0).toISOString(),
        otpConsumed: true,
        activatedByAdmin: true,
        adminBypassOtpAt: nowIso,
        ...(cleanPin
          ? {
              pinHash: hashClientPin(phone, cleanPin),
              pinUpdatedAt: nowIso,
            }
          : {}),
        trustedDevices: [],
        verified: true,
        accountStatus: 'verified',
        verifiedAt: nowIso,
        isOnline: false,
        createdAt: nowIso,
        updatedAt: nowIso,
        orderStatus: 'تم استلام الطلب',
        documents: [],
      };

  all[phone] = profile;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(profile);
  return { ok: true, profile };
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
    accountStatus: 'pending_verification',
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
    accountStatus: 'verified',
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
      accountStatus: 'verified',
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
    accountStatus: 'verified',
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
        if (cloud.otpConsumed === true) {
          return {
            ok: false,
            error: 'رابط وكود التفعيل مستخدمان مسبقاً أو منتهيا الصلاحية. يرجى طلب كود جديد عبر واتساب.',
          };
        }
        if (cloud.otpExpiresAt && Date.parse(cloud.otpExpiresAt) <= Date.now()) {
          return {
            ok: false,
            error: 'انتهت صلاحية كود التفعيل (24 ساعة). يرجى طلب كود جديد عبر واتساب.',
          };
        }
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
          otp: generateSixDigitOtp(),
          otpConsumed: true,
          otpExpiresAt: new Date(0).toISOString(),
          verified: true,
          accountStatus: 'verified',
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
          const meta = startTravelerSession(phone, 'trusted', {
            persistInLocalStorage: true,
            cloudRegistered: false,
          });
          const sessionRecord: ActiveSessionRecord = {
            sessionId: meta.sessionId || `sess_${Date.now()}`,
            deviceId,
            deviceName: label,
            mode: 'trusted',
            loggedInAt: nowIso,
            lastActiveAt: nowIso,
            expiresAt: null,
            authMethod: 'otp',
          };
          updated.isOnline = true;
          updated.lastSeenAt = nowIso;
          updated.activeSessions = buildNextActiveSessionsList(updated.activeSessions, sessionRecord);
          const all = getAllTravelers();
          all[phone] = updated;
          saveAllTravelersLocalOnly(all);
          await syncTravelerToCloud(updated);
          markCurrentSessionCloudRegistered(meta.sessionId);
          return { ok: true, profile: updated, needsPinSetup: false, isDeviceTrusted: true };
        }

        // Clear any pre-existing local active session so PIN Setup / Device Trust prompt renders cleanly
        setActiveTravelerPhone(null);
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
    const meta = startTravelerSession(localRes.profile.phone, 'trusted', {
      persistInLocalStorage: true,
      cloudRegistered: false,
    });
    void upsertActiveSessionCloud(localRes.profile.phone, {
      sessionId: meta.sessionId || `sess_${Date.now()}`,
      mode: 'trusted',
      expiresAtMs: null,
      authMethod: 'otp',
      persistInLocalStorage: true,
    });
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
      | 'accountType'
      | 'companyName'
      | 'contactPersonName'
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
      | 'activatedByAdmin'
      | 'issuedDocuments'
      | 'notifications'
      | 'appointmentDetails'
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
  let shouldDispatchOrderPush = false;
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
    shouldDispatchOrderPush = true;
  }

  const nextAppointment =
    'appointmentDetails' in cleanUpdates
      ? cleanUpdates.appointmentDetails
      : existing.appointmentDetails;

  if (
    cleanUpdates.appointmentDetails?.appointmentDate &&
    cleanUpdates.appointmentDetails.appointmentDate !== existing.appointmentDetails?.appointmentDate
  ) {
    const apptNote: ClientNotification = {
      id: `notif-appt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      titleAr: 'تم إصدار بطاقة الموعد والباركود',
      titleEn: 'Appointment QR Pass Ready',
      bodyAr: `تم تسجيل موعدك (${cleanUpdates.appointmentDetails.serviceType || 'موعد خدمة'}) بتاريخ ${cleanUpdates.appointmentDetails.appointmentDate} ${cleanUpdates.appointmentDetails.appointmentTime || ''}. يمكنك عرض الباركود من تبويب طلباتي.`,
      bodyEn: `Your appointment (${cleanUpdates.appointmentDetails.serviceType || 'Service'}) is scheduled for ${cleanUpdates.appointmentDetails.appointmentDate} ${cleanUpdates.appointmentDetails.appointmentTime || ''}. Open My Orders to view your QR Pass.`,
      type: 'status',
      createdAt: new Date().toISOString(),
      read: false,
    };
    nextNotifications = [apptNote, ...nextNotifications].slice(0, 30);
    shouldDispatchOrderPush = true;
  }

  const updated: TravelerProfile = {
    ...existing,
    ...cleanUpdates,
    accountStatus:
      cleanUpdates.verified !== undefined
        ? cleanUpdates.verified
          ? 'verified'
          : 'pending_verification'
        : existing.accountStatus || (existing.verified ? 'verified' : 'pending_verification'),
    appointmentDetails: nextAppointment,
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

  if (shouldDispatchOrderPush && nextNotifications[0]) {
    void dispatchRemotePushNotification({
      targetRole: 'client',
      targetPhone: phone,
      title: nextNotifications[0].titleAr,
      body: nextNotifications[0].bodyAr,
      data: { role: 'client', action: 'orders', phone },
    });
  }

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
    replaceDocId?: string;
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
    viewUrl: string;
    storagePath: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  };

  try {
    uploadResult = await uploadIssuedDeliverableToStorage(phone, deliverableId, input.file);
  } catch (err) {
    console.warn('Issued deliverable Google Drive upload failed:', err);
    const reason = err instanceof Error && err.message ? err.message : '';
    return {
      ok: false,
      error:
        reason ||
        'تعذر رفع المستند إلى التخزين السحابي Google Drive. يرجى التحقق من الحجم والاتصال والمحاولة مجدداً.',
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

  // If replacing an existing deliverable, detach its old storage path reference
  let remainingIssuedDocs = latestExisting.issuedDocuments || [];
  if (input.replaceDocId) {
    const oldTarget = remainingIssuedDocs.find((d) => d.id === input.replaceDocId);
    if (oldTarget?.storagePath) {
      void deleteTravelerDocumentFromStorage(oldTarget.storagePath);
    }
    remainingIssuedDocs = remainingIssuedDocs.filter((d) => d.id !== input.replaceDocId);
  }

  const nowIso = new Date().toISOString();
  const deliverable: IssuedDocument = {
    id: deliverableId,
    docTypeLabel: cleanLabel.slice(0, 160),
    fileName: uploadResult.fileName.slice(0, 220),
    mimeType: uploadResult.mimeType.slice(0, 120),
    downloadUrl: uploadResult.downloadUrl,
    viewUrl: uploadResult.viewUrl,
    storagePath: uploadResult.storagePath,
    fileSizeBytes: uploadResult.fileSizeBytes,
    ...(input.notes?.trim() ? { notes: input.notes.trim().slice(0, 300) } : {}),
    issuedAt: nowIso,
    ...(input.adminName?.trim() ? { issuedBy: input.adminName.trim().slice(0, 100) } : {}),
  };

  const deliverableNotification: ClientNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    titleAr: input.replaceDocId ? 'تم تحديث واستبدال مستند الطلب' : 'تم تنفيذ الطلب وإرفاق مستند',
    titleEn: input.replaceDocId ? 'Order Document Updated' : 'Order Completed & Document Ready',
    bodyAr: input.replaceDocId
      ? `تم استبدال وتحديث مستند: ${cleanLabel}، جاهز للتحميل الآن.`
      : `تم تنفيذ طلبك وإرفاق مستند: ${cleanLabel}، جاهز للتحميل الآن.`,
    bodyEn: input.replaceDocId
      ? `Your "${cleanLabel}" document has been updated and is ready to download.`
      : `Your order has been completed and "${cleanLabel}" is ready to download now.`,
    type: 'deliverable',
    docId: deliverableId,
    createdAt: nowIso,
    read: false,
  };

  const updated: TravelerProfile = {
    ...latestExisting,
    orderStatus: 'تم تنفيذ الطلب',
    updatedAt: nowIso,
    issuedDocuments: [deliverable, ...remainingIssuedDocs].slice(0, 30),
    notifications: [deliverableNotification, ...(latestExisting.notifications || [])].slice(0, 30),
  };

  const latestAll = getAllTravelers();
  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  void dispatchRemotePushNotification({
    targetRole: 'client',
    targetPhone: phone,
    title: deliverableNotification.titleAr,
    body: deliverableNotification.bodyAr,
    data: { role: 'client', action: 'documents', phone },
  });
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
    updatedAt: new Date().toISOString(),
    issuedDocuments: (existing.issuedDocuments || []).filter((d) => d.id !== docId),
  };
  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  return updated;
}

export interface StorageMonitorStats {
  usedBytes: number;
  limitBytes: number;
  usagePercent: number;
  isNearLimit: boolean;
  totalFilesCount: number;
  deliverablesCount: number;
  vaultFilesCount: number;
}

const LEGACY_FALLBACK_FILE_BYTES = 160 * 1024; // Conservative fallback estimate for legacy files missing byte count

export function computeStorageUsageStats(profiles: TravelerProfile[]): StorageMonitorStats {
  let usedBytes = 0;
  let deliverablesCount = 0;
  let vaultFilesCount = 0;

  for (const client of profiles) {
    if (client.avatarStoragePath || (client.avatarUrl && client.avatarUrl.startsWith('http'))) {
      vaultFilesCount += 1;
      usedBytes += client.avatarSizeBytes ?? LEGACY_FALLBACK_FILE_BYTES;
    }

    for (const d of client.documents || []) {
      vaultFilesCount += 1;
      usedBytes +=
        d.sizeBytes ??
        (d.dataUrl.startsWith('data:') ? estimateDataUrlBytes(d.dataUrl) : LEGACY_FALLBACK_FILE_BYTES);
    }

    for (const fm of client.familyMembers || []) {
      if (fm.passportPhotoUrl) {
        vaultFilesCount += 1;
        usedBytes +=
          fm.passportSizeBytes ??
          (fm.passportPhotoUrl.startsWith('data:')
            ? estimateDataUrlBytes(fm.passportPhotoUrl)
            : LEGACY_FALLBACK_FILE_BYTES);
      }
      if (fm.personalPhotoUrl) {
        vaultFilesCount += 1;
        usedBytes +=
          fm.personalPhotoSizeBytes ??
          (fm.personalPhotoUrl.startsWith('data:')
            ? estimateDataUrlBytes(fm.personalPhotoUrl)
            : LEGACY_FALLBACK_FILE_BYTES);
      }
    }

    for (const delDoc of client.issuedDocuments || []) {
      deliverablesCount += 1;
      usedBytes += delDoc.fileSizeBytes ?? LEGACY_FALLBACK_FILE_BYTES;
    }
  }

  const limitBytes = STORAGE_FREE_LIMIT_BYTES;
  const usagePercent = Math.min(100, Number(((usedBytes / limitBytes) * 100).toFixed(2)));
  return {
    usedBytes,
    limitBytes,
    usagePercent,
    isNearLimit: usagePercent >= 80,
    totalFilesCount: deliverablesCount + vaultFilesCount,
    deliverablesCount,
    vaultFilesCount,
  };
}

export function previewOldCompletedAttachmentsCleanup(
  profiles: TravelerProfile[],
  olderThanDays: 60 | 90
): { eligibleOrdersCount: number; eligibleFilesCount: number; estimatedFreedBytes: number } {
  const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  let eligibleOrdersCount = 0;
  let eligibleFilesCount = 0;
  let estimatedFreedBytes = 0;

  for (const client of profiles) {
    const isCompleted =
      client.orderStatus === 'تم تنفيذ الطلب' || client.orderStatus === 'مكتمل';
    if (!isCompleted) continue;

    const oldIssued = (client.issuedDocuments || []).filter((d) => {
      const ts = Date.parse(d.issuedAt || client.updatedAt || client.createdAt || '');
      return Number.isFinite(ts) && ts <= cutoffMs;
    });
    const oldDocs = (client.documents || []).filter((d) => {
      const ts = Date.parse(d.uploadedAt || client.updatedAt || client.createdAt || '');
      return Number.isFinite(ts) && ts <= cutoffMs;
    });

    if (oldIssued.length > 0 || oldDocs.length > 0) {
      eligibleOrdersCount += 1;
      eligibleFilesCount += oldIssued.length + oldDocs.length;
      oldIssued.forEach((d) => {
        estimatedFreedBytes += d.fileSizeBytes ?? LEGACY_FALLBACK_FILE_BYTES;
      });
      oldDocs.forEach((d) => {
        estimatedFreedBytes +=
          d.sizeBytes ??
          (d.dataUrl.startsWith('data:') ? estimateDataUrlBytes(d.dataUrl) : LEGACY_FALLBACK_FILE_BYTES);
      });
    }
  }

  return { eligibleOrdersCount, eligibleFilesCount, estimatedFreedBytes };
}

/**
 * Deletes Firebase Storage attachments for completed orders older than 60 or 90 days
 * to reclaim free-tier storage quota while keeping 100% of client profiles and order metadata intact.
 */
export async function cleanupCompletedOrderAttachmentsCloud(
  olderThanDays: 60 | 90
): Promise<{ cleanedOrdersCount: number; deletedFilesCount: number; freedBytes: number }> {
  const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const all = getAllTravelers();
  let cleanedOrdersCount = 0;
  let deletedFilesCount = 0;
  let freedBytes = 0;

  for (const phone of Object.keys(all)) {
    const client = all[phone];
    const isCompleted =
      client.orderStatus === 'تم تنفيذ الطلب' || client.orderStatus === 'مكتمل';
    if (!isCompleted) continue;

    const keptIssued: IssuedDocument[] = [];
    let modified = false;

    for (const delDoc of client.issuedDocuments || []) {
      const ts = Date.parse(delDoc.issuedAt || client.updatedAt || client.createdAt || '');
      if (Number.isFinite(ts) && ts <= cutoffMs) {
        if (delDoc.storagePath) {
          await deleteTravelerDocumentFromStorage(delDoc.storagePath);
        }
        freedBytes += delDoc.fileSizeBytes ?? LEGACY_FALLBACK_FILE_BYTES;
        deletedFilesCount += 1;
        modified = true;
      } else {
        keptIssued.push(delDoc);
      }
    }

    const keptDocs: TravelerDocument[] = [];
    for (const docItem of client.documents || []) {
      const ts = Date.parse(docItem.uploadedAt || client.updatedAt || client.createdAt || '');
      if (Number.isFinite(ts) && ts <= cutoffMs) {
        if (docItem.storagePath) {
          await deleteTravelerDocumentFromStorage(docItem.storagePath);
        }
        freedBytes +=
          docItem.sizeBytes ??
          (docItem.dataUrl.startsWith('data:')
            ? estimateDataUrlBytes(docItem.dataUrl)
            : LEGACY_FALLBACK_FILE_BYTES);
        deletedFilesCount += 1;
        modified = true;
      } else {
        keptDocs.push(docItem);
      }
    }

    if (modified) {
      cleanedOrdersCount += 1;
      const updatedClient: TravelerProfile = {
        ...client,
        issuedDocuments: keptIssued,
        documents: keptDocs,
      };
      all[phone] = updatedClient;
      await syncTravelerToCloud(updatedClient);
    }
  }

  if (cleanedOrdersCount > 0) {
    saveAllTravelersLocalOnly(all);
  }

  return { cleanedOrdersCount, deletedFilesCount, freedBytes };
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

export async function saveClientFcmTokenCloud(
  rawPhone: string,
  token: string,
  enabled = true
): Promise<boolean> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return false;

  const cleanToken = String(token || '').trim().slice(0, 512);
  const nowIso = new Date().toISOString();
  const all = getAllTravelers();
  let existing = all[phone];

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      existing = mergeCloudClientWithLocal(snap.data() as TravelerProfile, existing);
    }
  } catch {
    // Fallback to local snapshot
  }

  if (!existing) return false;

  const nextTokens = normalizeFcmTokenList(existing.fcmTokens, cleanToken || existing.fcmToken, 10);
  const updated: TravelerProfile = {
    ...existing,
    ...(cleanToken ? { fcmToken: cleanToken } : {}),
    fcmTokens: nextTokens,
    fcmUpdatedAt: nowIso,
    pushNotificationsEnabled: Boolean(enabled),
    updatedAt: nowIso,
  };

  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);
  return true;
}

export async function getClientFcmTokensCloud(rawPhone: string): Promise<string[]> {
  const phone = normalizePhone(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return [];
  const tokenSet = new Set<string>();
  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      const data = snap.data() as TravelerProfile;
      if (data.pushNotificationsEnabled === false) return [];
      normalizeFcmTokenList(data.fcmTokens, data.fcmToken, 10).forEach((tk) => tokenSet.add(tk));
      if (tokenSet.size > 0) return Array.from(tokenSet);
    }
  } catch {
    // Ignore read error
  }
  const local = getAllTravelers()[phone];
  if (local && local.pushNotificationsEnabled !== false) {
    normalizeFcmTokenList(local.fcmTokens, local.fcmToken, 10).forEach((tk) => tokenSet.add(tk));
  }
  return Array.from(tokenSet);
}

export async function attachPreOrderFilesToTravelerCloud(
  rawPhone: string,
  input: {
    passportDataUrl?: string;
    passportFileName?: string;
    avatarDataUrl?: string;
    receiptDataUrl?: string;
    receiptFileName?: string;
    serviceTitle?: string;
  }
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  let nextAvatarUrl = existing.avatarUrl;
  let nextAvatarStoragePath = existing.avatarStoragePath;
  let nextAvatarSizeBytes = existing.avatarSizeBytes;
  const addedDocs: TravelerDocument[] = [];

  if (input.avatarDataUrl && input.avatarDataUrl.startsWith('data:')) {
    const upAvatar = await uploadTravelerAvatarToStorage(phone, input.avatarDataUrl);
    if (upAvatar) {
      if (existing.avatarStoragePath && existing.avatarStoragePath !== upAvatar.storagePath) {
        void deleteTravelerDocumentFromStorage(existing.avatarStoragePath);
      }
      nextAvatarUrl = upAvatar.downloadUrl;
      nextAvatarStoragePath = upAvatar.storagePath;
      nextAvatarSizeBytes = upAvatar.sizeBytes;
    } else {
      nextAvatarUrl = input.avatarDataUrl;
      nextAvatarSizeBytes = estimateDataUrlBytes(input.avatarDataUrl);
    }
  }

  if (input.passportDataUrl && input.passportDataUrl.startsWith('data:')) {
    const docId = `pre-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const upPass = await uploadTravelerDocumentToStorage(
      phone,
      docId,
      input.passportDataUrl,
      input.passportFileName || `Passport_${phone}_${docId}.jpg`
    );
    addedDocs.push({
      id: docId,
      label: 'صورة جواز السفر (مرفوعة مع الطلب)',
      docType: 'passport',
      fileName: input.passportFileName || 'passport.jpg',
      dataUrl: upPass ? upPass.downloadUrl : input.passportDataUrl,
      ...(upPass
        ? { viewUrl: upPass.viewUrl, storagePath: upPass.storagePath, sizeBytes: upPass.sizeBytes }
        : { sizeBytes: estimateDataUrlBytes(input.passportDataUrl) }),
      uploadedAt: new Date().toISOString(),
    });
  }

  if (input.receiptDataUrl && input.receiptDataUrl.startsWith('data:')) {
    const receiptId = `rcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const upReceipt = await uploadTravelerDocumentToStorage(
      phone,
      receiptId,
      input.receiptDataUrl,
      input.receiptFileName || `Receipt_${phone}_${receiptId}.jpg`
    );
    addedDocs.push({
      id: receiptId,
      label: 'إيصال دفع / تحويل مالي',
      docType: 'receipt',
      fileName: input.receiptFileName || 'payment-receipt.jpg',
      dataUrl: upReceipt ? upReceipt.downloadUrl : input.receiptDataUrl,
      ...(upReceipt
        ? {
            viewUrl: upReceipt.viewUrl,
            storagePath: upReceipt.storagePath,
            sizeBytes: upReceipt.sizeBytes,
          }
        : { sizeBytes: estimateDataUrlBytes(input.receiptDataUrl) }),
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
    ...(typeof nextAvatarSizeBytes === 'number' ? { avatarSizeBytes: nextAvatarSizeBytes } : {}),
    documents: [...addedDocs, ...(latest.documents || [])].slice(0, 30),
  };

  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  if (addedDocs.length > 0 || input.serviceTitle) {
    const senderLabel =
      updated.accountType === 'b2b_partner' && updated.companyName
        ? updated.companyName
        : updated.name;
    const hasReceipt = addedDocs.some((d) => d.docType === 'receipt');
    void dispatchRemotePushNotification({
      targetRole: 'admin',
      title: hasReceipt
        ? `إيصال دفع جديد من ${senderLabel}`
        : `طلب / مستندات جديدة من ${senderLabel}`,
      body: addedDocs.length > 0
        ? addedDocs.map((d) => d.label).join(' • ').slice(0, 300)
        : `طلب خدمة جديد: ${input.serviceTitle || ''}`.slice(0, 300),
      data: { role: 'admin', action: 'client_folder', phone },
    });
  }
  return updated;
}

export async function uploadAndAddDocumentToTravelerCloud(
  rawPhone: string,
  input: {
    docType: TravelerDocument['docType'];
    label: string;
    dataUrl: string;
    fileName: string;
  }
): Promise<{ profile: TravelerProfile; document: TravelerDocument } | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing) return null;

  const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const uploaded = await uploadTravelerDocumentToStorage(phone, docId, input.dataUrl, input.fileName);

  const newDoc: TravelerDocument = {
    id: docId,
    label: input.label.trim().slice(0, 160) || 'إيصال دفع / مستند',
    docType: input.docType,
    fileName: input.fileName.trim().slice(0, 200) || 'document.jpg',
    dataUrl: uploaded ? uploaded.downloadUrl : input.dataUrl,
    ...(uploaded
      ? {
          viewUrl: uploaded.viewUrl,
          storagePath: uploaded.storagePath,
          sizeBytes: uploaded.sizeBytes,
        }
      : { sizeBytes: estimateDataUrlBytes(input.dataUrl) }),
    uploadedAt: new Date().toISOString(),
  };

  const latestAll = getAllTravelers();
  const latest = latestAll[phone] || existing;
  const updated: TravelerProfile = {
    ...latest,
    documents: [newDoc, ...(latest.documents || [])].slice(0, 30),
  };

  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  const senderLabel =
    updated.accountType === 'b2b_partner' && updated.companyName
      ? updated.companyName
      : updated.name;
  void dispatchRemotePushNotification({
    targetRole: 'admin',
    title:
      newDoc.docType === 'receipt'
        ? `إيصال دفع جديد من ${senderLabel}`
        : `مستند جديد مرفوع من ${senderLabel}`,
    body: `${newDoc.label} (${newDoc.fileName})`.slice(0, 300),
    data: { role: 'admin', action: 'client_folder', phone },
  });
  return { profile: updated, document: newDoc };
}

/**
 * Immediately uploads & saves a newly captured/selected profile avatar to Google Drive + Firestore,
 * updating Navbar, Chat & Admin lists instantly without needing an extra Save Draft step.
 */
export async function uploadAndSaveAvatarImmediateCloud(
  rawPhone: string,
  dataUrl: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing || !dataUrl.startsWith('data:')) return null;

  const uploaded = await uploadTravelerAvatarToStorage(phone, dataUrl);
  const latestAll = getAllTravelers();
  const latest = latestAll[phone] || existing;

  let nextAvatarUrl = dataUrl;
  let nextAvatarStoragePath = latest.avatarStoragePath;
  let nextAvatarSizeBytes = estimateDataUrlBytes(dataUrl);

  if (uploaded) {
    if (latest.avatarStoragePath && latest.avatarStoragePath !== uploaded.storagePath) {
      void deleteTravelerDocumentFromStorage(latest.avatarStoragePath);
    }
    nextAvatarUrl = uploaded.downloadUrl;
    nextAvatarStoragePath = uploaded.storagePath;
    nextAvatarSizeBytes = uploaded.sizeBytes;
  }

  const updated: TravelerProfile = {
    ...latest,
    avatarUrl: nextAvatarUrl,
    ...(nextAvatarStoragePath ? { avatarStoragePath: nextAvatarStoragePath } : {}),
    avatarSizeBytes: nextAvatarSizeBytes,
    updatedAt: new Date().toISOString(),
  };

  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  return updated;
}

/**
 * Multi-file / batch passport & PDF uploader for Client & B2B Partner Document Wallets.
 */
export async function uploadBatchFilesToTravelerCloud(
  rawPhone: string,
  files: File[],
  docType: TravelerDocument['docType'] = 'passport',
  labelPrefix = ''
): Promise<{ uploadedCount: number; profile: TravelerProfile | null; errors: string[] }> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  const existing = all[phone];
  if (!existing || !files.length) {
    return { uploadedCount: 0, profile: existing || null, errors: [] };
  }

  const addedDocs: TravelerDocument[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const uploaded = await uploadChatAttachmentToDrive(phone, file, 'client_docs');
      const nowIso = new Date().toISOString();
      addedDocs.push({
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: labelPrefix ? `${labelPrefix} — ${file.name}` : file.name,
        docType,
        fileName: uploaded.fileName,
        dataUrl: uploaded.downloadUrl,
        viewUrl: uploaded.viewUrl,
        storagePath: uploaded.storagePath,
        sizeBytes: uploaded.sizeBytes,
        uploadedAt: nowIso,
        status: 'received',
        statusUpdatedAt: nowIso,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${file.name}: ${msg}`);
    }
  }

  if (addedDocs.length === 0) {
    return { uploadedCount: 0, profile: getAllTravelers()[phone] || existing, errors };
  }

  const latestAll = getAllTravelers();
  const latest = latestAll[phone] || existing;
  const updated: TravelerProfile = {
    ...latest,
    documents: [...addedDocs, ...(latest.documents || [])].slice(0, 30),
    updatedAt: new Date().toISOString(),
  };

  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  const senderLabel =
    updated.accountType === 'b2b_partner' && updated.companyName
      ? updated.companyName
      : updated.name;
  const hasReceipt = addedDocs.some((d) => d.docType === 'receipt');
  void dispatchRemotePushNotification({
    targetRole: 'admin',
    title: hasReceipt
      ? `إيصال دفع جديد من ${senderLabel}`
      : `مستند جديد مرفوع من ${senderLabel}`,
    body: addedDocs.map((d) => `${d.label} (${d.fileName})`).join(' • ').slice(0, 300),
    data: { role: 'admin', action: 'client_folder', phone },
  });
  return { uploadedCount: addedDocs.length, profile: updated, errors };
}

/**
 * Admin Action: Updates per-document review status ('pending_completion' | 'received' | 'completed')
 * on an uploaded client/partner document and notifies the client in real time.
 */
export async function updateDocumentReviewStatusCloud(
  rawPhone: string,
  docId: string,
  status: DocumentReviewStatus,
  statusNote?: string
): Promise<TravelerProfile | null> {
  const phone = normalizePhone(rawPhone);
  const all = getAllTravelers();
  let existing: TravelerProfile | undefined = all[phone];

  try {
    const snap = await getDoc(doc(db, 'clients', phone));
    if (snap.exists()) {
      existing = mergeCloudClientWithLocal(snap.data() as TravelerProfile, all[phone]);
    }
  } catch {
    // Fallback to local
  }
  if (!existing) return null;

  const targetDoc = (existing.documents || []).find((d) => d.id === docId);
  if (!targetDoc) return existing;

  const nowIso = new Date().toISOString();
  const cleanNote = String(statusNote || '').trim().slice(0, 300);

  const nextDocs = (existing.documents || []).map((d) =>
    d.id === docId
      ? {
          ...d,
          status,
          ...(cleanNote ? { statusNote: cleanNote } : { statusNote: undefined }),
          statusUpdatedAt: nowIso,
        }
      : d
  );

  const statusLabels: Record<DocumentReviewStatus, { ar: string; en: string }> = {
    pending_completion: { ar: 'مطلوب استكماله / إعادة رفعه', en: 'Needs Completion / Re-upload' },
    received: { ar: 'تم الاستلام', en: 'Received' },
    completed: { ar: 'مكتمل ومعتمد', en: 'Completed & Approved' },
  };
  const labelInfo = statusLabels[status];

  const notif: ClientNotification = {
    id: `notif-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    titleAr: `تحديث حالة مستند: ${targetDoc.label}`,
    titleEn: `Document Review: ${targetDoc.label}`,
    bodyAr: `الحالة الجديدة: ${labelInfo.ar}${cleanNote ? ` — ملاحظة الإدارة: ${cleanNote}` : ''}`,
    bodyEn: `New status: ${labelInfo.en}${cleanNote ? ` — Note: ${cleanNote}` : ''}`,
    type: 'status',
    docId,
    createdAt: nowIso,
    read: false,
  };

  const updated: TravelerProfile = {
    ...existing,
    documents: nextDocs,
    notifications: [notif, ...(existing.notifications || [])].slice(0, 30),
    updatedAt: nowIso,
  };

  all[phone] = updated;
  saveAllTravelersLocalOnly(all);
  await syncTravelerToCloud(updated);

  // Also post a clear status notice in the private chat thread
  void sendChatMessageCloud({
    phone,
    senderRole: 'admin',
    senderName: 'إدارة مسارك',
    text: `📄 تحديث حالة المستند (${targetDoc.label}): ${labelInfo.ar}${
      cleanNote ? `\nملاحظة: ${cleanNote}` : ''
    }`,
    messageType: 'status_notice',
    accountType: updated.accountType || 'individual',
    clientName: updated.name,
    companyName: updated.companyName,
  });

  void dispatchRemotePushNotification({
    targetRole: 'client',
    targetPhone: phone,
    title: notif.titleAr,
    body: notif.bodyAr,
    data: { role: 'client', action: 'documents', phone },
  });

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
  let nextAvatarSizeBytes = existing.avatarSizeBytes;

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
        nextAvatarSizeBytes = uploadedAvatar.sizeBytes;
      } else {
        // Offline local fallback (sanitizeClientForFirestore skips >4096 base64 from Firestore)
        nextAvatarUrl = draft.pendingAvatarPreviewUrl;
        nextAvatarSizeBytes = estimateDataUrlBytes(draft.pendingAvatarPreviewUrl);
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

  // 3. Upload newly staged documents to Google Drive
  const uploadedNewDocs: TravelerDocument[] = [];
  for (const staged of draft.pendingDocuments || []) {
    const uploaded = await uploadTravelerDocumentToStorage(
      phone,
      staged.id,
      staged.dataUrl,
      staged.fileName
    );
    uploadedNewDocs.push({
      id: staged.id,
      label: staged.label,
      docType: staged.docType,
      fileName: staged.fileName,
      dataUrl: uploaded ? uploaded.downloadUrl : staged.dataUrl,
      ...(uploaded
        ? {
            viewUrl: uploaded.viewUrl,
            storagePath: uploaded.storagePath,
            sizeBytes: uploaded.sizeBytes,
          }
        : { sizeBytes: estimateDataUrlBytes(staged.dataUrl) }),
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
    ...(typeof nextAvatarSizeBytes === 'number' ? { avatarSizeBytes: nextAvatarSizeBytes } : {}),
    documents: [...uploadedNewDocs, ...keptDocs],
  };

  latestAll[phone] = updated;
  saveAllTravelersLocalOnly(latestAll);
  await syncTravelerToCloud(updated);
  if (uploadedNewDocs.length > 0) {
    const senderLabel =
      updated.accountType === 'b2b_partner' && updated.companyName
        ? updated.companyName
        : updated.name;
    const hasReceipt = uploadedNewDocs.some((d) => d.docType === 'receipt');
    void dispatchRemotePushNotification({
      targetRole: 'admin',
      title: hasReceipt
        ? `إيصال دفع جديد من ${senderLabel}`
        : `مستند جديد مرفوع من ${senderLabel}`,
      body: uploadedNewDocs.map((d) => `${d.label} (${d.fileName})`).join(' • ').slice(0, 300),
      data: { role: 'admin', action: 'client_folder', phone },
    });
  }
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
  let finalPassportSizeBytes = existingMember?.passportSizeBytes;

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
      finalPassportSizeBytes = uploadedPassport.sizeBytes;
    }
  }

  // Upload personal photo to Firebase Storage if a fresh dataUrl was provided
  let finalPersonalPhotoUrl = memberInput.personalPhotoUrl || existingMember?.personalPhotoUrl || '';
  let finalPersonalStoragePath = existingMember?.personalPhotoStoragePath;
  let finalPersonalSizeBytes = existingMember?.personalPhotoSizeBytes;

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
      finalPersonalSizeBytes = uploadedPersonal.sizeBytes;
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
    ...(typeof finalPassportSizeBytes === 'number' ? { passportSizeBytes: finalPassportSizeBytes } : {}),
    personalPhotoUrl: finalPersonalPhotoUrl,
    ...(finalPersonalStoragePath ? { personalPhotoStoragePath: finalPersonalStoragePath } : {}),
    ...(typeof finalPersonalSizeBytes === 'number' ? { personalPhotoSizeBytes: finalPersonalSizeBytes } : {}),
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
    void deleteDoc(doc(db, 'order_status', phone)).catch(() => {});
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
  const uploaded = await uploadTravelerDocumentToStorage(
    phone,
    docId,
    docInput.dataUrl,
    docInput.fileName
  );

  const newDoc: TravelerDocument = {
    id: docId,
    label: docInput.label,
    docType: docInput.docType,
    fileName: docInput.fileName,
    dataUrl: uploaded ? uploaded.downloadUrl : docInput.dataUrl,
    ...(uploaded
      ? {
          viewUrl: uploaded.viewUrl,
          storagePath: uploaded.storagePath,
          sizeBytes: uploaded.sizeBytes,
        }
      : { sizeBytes: estimateDataUrlBytes(docInput.dataUrl) }),
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
  const senderLabel =
    updated.accountType === 'b2b_partner' && updated.companyName
      ? updated.companyName
      : updated.name;
  void dispatchRemotePushNotification({
    targetRole: 'admin',
    title:
      newDoc.docType === 'receipt'
        ? `إيصال دفع جديد من ${senderLabel}`
        : `مستند جديد مرفوع من ${senderLabel}`,
    body: `${newDoc.label} (${newDoc.fileName})`.slice(0, 300),
    data: { role: 'admin', action: 'client_folder', phone },
  });
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
    version: '1.0.1',
    clients: Object.values(getAllTravelers()),
    siteConfig: getSiteConfig(),
    cmsData: getCmsState(),
  };
  return JSON.stringify(payload, null, 2);
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1100,
  initialQuality = 0.74
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المختار.'));
    reader.onload = () => {
      const resultStr = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة.'));
      img.onload = () => {
        const targetMaxBytes = Math.min(MAX_IMAGE_BYTES - 16 * 1024, 480 * 1024);
        let currentMaxDim = maxDimension;
        let currentQuality = initialQuality;
        let compressed = resultStr;

        for (let attempt = 0; attempt < 7; attempt++) {
          let { width, height } = img;
          if (width > currentMaxDim || height > currentMaxDim) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * currentMaxDim) / width));
              width = currentMaxDim;
            } else {
              width = Math.max(1, Math.round((width * currentMaxDim) / height));
              height = currentMaxDim;
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
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          compressed = canvas.toDataURL('image/jpeg', currentQuality);

          if (estimateDataUrlBytes(compressed) <= targetMaxBytes) {
            break;
          }

          if (currentQuality > 0.5) {
            currentQuality = Math.max(0.44, Number((currentQuality - 0.1).toFixed(2)));
          } else {
            currentMaxDim = Math.max(600, Math.round(currentMaxDim * 0.78));
          }
        }

        const base64 = compressed.split(',')[1] || '';
        resolve({ dataUrl: compressed, base64, mimeType: 'image/jpeg' });
      };
      img.src = resultStr;
    };
    reader.readAsDataURL(file);
  });
}

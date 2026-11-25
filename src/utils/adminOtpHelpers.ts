import type { TravelerProfile } from '../types/travel';
import {
  isClientAccountVerified,
  normalizeWhatsAppPhoneDigits,
} from './whatsappHelpers';

export interface PendingOtpSnapshotEntry {
  verified: boolean;
  accountStatus?: string;
  otpGeneratedAt: string;
  otp: string;
}

/**
 * Builds an RFC-5724 / Android & iOS compatible `sms:` URI with E.164 formatted phone
 * and URL-encoded message body for sending OTP activation details via SMS.
 */
export function buildSmsSendUrl(
  rawPhone?: string | null,
  message?: string | null
): string {
  const digits = normalizeWhatsAppPhoneDigits(rawPhone);
  const target = digits ? `+${digits}` : '';
  const trimmedMsg = String(message || '').trim();
  if (!trimmedMsg) {
    return `sms:${target}`;
  }
  return `sms:${target}?body=${encodeURIComponent(trimmedMsg)}`;
}

/**
 * Returns unverified / pending-verification clients sorted newest-first
 * by OTP generation or registration timestamp.
 */
export function getPendingOtpClients(
  travelers: readonly TravelerProfile[]
): TravelerProfile[] {
  return travelers
    .filter((tr) => !isClientAccountVerified(tr))
    .sort((a, b) => {
      const timeB = Date.parse(b.otpGeneratedAt || b.createdAt || '') || 0;
      const timeA = Date.parse(a.otpGeneratedAt || a.createdAt || '') || 0;
      return timeB - timeA;
    });
}

/**
 * Builds a comparable snapshot map of clients' verification & OTP state.
 */
export function buildPendingOtpSnapshot(
  travelers: readonly TravelerProfile[]
): Map<string, PendingOtpSnapshotEntry> {
  const map = new Map<string, PendingOtpSnapshotEntry>();
  for (const tr of travelers) {
    const key = tr.phoneNormalized || tr.phone;
    if (!key) continue;
    map.set(key, {
      verified: tr.verified === true,
      accountStatus: tr.accountStatus,
      otpGeneratedAt: tr.otpGeneratedAt || '',
      otp: tr.otp || '',
    });
  }
  return map;
}

/**
 * Detects whether a brand-new unverified client or freshly regenerated OTP arrived
 * after the initial Firestore snapshot hydration, so the admin chime triggers cleanly once.
 */
export function findNewPendingOtpTrigger(
  prevSnapshot: Map<string, PendingOtpSnapshotEntry>,
  travelers: readonly TravelerProfile[],
  hydrated: boolean
): {
  nextSnapshot: Map<string, PendingOtpSnapshotEntry>;
  triggeredClient: TravelerProfile | null;
} {
  const nextSnapshot = buildPendingOtpSnapshot(travelers);
  if (!hydrated) {
    return { nextSnapshot, triggeredClient: null };
  }

  for (const tr of travelers) {
    if (isClientAccountVerified(tr)) continue;
    const key = tr.phoneNormalized || tr.phone;
    if (!key) continue;
    const prev = prevSnapshot.get(key);
    const isBrandNewUnverified = !prev;
    const isFreshOtpIssued =
      Boolean(prev) &&
      ((Boolean(tr.otpGeneratedAt) && prev?.otpGeneratedAt !== tr.otpGeneratedAt) ||
        (Boolean(tr.otp) && prev?.otp !== tr.otp));

    if (isBrandNewUnverified || isFreshOtpIssued) {
      return { nextSnapshot, triggeredClient: tr };
    }
  }

  return { nextSnapshot, triggeredClient: null };
}

export interface AdminOtpPushPayloadContent {
  title: string;
  body: string;
}

/**
 * Formats the exact push notification title & body sent to Admins via Cloudflare Worker
 * whenever a client registers or requests/regenerates a 6-digit OTP code.
 */
export function buildAdminNewOtpPushNotification(opts: {
  name?: string | null;
  phone: string;
  otp: string;
}): AdminOtpPushPayloadContent {
  const cleanName = String(opts.name || '').trim() || 'عميل جديد';
  const cleanPhone = String(opts.phone || '').trim();
  const cleanOtp = String(opts.otp || '').trim();
  return {
    title: 'طلب كود تفعيل جديد (OTP) 🔐',
    body: `العميل ${cleanName} (رقم: ${cleanPhone}) سجل حساباً جديداً وبانتظار إرسال كود التفعيل: ${cleanOtp}.`,
  };
}


export const OFFICIAL_COMPANY_WHATSAPP_NUMBER = '201128440008';

function normalizeArabicDigitsPure(input: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return input.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

/**
 * Normalizes any phone string into clean international digits suitable for WhatsApp `api.whatsapp.com/send`.
 * Converts Egyptian local numbers (01XXXXXXXXX -> 201XXXXXXXXX) and strips leading `00` / `+` / spaces.
 */
export function normalizeWhatsAppPhoneDigits(rawPhone?: string | null): string {
  const digits = normalizeArabicDigitsPure(String(rawPhone || '')).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    const stripped = digits.slice(2);
    if (stripped.startsWith('01') && stripped.length === 11) {
      return `2${stripped}`;
    }
    return stripped;
  }
  if (digits.startsWith('01') && digits.length === 11) {
    return `2${digits}`;
  }
  return digits;
}

/**
 * Formats a phone number cleanly for human-readable WhatsApp message bodies.
 */
export function formatWhatsAppPhoneForMessage(rawPhone?: string | null): string {
  const raw = normalizeArabicDigitsPure(String(rawPhone || '')).trim();
  if (!raw) return '';
  const digits = normalizeWhatsAppPhoneDigits(raw);
  if (!digits) return '';
  if (digits.startsWith('20') && digits.length === 12) {
    return digits.slice(1); // 01XXXXXXXXX
  }
  return digits;
}

/**
 * Resolves the official Masarik Tourism WhatsApp target for receiving client OTP requests.
 * Always guarantees a number ending in `0008` (official platform number `201128440008`).
 */
export function resolveOtpCompanyWhatsAppNumber(sitePhoneNumber?: string | null): string {
  const normalized = normalizeWhatsAppPhoneDigits(sitePhoneNumber);
  if (/^[0-9]{8,20}$/.test(normalized) && normalized.endsWith('0008')) {
    return normalized;
  }
  return OFFICIAL_COMPANY_WHATSAPP_NUMBER;
}

/**
 * Builds a universal `https://api.whatsapp.com/send?phone=...&text=...` URL
 * so Android prompts users with an app picker (WhatsApp Business vs personal WhatsApp).
 */
export function buildWhatsAppSendUrl(phone?: string | null, message?: string | null): string {
  const digits = normalizeWhatsAppPhoneDigits(phone) || OFFICIAL_COMPANY_WHATSAPP_NUMBER;
  const trimmedMsg = String(message || '').trim();
  if (!trimmedMsg) {
    return `https://api.whatsapp.com/send?phone=${digits}`;
  }
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(trimmedMsg)}`;
}

/**
 * Builds the prefilled OTP request text sent by the customer to the official company WhatsApp (`...0008`).
 */
export function buildClientOtpRequestMessage(
  clientPhone?: string | null,
  lang: 'ar' | 'en' = 'ar'
): string {
  const formattedPhone = formatWhatsAppPhoneForMessage(clientPhone);
  if (lang === 'en') {
    return formattedPhone
      ? `Hello Masarik, please send the activation code for my account number: ${formattedPhone}`
      : 'Hello Masarik, please send my account activation code';
  }
  return formattedPhone
    ? `مرحباً مسارك، أرجو إرسال كود تفعيل حسابي رقم: ${formattedPhone}`
    : 'مرحباً مسارك، أرجو إرسال كود تفعيل حسابي';
}

/**
 * Builds the full `https://api.whatsapp.com/send?phone=201128440008&text=...` URL
 * for the "طلب كود تفعيل (OTP) عبر الواتساب" button.
 */
export function buildClientOtpRequestUrl(
  clientPhone?: string | null,
  lang: 'ar' | 'en' = 'ar',
  sitePhoneNumber?: string | null
): string {
  const targetPhone = resolveOtpCompanyWhatsAppNumber(sitePhoneNumber);
  const message = buildClientOtpRequestMessage(clientPhone, lang);
  return buildWhatsAppSendUrl(targetPhone, message);
}

/**
 * Strict verification gate: a client is considered verified ONLY when `verified === true`
 * and `accountStatus` is NOT `'pending_verification'`.
 */
export function isClientAccountVerified(
  profile?: { verified?: boolean; accountStatus?: string } | null
): boolean {
  if (!profile) return false;
  return profile.verified === true && profile.accountStatus !== 'pending_verification';
}

/**
 * Default unverified state fields for every newly registered client account.
 */
export function createPendingVerificationClientFields() {
  return {
    verified: false,
    accountStatus: 'pending_verification' as const,
    activatedByAdmin: false,
    otpConsumed: false,
  };
}

/**
 * Determines whether a client account has an actual submitted/active service order
 * (separating mere account registration from real service submission).
 */
export function hasClientActiveOrder(
  profile?: {
    orderStatus?: string;
    hasActiveOrder?: boolean;
    preferredVisaType?: string;
    documents?: unknown[];
    issuedDocuments?: unknown[];
    appointmentDetails?: { appointmentDate?: string } | null;
  } | null
): boolean {
  if (!profile) return false;
  if (profile.orderStatus === 'none' || profile.orderStatus === 'بدون طلبات نشطة') {
    return false;
  }
  if (profile.hasActiveOrder === false) {
    return false;
  }
  if (profile.hasActiveOrder === true) {
    return true;
  }
  const st = String(profile.orderStatus || '').trim();
  const isBeyondStageOne =
    st === 'قيد المراجعة والتنفيذ' ||
    st === 'تحت المراجعة' ||
    st === 'تم الحجز / الإصدار' ||
    st === 'تم حجز موعد تساهيل' ||
    st === 'تم تنفيذ الطلب' ||
    st === 'مكتمل' ||
    st === 'صدرت التأشيرة';
  const hasService = Boolean((profile.preferredVisaType || '').trim());
  const hasDocs = Array.isArray(profile.documents) && profile.documents.length > 0;
  const hasIssued = Array.isArray(profile.issuedDocuments) && profile.issuedDocuments.length > 0;
  const hasAppointment = Boolean(profile.appointmentDetails?.appointmentDate?.trim());

  return isBeyondStageOne || hasService || hasDocs || hasIssued || hasAppointment;
}

/**
 * Returns true only when the client has an active order AND it reached the final completed stage.
 */
export function isClientOrderCompleted(
  profile?: {
    orderStatus?: string;
    hasActiveOrder?: boolean;
    preferredVisaType?: string;
    documents?: unknown[];
    issuedDocuments?: unknown[];
    appointmentDetails?: { appointmentDate?: string } | null;
  } | null
): boolean {
  if (!hasClientActiveOrder(profile)) return false;
  const st = String(profile?.orderStatus || '').trim();
  return st === 'تم تنفيذ الطلب' || st === 'مكتمل' || st === 'صدرت التأشيرة';
}

/**
 * Builds the localized WhatsApp message when Admin notifies a client of a stage update (stages 2, 3, or 4).
 */
export function buildAdminStageWhatsAppMessage(params: {
  clientName: string;
  orderCode: string;
  stageLabel: string;
  serviceTitle?: string;
  lang?: 'ar' | 'en';
}): string {
  const { clientName, orderCode, stageLabel, serviceTitle, lang = 'ar' } = params;
  const cleanName = clientName.trim() || (lang === 'en' ? 'Valued Client' : 'عميلنا العزيز');
  const cleanService = (serviceTitle || '').trim();

  if (lang === 'en') {
    return `Hello ${cleanName},
Masarik Tourism team has updated your order (${orderCode})${cleanService ? ` for (${cleanService})` : ''} to:
• Current Stage: ${stageLabel}
You can track your order details and documents inside the Masarik app/portal. Thank you.`;
  }

  return `السلام عليكم ${cleanName}،
يود فريق مسارك للإنجاز السياحي إبلاغكم بتحديث حالة طلبكم رقم (${orderCode})${cleanService ? ` الخاص بخدمة (${cleanService})` : ''} إلى:
• المرحلة الحالية: ${stageLabel}
يمكنكم متابعة تفاصيل الطلب والمستندات عبر حسابكم في تطبيق ومنصة مسارك. مع خالص التحية.`;
}

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

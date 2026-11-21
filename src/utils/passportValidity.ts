export type PassportValidityStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing';

export interface PassportValidityEvaluation {
  expiryDate: string;
  isValidFormat: boolean;
  remainingDays: number | null;
  status: PassportValidityStatus;
  /** True whenever passport is expired OR has less than 6 months (180 days) remaining */
  isUnderSixMonths: boolean;
  isExpired: boolean;
  warningBannerAr: string;
  warningBannerEn: string;
}

export const SIX_MONTH_MIN_DAYS = 180;

export const SIX_MONTH_WARNING_AR =
  'تنبيه: صلاحية الجواز أقل من 6 أشهر ولا تصلح للسفر أو إصدار التأشيرات';
export const SIX_MONTH_WARNING_EN =
  'Warning: Passport validity is under 6 months and is not valid for travel or visa issuance';

/**
 * Deterministic UTC calendar-day evaluation for the mandatory 6-month (180-day) passport validity rule.
 */
export function evaluatePassportValidity(expiryDateRaw?: string | null): PassportValidityEvaluation {
  const cleaned = String(expiryDateRaw || '').trim();
  if (!cleaned || !/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return {
      expiryDate: cleaned,
      isValidFormat: false,
      remainingDays: null,
      status: 'missing',
      isUnderSixMonths: false,
      isExpired: false,
      warningBannerAr: '',
      warningBannerEn: '',
    };
  }

  const [y, m, d] = cleaned.split('-').map(Number);
  const expiryUtc = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(expiryUtc)) {
    return {
      expiryDate: cleaned,
      isValidFormat: false,
      remainingDays: null,
      status: 'missing',
      isUnderSixMonths: false,
      isExpired: false,
      warningBannerAr: '',
      warningBannerEn: '',
    };
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const remainingDays = Math.floor((expiryUtc - todayUtc) / (1000 * 60 * 60 * 24));

  if (remainingDays <= 0) {
    return {
      expiryDate: cleaned,
      isValidFormat: true,
      remainingDays,
      status: 'expired',
      isUnderSixMonths: true,
      isExpired: true,
      warningBannerAr: SIX_MONTH_WARNING_AR,
      warningBannerEn: SIX_MONTH_WARNING_EN,
    };
  }

  if (remainingDays < SIX_MONTH_MIN_DAYS) {
    return {
      expiryDate: cleaned,
      isValidFormat: true,
      remainingDays,
      status: 'expiring_soon',
      isUnderSixMonths: true,
      isExpired: false,
      warningBannerAr: SIX_MONTH_WARNING_AR,
      warningBannerEn: SIX_MONTH_WARNING_EN,
    };
  }

  return {
    expiryDate: cleaned,
    isValidFormat: true,
    remainingDays,
    status: 'valid',
    isUnderSixMonths: false,
    isExpired: false,
    warningBannerAr: '',
    warningBannerEn: '',
  };
}

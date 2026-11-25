import type { B2cVisaRecord, B2cVisaType } from '../types/travel';

export type B2cAlertLevel = 'safe' | 'warning' | 'urgent' | 'exited';

export interface B2cCountdownEvaluation {
  expectedExitDate: string;
  remainingDays: number;
  elapsedDays: number;
  stayDays: number;
  progressPercent: number;
  alertLevel: B2cAlertLevel;
}

function parseIsoDateToUtcMs(dateStr?: string | null): number | null {
  const clean = String(dateStr || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calculateExpectedExitDate(entryDate: string, stayDays: number): string {
  const startMs = parseIsoDateToUtcMs(entryDate);
  const safeDays = Math.max(1, Math.min(365, Math.round(Number(stayDays) || 0)));
  if (startMs === null || !Number.isFinite(safeDays) || safeDays < 1) {
    return '';
  }
  const exitDate = new Date(startMs + safeDays * 86400000);
  const y = exitDate.getUTCFullYear();
  const m = String(exitDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(exitDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function evaluateB2cExitCountdown(
  record?: Partial<B2cVisaRecord> | null,
  referenceDate?: string
): B2cCountdownEvaluation | null {
  if (!record || !record.entryDate) return null;
  const stayDays = Math.max(1, Math.min(365, Math.round(Number(record.stayDays) || 0)));
  const expectedExitDate =
    (record.expectedExitDate && /^\d{4}-\d{2}-\d{2}$/.test(record.expectedExitDate)
      ? record.expectedExitDate
      : '') || calculateExpectedExitDate(record.entryDate, stayDays);

  const entryMs = parseIsoDateToUtcMs(record.entryDate);
  const exitMs = parseIsoDateToUtcMs(expectedExitDate);
  const todayMs = parseIsoDateToUtcMs(referenceDate || getTodayIsoDate());
  if (entryMs === null || exitMs === null || todayMs === null) return null;

  const remainingDays = Math.round((exitMs - todayMs) / 86400000);
  const elapsedDays = Math.max(0, Math.round((todayMs - entryMs) / 86400000));
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round((elapsedDays / Math.max(1, stayDays)) * 100))
  );

  let alertLevel: B2cAlertLevel = 'safe';
  if (record.status === 'exited') {
    alertLevel = 'exited';
  } else if (remainingDays <= 1) {
    alertLevel = 'urgent';
  } else if (remainingDays <= 5) {
    alertLevel = 'warning';
  }

  return {
    expectedExitDate,
    remainingDays,
    elapsedDays,
    stayDays,
    progressPercent,
    alertLevel,
  };
}

export function isB2cUrgentOrWarning(
  record?: Partial<B2cVisaRecord> | null,
  referenceDate?: string
): boolean {
  if (!record || record.status === 'exited') return false;
  const evalRes = evaluateB2cExitCountdown(record, referenceDate);
  if (!evalRes) return false;
  return evalRes.alertLevel === 'urgent' || evalRes.alertLevel === 'warning';
}

export function formatB2cVisaTypeLabel(visaType: B2cVisaType, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') {
    return visaType === 'umrah_b2c' ? 'Umrah B2C' : 'Free B2C';
  }
  return visaType === 'umrah_b2c' ? 'عمرة B2C' : 'B2C حرة';
}

export function buildB2cExitReminderWhatsAppMessage(params: {
  clientName: string;
  passportNumber?: string;
  visaType: B2cVisaType;
  expectedExitDate: string;
  remainingDays: number;
  lang?: 'ar' | 'en';
}): string {
  const {
    clientName,
    passportNumber,
    visaType,
    expectedExitDate,
    remainingDays,
    lang = 'ar',
  } = params;
  const cleanName = clientName.trim() || (lang === 'en' ? 'Valued Traveler' : 'مسافرنا الكريم');
  const visaLabel = formatB2cVisaTypeLabel(visaType, lang);
  const cleanPassport = (passportNumber || '').trim().toUpperCase();

  if (lang === 'en') {
    const statusLine =
      remainingDays < 0
        ? `Notice: your maximum exit deadline (${expectedExitDate}) has passed by ${Math.abs(remainingDays)} day(s).`
        : remainingDays === 0
        ? `Urgent reminder: today (${expectedExitDate}) is your maximum expected departure date.`
        : `Reminder: you have ${remainingDays} day(s) remaining before your maximum expected departure date (${expectedExitDate}).`;

    return `Hello ${cleanName},
Masarik Tourism team wishes you a safe stay.${cleanPassport ? ` (Passport: ${cleanPassport})` : ''}
• Visa Type: ${visaLabel}
• ${statusLine}
Please make sure to depart on or before the deadline to avoid any overstay fines or legal violations. Contact us anytime for flight or assistance support.`;
  }

  const timingLine =
    remainingDays < 0
      ? `تنبيه هام: قد تم تجاوز أقصى موعد متوقع لمغادرتكم (${expectedExitDate}) بـ ${Math.abs(remainingDays)} يوم.`
      : remainingDays === 0
      ? `تنبيه عاجل: اليوم (${expectedExitDate}) هو أقصى موعد متوقع لمغادرتكم الأراضي السعودية.`
      : remainingDays === 1
      ? `تنبيه عاجل: متبقي يوم واحد فقط على أقصى موعد متوقع لمغادرتكم (${expectedExitDate}).`
      : `تذكير ودي: متبقي ${remainingDays} أيام على أقصى موعد متوقع لمغادرتكم (${expectedExitDate}).`;

  return `السلام عليكم ${cleanName}،
معكم فريق مسارك للإنجاز السياحي، نرجو لكم رحلة طيبة وتقبّل الله طاعتكم.${cleanPassport ? `\n• رقم الجواز: ${cleanPassport}` : ''}
• نوع التأشيرة: ${visaLabel}
• ${timingLine}
نرجو التكرم بالالتزام بموعد المغادرة المحدد لتجنب أي غرامات تأخير أو مخالفات نظامية، ويسعدنا دائماً خدمتكم في حجز العودة أو أي استفسار.`;
}

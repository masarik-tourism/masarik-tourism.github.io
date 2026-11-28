import {
  ChatMessage,
  ChatThreadSummary,
  ClientPriorityTier,
  TravelerProfile,
} from '../types/travel';
import {
  hasClientActiveOrder,
  isClientAccountVerified,
  isClientOrderCompleted,
} from './whatsappHelpers';

export const CLIENT_PRIORITY_TIERS: readonly ClientPriorityTier[] = ['vip', 'new', 'delayed'];

export interface ClientTierDisplayConfig {
  tier: ClientPriorityTier | 'standard';
  isClassified: boolean;
  label: string;
  shortLabel: string;
  badgeClass: string;
  avatarRingClass: string;
  avatarFallbackClass: string;
  cornerBadgeClass: string;
  cardAccentClass: string;
  modalAvatarClass: string;
  chartColor: string;
}

export interface MonthlyReportPoint {
  monthKey: string;
  monthLabel: string;
  totalOrders: number;
  completedVisas: number;
  inProgressOrders: number;
  newClients: number;
}

export interface TierBreakdownPoint {
  key: ClientPriorityTier | 'standard';
  name: string;
  count: number;
  color: string;
}

export interface SixMonthReportsSummary {
  monthlyTrends: MonthlyReportPoint[];
  totalOrders6M: number;
  completedVisas6M: number;
  inProgressOrders6M: number;
  newClients6M: number;
  completionRatePct: number;
  tierCounts: {
    vip: number;
    new: number;
    delayed: number;
    standard: number;
  };
  tierBreakdown: TierBreakdownPoint[];
}

const ARABIC_GREGORIAN_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const ENGLISH_SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function normalizeClientPriorityTier(
  tier?: string | null
): ClientPriorityTier | undefined {
  if (tier === 'vip' || tier === 'new' || tier === 'delayed') {
    return tier;
  }
  return undefined;
}

export function getClientTierConfig(
  tier?: ClientPriorityTier | string | null,
  lang: 'ar' | 'en' = 'ar'
): ClientTierDisplayConfig {
  const normalized = normalizeClientPriorityTier(tier);
  if (normalized === 'vip') {
    return {
      tier: 'vip',
      isClassified: true,
      label: lang === 'en' ? 'VIP Client' : 'عميل VIP',
      shortLabel: 'VIP',
      badgeClass:
        'bg-gradient-to-l from-[#FAF0D7] to-[#F5E1AC] border-[#C6A052] text-[#7A5611]',
      avatarRingClass: 'border-2 border-[#C6A052] ring-2 ring-[#C6A052]/35 shadow-sm',
      avatarFallbackClass:
        'bg-gradient-to-br from-[#C6A052] via-[#E5C887] to-[#9E7B33] text-[#0A1926] border-2 border-amber-300 shadow-sm',
      cornerBadgeClass: 'bg-[#C6A052] text-[#0A1926] border-white',
      cardAccentClass: 'border-amber-300/90 bg-gradient-to-l from-amber-50/40 via-white to-white',
      modalAvatarClass:
        'bg-gradient-to-br from-[#C6A052] via-[#E5C887] to-[#9E7B33] text-[#0A1926] border-2 border-amber-200',
      chartColor: '#C6A052',
    };
  }

  if (normalized === 'new') {
    return {
      tier: 'new',
      isClassified: true,
      label: lang === 'en' ? 'New Client' : 'عميل جديد',
      shortLabel: lang === 'en' ? 'New' : 'جديد',
      badgeClass: 'bg-sky-50 border-sky-300 text-sky-900',
      avatarRingClass: 'border-2 border-sky-500 ring-2 ring-sky-200 shadow-xs',
      avatarFallbackClass:
        'bg-sky-600 text-white border-2 border-sky-300 shadow-xs',
      cornerBadgeClass: 'bg-sky-600 text-white border-white',
      cardAccentClass: 'border-sky-200/90 bg-gradient-to-l from-sky-50/35 via-white to-white',
      modalAvatarClass: 'bg-sky-600 text-white border-2 border-sky-300',
      chartColor: '#0284C7',
    };
  }

  if (normalized === 'delayed') {
    return {
      tier: 'delayed',
      isClassified: true,
      label: lang === 'en' ? 'Delayed / Urgent Follow-up' : 'عميل متأخر',
      shortLabel: lang === 'en' ? 'Delayed' : 'متأخر',
      badgeClass: 'bg-red-50 border-red-300 text-red-800',
      avatarRingClass: 'border-2 border-red-500 ring-2 ring-red-200 shadow-xs',
      avatarFallbackClass:
        'bg-red-600 text-white border-2 border-red-300 shadow-xs',
      cornerBadgeClass: 'bg-red-600 text-white border-white',
      cardAccentClass: 'border-red-300/90 bg-gradient-to-l from-red-50/35 via-white to-white',
      modalAvatarClass: 'bg-red-600 text-white border-2 border-red-300',
      chartColor: '#DC2626',
    };
  }

  return {
    tier: 'standard',
    isClassified: false,
    label: lang === 'en' ? 'Standard' : 'تصنيف عادي',
    shortLabel: lang === 'en' ? 'Standard' : 'عادي',
    badgeClass: 'bg-slate-100 border-slate-200 text-slate-600',
    avatarRingClass: 'border-2 border-[#C6A052]',
    avatarFallbackClass: 'bg-[#0F2438] text-[#E5C887] border border-[#C6A052]/60',
    cornerBadgeClass: 'bg-slate-500 text-white border-white',
    cardAccentClass: 'border-slate-200',
    modalAvatarClass: 'bg-[#C6A052]/20 text-[#E5C887] border border-[#C6A052]/70',
    chartColor: '#64748B',
  };
}

function toMonthKey(dateInput?: string | null): string | null {
  const raw = String(dateInput || '').trim();
  if (!raw) return null;
  const isoPrefixMatch = /^(\d{4})-(\d{2})/.exec(raw);
  if (isoPrefixMatch) {
    const monthNum = Number(isoPrefixMatch[2]);
    if (monthNum >= 1 && monthNum <= 12) {
      return `${isoPrefixMatch[1]}-${isoPrefixMatch[2]}`;
    }
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthLabel(year: number, monthIndexZeroBased: number, lang: 'ar' | 'en'): string {
  const shortYear = String(year).slice(-2);
  if (lang === 'en') {
    return `${ENGLISH_SHORT_MONTHS[monthIndexZeroBased] || ''} '${shortYear}`;
  }
  return `${ARABIC_GREGORIAN_MONTHS[monthIndexZeroBased] || ''} ${year}`;
}

export function buildSixMonthReportsData(
  travelers: TravelerProfile[],
  lang: 'ar' | 'en' = 'ar',
  referenceDate: Date = new Date()
): SixMonthReportsSummary {
  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth(); // 0..11

  const buckets = new Map<string, MonthlyReportPoint>();
  const orderedKeys: string[] = [];

  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(Date.UTC(refYear, refMonth - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    orderedKeys.push(key);
    buckets.set(key, {
      monthKey: key,
      monthLabel: formatMonthLabel(y, m, lang),
      totalOrders: 0,
      completedVisas: 0,
      inProgressOrders: 0,
      newClients: 0,
    });
  }

  const tierCounts = {
    vip: 0,
    new: 0,
    delayed: 0,
    standard: 0,
  };

  for (const tr of travelers) {
    const normalizedTier = normalizeClientPriorityTier(tr.clientTier);
    if (normalizedTier === 'vip') tierCounts.vip++;
    else if (normalizedTier === 'new') tierCounts.new++;
    else if (normalizedTier === 'delayed') tierCounts.delayed++;
    else tierCounts.standard++;

    const createdMonth = toMonthKey(tr.createdAt);
    if (createdMonth && buckets.has(createdMonth)) {
      buckets.get(createdMonth)!.newClients++;
    }

    const hasOrder = hasClientActiveOrder(tr) || Boolean(tr.b2cVisa);
    const isCompletedOrder = isClientOrderCompleted(tr);

    const visaIssuedDoc = (tr.issuedDocuments || [])
      .filter((doc) => /تأشير|visa/i.test(`${doc.docTypeLabel || ''} ${doc.fileName || ''}`))
      .sort((a, b) => Date.parse(b.issuedAt || '') - Date.parse(a.issuedAt || ''))[0];

    const anyLatestIssuedDoc = (tr.issuedDocuments || [])
      .slice()
      .sort((a, b) => Date.parse(b.issuedAt || '') - Date.parse(a.issuedAt || ''))[0];

    const hasCompletedVisa =
      isCompletedOrder || Boolean(visaIssuedDoc) || Boolean(tr.b2cVisa);

    if (hasOrder) {
      const orderMonth =
        createdMonth ||
        toMonthKey(tr.b2cVisa?.entryDate) ||
        toMonthKey(tr.updatedAt);

      if (orderMonth && buckets.has(orderMonth)) {
        const point = buckets.get(orderMonth)!;
        point.totalOrders++;
        if (!hasCompletedVisa) {
          point.inProgressOrders++;
        }
      }
    }

    if (hasCompletedVisa) {
      const completionMonth =
        toMonthKey(visaIssuedDoc?.issuedAt) ||
        toMonthKey(isCompletedOrder ? anyLatestIssuedDoc?.issuedAt : undefined) ||
        toMonthKey(tr.b2cVisa?.entryDate) ||
        toMonthKey(tr.updatedAt) ||
        createdMonth;

      if (completionMonth && buckets.has(completionMonth)) {
        buckets.get(completionMonth)!.completedVisas++;
      }
    }
  }

  const monthlyTrends = orderedKeys.map((k) => buckets.get(k)!);
  const totalOrders6M = monthlyTrends.reduce((sum, p) => sum + p.totalOrders, 0);
  const completedVisas6M = monthlyTrends.reduce((sum, p) => sum + p.completedVisas, 0);
  const inProgressOrders6M = monthlyTrends.reduce((sum, p) => sum + p.inProgressOrders, 0);
  const newClients6M = monthlyTrends.reduce((sum, p) => sum + p.newClients, 0);
  const completionRatePct =
    totalOrders6M > 0
      ? Math.min(100, Math.round((completedVisas6M / totalOrders6M) * 100))
      : completedVisas6M > 0
      ? 100
      : 0;

  const tierBreakdown: TierBreakdownPoint[] = [
    {
      key: 'vip',
      name: getClientTierConfig('vip', lang).label,
      count: tierCounts.vip,
      color: '#C6A052',
    },
    {
      key: 'new',
      name: getClientTierConfig('new', lang).label,
      count: tierCounts.new,
      color: '#0284C7',
    },
    {
      key: 'delayed',
      name: getClientTierConfig('delayed', lang).label,
      count: tierCounts.delayed,
      color: '#DC2626',
    },
    {
      key: 'standard',
      name: getClientTierConfig(null, lang).label,
      count: tierCounts.standard,
      color: '#64748B',
    },
  ];

  return {
    monthlyTrends,
    totalOrders6M,
    completedVisas6M,
    inProgressOrders6M,
    newClients6M,
    completionRatePct,
    tierCounts,
    tierBreakdown,
  };
}

export const STALE_DOCUMENTS_DAYS_THRESHOLD = 7;

export interface ClientDocumentStalenessResult {
  isStale: boolean;
  hasDocuments: boolean;
  daysSinceUpdate: number;
  lastActivityIso: string | null;
}

/**
 * Evaluates whether a non-completed client has gone more than 7 days without
 * updating or uploading any documents (checking documents[].statusUpdatedAt / uploadedAt,
 * or falling back to account createdAt when no documents have been uploaded yet).
 */
export function evaluateClientDocumentStaleness(
  profile: Pick<
    TravelerProfile,
    | 'documents'
    | 'createdAt'
    | 'orderStatus'
    | 'hasActiveOrder'
    | 'preferredVisaType'
    | 'issuedDocuments'
    | 'appointmentDetails'
  >,
  nowMs: number = Date.now()
): ClientDocumentStalenessResult {
  const docs = Array.isArray(profile.documents) ? profile.documents : [];
  const hasDocuments = docs.length > 0;

  let latestDocMs = Number.NaN;
  let latestDocIso: string | null = null;

  for (const d of docs) {
    const rawTs = d?.statusUpdatedAt || d?.uploadedAt || '';
    const parsed = Date.parse(rawTs);
    if (Number.isFinite(parsed) && (!Number.isFinite(latestDocMs) || parsed > latestDocMs)) {
      latestDocMs = parsed;
      latestDocIso = rawTs;
    }
  }

  const createdMs = Date.parse(profile.createdAt || '');
  const anchorMs = Number.isFinite(latestDocMs) ? latestDocMs : createdMs;
  const lastActivityIso = Number.isFinite(latestDocMs)
    ? latestDocIso
    : Number.isFinite(createdMs)
    ? profile.createdAt
    : null;

  if (!Number.isFinite(anchorMs)) {
    return {
      isStale: false,
      hasDocuments,
      daysSinceUpdate: 0,
      lastActivityIso: null,
    };
  }

  const diffMs = Math.max(0, nowMs - anchorMs);
  const daysSinceUpdate = Math.floor(diffMs / 86_400_000);
  const thresholdMs = STALE_DOCUMENTS_DAYS_THRESHOLD * 86_400_000;
  const isCompleted = isClientOrderCompleted(profile);

  return {
    isStale: !isCompleted && diffMs > thresholdMs,
    hasDocuments,
    daysSinceUpdate,
    lastActivityIso,
  };
}

export function buildDocumentReminderWhatsAppMessage(params: {
  clientName: string;
  orderCode: string;
  daysSinceUpdate: number;
  hasDocuments: boolean;
  isStale: boolean;
  serviceTitle?: string;
  lang?: 'ar' | 'en';
}): string {
  const {
    clientName,
    orderCode,
    daysSinceUpdate,
    hasDocuments,
    isStale,
    serviceTitle,
    lang = 'ar',
  } = params;
  const cleanName = clientName.trim() || (lang === 'en' ? 'Valued Client' : 'عميلنا العزيز');
  const cleanService = (serviceTitle || '').trim();

  if (lang === 'en') {
    if (isStale) {
      return `Hello ${cleanName},
This is a friendly reminder from Masarik Tourism regarding your file (${orderCode})${cleanService ? ` for (${cleanService})` : ''}.
It has been ${daysSinceUpdate} day(s) since your ${hasDocuments ? 'last document update' : 'registration without uploading required documents'}.
Please upload or update your required passport/documents inside the Masarik app or portal so we can keep your processing moving smoothly.`;
    }
    return `Hello ${cleanName},
Masarik Tourism team is following up on your file (${orderCode})${cleanService ? ` for (${cleanService})` : ''}.
Please review or update any pending documents inside the Masarik app/portal whenever ready. Thank you.`;
  }

  if (isStale) {
    return `السلام عليكم ${cleanName}،
تذكير ودي من فريق مسارك للإنجاز السياحي بخصوص ملفكم رقم (${orderCode})${cleanService ? ` الخاص بخدمة (${cleanService})` : ''}.
نلاحظ مرور ${daysSinceUpdate} يوماً دون ${hasDocuments ? 'تحديث المستندات المرفقة' : 'رفع المستندات المطلوبة'}.
يرجى التكرم برفع أو تحديث صور الجواز والمستندات المطلوبة عبر حسابكم في تطبيق ومنصة مسارك حتى نتمكن من متابعة الإجراءات بسرعة وسلاسة.`;
  }

  return `السلام عليكم ${cleanName}،
يتابع معكم فريق مسارك للإنجاز السياحي بخصوص ملفكم رقم (${orderCode})${cleanService ? ` الخاص بخدمة (${cleanService})` : ''}.
يمكنكم مراجعة أو تحديث أي مستندات مطلوبة عبر حسابكم في تطبيق ومنصة مسارك في أي وقت. مع خالص التحية.`;
}

export type RegistrationDatePreset =
  | 'all'
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'older_than_30_days'
  | 'custom';

export interface AdvancedClientFilterCriteria {
  city: string;
  regPreset: RegistrationDatePreset;
  regFrom: string;
  regTo: string;
  visaType: string;
}

const DEFAULT_CITY_SUGGESTIONS = [
  'القاهرة',
  'الدقهلية',
  'المنصورة',
  'السنبلاوين',
  'الجيزة',
  'الإسكندرية',
  'الشرقية',
  'الرياض',
  'جدة',
];

const DEFAULT_VISA_SUGGESTIONS = [
  'تأشيرة سياحية',
  'زيارة عائلية / شخصية',
  'حجز تساهيل VFS',
  'عمرة B2C',
  'B2C حرة',
  'تأشيرة عمل',
  'تأشيرة شنغن / أوروبا',
];

export function collectClientFilterOptions(travelers: TravelerProfile[]): {
  cityOptions: string[];
  visaTypeOptions: string[];
} {
  const citySet = new Set<string>();
  const visaSet = new Set<string>();

  for (const tr of travelers) {
    const c = (tr.city || '').trim();
    if (c) citySet.add(c);
    const v = (tr.preferredVisaType || '').trim();
    if (v) visaSet.add(v);
    if (tr.b2cVisa?.visaType === 'umrah_b2c') visaSet.add('عمرة B2C');
    if (tr.b2cVisa?.visaType === 'free_b2c') visaSet.add('B2C حرة');
  }

  for (const suggestion of DEFAULT_CITY_SUGGESTIONS) {
    citySet.add(suggestion);
  }
  for (const suggestion of DEFAULT_VISA_SUGGESTIONS) {
    visaSet.add(suggestion);
  }

  return {
    cityOptions: Array.from(citySet),
    visaTypeOptions: Array.from(visaSet),
  };
}

function extractIsoCalendarDate(raw?: string | null): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function matchesAdvancedClientFilters(
  tr: Pick<
    TravelerProfile,
    'city' | 'createdAt' | 'preferredVisaType' | 'b2cVisa' | 'appointmentDetails'
  >,
  criteria: AdvancedClientFilterCriteria,
  nowMs: number = Date.now()
): boolean {
  const cityQuery = criteria.city.trim().toLowerCase();
  if (cityQuery) {
    const clientCity = (tr.city || '').trim().toLowerCase();
    if (!clientCity || !clientCity.includes(cityQuery)) {
      return false;
    }
  }

  const visaQuery = criteria.visaType.trim().toLowerCase();
  if (visaQuery) {
    const b2cLabels =
      tr.b2cVisa?.visaType === 'umrah_b2c'
        ? 'عمرة b2c umrah_b2c'
        : tr.b2cVisa?.visaType === 'free_b2c'
        ? 'b2c حرة free_b2c'
        : '';
    const haystack = `${tr.preferredVisaType || ''} ${tr.appointmentDetails?.serviceType || ''} ${b2cLabels}`.toLowerCase();
    if (!haystack.includes(visaQuery)) {
      return false;
    }
  }

  if (criteria.regPreset !== 'all') {
    const createdDateStr = extractIsoCalendarDate(tr.createdAt);
    const createdMs = Date.parse(tr.createdAt || '');
    const todayStr = new Date(nowMs).toISOString().slice(0, 10);

    if (criteria.regPreset === 'today') {
      if (createdDateStr !== todayStr) return false;
    } else if (criteria.regPreset === 'last_7_days') {
      if (!Number.isFinite(createdMs) || nowMs - createdMs > 7 * 86_400_000) return false;
    } else if (criteria.regPreset === 'last_30_days') {
      if (!Number.isFinite(createdMs) || nowMs - createdMs > 30 * 86_400_000) return false;
    } else if (criteria.regPreset === 'older_than_30_days') {
      if (!Number.isFinite(createdMs) || nowMs - createdMs <= 30 * 86_400_000) return false;
    } else if (criteria.regPreset === 'custom') {
      if (!createdDateStr) return false;
      if (criteria.regFrom && createdDateStr < criteria.regFrom) return false;
      if (criteria.regTo && createdDateStr > criteria.regTo) return false;
    }
  }

  return true;
}

export type ClientEngagementStatus =
  | 'highly_likely'
  | 'active_engaged'
  | 'slow_responder'
  | 'dormant';

export interface ClientEngagementAnalysis {
  status: ClientEngagementStatus;
  score: number;
  label: string;
  labelAr: string;
  labelEn: string;
  emoji: string;
  badgeClass: string;
  panelClass: string;
  dotClass: string;
  lastInteractionIso: string | null;
  daysSinceLastInteraction: number;
  hoursSinceLastInteraction: number;
  lastInteractionLabel: string;
  avgResponseMinutes: number | null;
  pendingReplyHours: number | null;
  clientRepliesCount: number;
  responseSpeedLabel: string;
  reasonText: string;
}

function formatCompactDuration(minutes: number, lang: 'ar' | 'en'): string {
  const safeMin = Math.max(1, Math.round(minutes));
  if (safeMin < 60) {
    return lang === 'en' ? `${safeMin}m` : `${safeMin} د`;
  }
  const hours = safeMin / 60;
  if (hours < 24) {
    const roundedH = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
    return lang === 'en' ? `${roundedH}h` : `${roundedH} س`;
  }
  const days = Math.round(hours / 24);
  return lang === 'en' ? `${days}d` : `${days} ي`;
}

/**
 * Automated Data Analysis Algorithm:
 * Evaluates each client's last interaction timestamp (presence, sessions, docs, chat messages)
 * and actual message response latency (admin prompt -> client reply + pending wait time),
 * classifying them into: 'highly_likely' (محتمل جداً), 'active_engaged' (نشط متفاعل),
 * 'slow_responder' (بطيء الاستجابة), or 'dormant' (خامل).
 */
export function analyzeClientEngagement(params: {
  profile: TravelerProfile;
  thread?: ChatThreadSummary | null;
  messages?: ChatMessage[] | null;
  lang?: 'ar' | 'en';
  nowMs?: number;
}): ClientEngagementAnalysis {
  const { profile, thread, messages, lang = 'ar', nowMs = Date.now() } = params;

  const candidateTimestamps: { ms: number; iso: string }[] = [];
  const pushTs = (raw?: string | null) => {
    const clean = String(raw || '').trim();
    if (!clean) return;
    const ms = Date.parse(clean);
    if (Number.isFinite(ms) && ms <= nowMs + 60_000) {
      candidateTimestamps.push({ ms: Math.min(ms, nowMs), iso: clean });
    }
  };

  pushTs(profile.lastSeenAt);
  pushTs(profile.updatedAt);
  pushTs(profile.createdAt);

  for (const s of profile.activeSessions || []) {
    pushTs(s?.lastActiveAt);
    pushTs(s?.loggedInAt);
  }
  for (const d of profile.documents || []) {
    pushTs(d?.statusUpdatedAt || d?.uploadedAt);
  }

  const sortedMsgs = Array.isArray(messages)
    ? [...messages].sort((a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || ''))
    : [];

  for (const m of sortedMsgs) {
    if (m.senderRole === 'client') {
      pushTs(m.createdAt);
    }
  }

  if (thread?.lastSenderRole === 'client') {
    pushTs(thread.lastMessageAt);
  } else if (thread?.lastMessageAt && sortedMsgs.length === 0) {
    pushTs(thread.lastMessageAt);
  }

  candidateTimestamps.sort((a, b) => b.ms - a.ms);
  const latestInteraction = candidateTimestamps[0] || null;

  const isOnlineNow = Boolean(profile.isOnline);
  const lastMs = isOnlineNow ? nowMs : latestInteraction?.ms ?? nowMs;
  const lastInteractionIso = latestInteraction?.iso || profile.createdAt || null;

  const diffMs = Math.max(0, nowMs - lastMs);
  const hoursSinceLastInteraction = diffMs / 3_600_000;
  const daysSinceLastInteraction = Math.floor(diffMs / 86_400_000);

  // Measure real message response speed from admin -> client message pairs
  const replyLatenciesMin: number[] = [];
  let awaitingAdminPromptMs: number | null = null;
  let clientMessagesCount = 0;

  for (const msg of sortedMsgs) {
    const ts = Date.parse(msg.createdAt || '');
    if (!Number.isFinite(ts)) continue;
    if (msg.senderRole === 'admin') {
      if (awaitingAdminPromptMs === null) {
        awaitingAdminPromptMs = ts;
      }
    } else if (msg.senderRole === 'client') {
      clientMessagesCount++;
      if (awaitingAdminPromptMs !== null && ts >= awaitingAdminPromptMs) {
        const latencyMin = Math.max(1, (ts - awaitingAdminPromptMs) / 60_000);
        replyLatenciesMin.push(latencyMin);
        awaitingAdminPromptMs = null;
      }
    }
  }

  const avgResponseMinutes =
    replyLatenciesMin.length > 0
      ? Math.round(
          replyLatenciesMin.reduce((acc, val) => acc + val, 0) / replyLatenciesMin.length
        )
      : null;

  let pendingReplyHours: number | null = null;
  if (awaitingAdminPromptMs !== null) {
    pendingReplyHours = Math.max(0, (nowMs - awaitingAdminPromptMs) / 3_600_000);
  } else if (sortedMsgs.length === 0 && thread?.lastSenderRole === 'admin') {
    const threadMs = Date.parse(thread.lastMessageAt || '');
    if (Number.isFinite(threadMs) && threadMs <= nowMs) {
      pendingReplyHours = Math.max(0, (nowMs - threadMs) / 3_600_000);
    }
  }

  // 1) Recency score (0..50)
  let recencyScore = 0;
  if (isOnlineNow || hoursSinceLastInteraction <= 6) recencyScore = 50;
  else if (hoursSinceLastInteraction <= 24) recencyScore = 45;
  else if (hoursSinceLastInteraction <= 72) recencyScore = 38;
  else if (daysSinceLastInteraction <= 7) recencyScore = 26;
  else if (daysSinceLastInteraction <= 14) recencyScore = 14;
  else if (daysSinceLastInteraction <= 30) recencyScore = 6;

  // 2) Message response speed score (0..40)
  let responseScore = 0;
  if (avgResponseMinutes !== null) {
    if (avgResponseMinutes <= 30) responseScore = 40;
    else if (avgResponseMinutes <= 120) responseScore = 34;
    else if (avgResponseMinutes <= 360) responseScore = 28;
    else if (avgResponseMinutes <= 1440) responseScore = 20;
    else if (avgResponseMinutes <= 4320) responseScore = 10;
    else responseScore = 4;
  } else if (clientMessagesCount > 0 || thread?.lastSenderRole === 'client') {
    responseScore = hoursSinceLastInteraction <= 48 ? 34 : 24;
  } else {
    // No chat history yet: infer baseline openness from recency
    if (hoursSinceLastInteraction <= 48) responseScore = 24;
    else if (daysSinceLastInteraction <= 7) responseScore = 15;
    else if (daysSinceLastInteraction <= 14) responseScore = 6;
    else responseScore = 0;
  }

  if (pendingReplyHours !== null) {
    if (pendingReplyHours > 168) responseScore = Math.max(0, responseScore - 26);
    else if (pendingReplyHours > 72) responseScore = Math.max(0, responseScore - 18);
    else if (pendingReplyHours > 24) responseScore = Math.max(0, responseScore - 10);
  }

  // 3) Account & order intent bonus (0..10)
  let intentScore = 0;
  if (hasClientActiveOrder(profile) && !isClientOrderCompleted(profile)) intentScore += 4;
  if ((profile.documents?.length || 0) > 0) intentScore += 3;
  if (isClientAccountVerified(profile)) intentScore += 3;

  const score = Math.max(0, Math.min(100, Math.round(recencyScore + responseScore + intentScore)));

  // Guardrailed segmentation
  const isDormant =
    daysSinceLastInteraction > 14 ||
    (pendingReplyHours !== null && pendingReplyHours > 120 && daysSinceLastInteraction > 5 && !isOnlineNow) ||
    score < 28;

  let status: ClientEngagementStatus;
  if (isDormant) {
    status = 'dormant';
  } else if (
    score >= 74 &&
    daysSinceLastInteraction <= 4 &&
    (pendingReplyHours === null || pendingReplyHours <= 24)
  ) {
    status = 'highly_likely';
  } else if (score >= 48 && daysSinceLastInteraction <= 10 && (pendingReplyHours === null || pendingReplyHours <= 48)) {
    status = 'active_engaged';
  } else {
    status = 'slow_responder';
  }

  const lastInteractionLabel = isOnlineNow
    ? lang === 'en'
      ? 'Online now'
      : 'متصل الآن'
    : hoursSinceLastInteraction < 1
    ? lang === 'en'
      ? 'Minutes ago'
      : 'منذ دقائق'
    : hoursSinceLastInteraction < 24
    ? lang === 'en'
      ? `${Math.max(1, Math.round(hoursSinceLastInteraction))}h ago`
      : `منذ ${Math.max(1, Math.round(hoursSinceLastInteraction))} س`
    : lang === 'en'
    ? `${daysSinceLastInteraction}d ago`
    : `منذ ${daysSinceLastInteraction} ي`;

  let responseSpeedLabel: string;
  if (pendingReplyHours !== null && pendingReplyHours > 24 && (avgResponseMinutes === null || pendingReplyHours * 60 > avgResponseMinutes)) {
    const dur = formatCompactDuration(pendingReplyHours * 60, lang);
    responseSpeedLabel = lang === 'en' ? `Awaiting reply (${dur})` : `بانتظار رد منذ ${dur}`;
  } else if (avgResponseMinutes !== null) {
    const dur = formatCompactDuration(avgResponseMinutes, lang);
    responseSpeedLabel =
      avgResponseMinutes <= 60
        ? lang === 'en'
          ? `Fast (${dur})`
          : `فورية (${dur})`
        : avgResponseMinutes <= 360
        ? lang === 'en'
          ? `Good (${dur})`
          : `جيدة (${dur})`
        : lang === 'en'
        ? `Slow (${dur})`
        : `بطيئة (${dur})`;
  } else if (clientMessagesCount > 0 || thread?.lastSenderRole === 'client') {
    responseSpeedLabel = lang === 'en' ? 'Client initiated' : 'بادر بالمراسلة';
  } else if (pendingReplyHours !== null) {
    const dur = formatCompactDuration(pendingReplyHours * 60, lang);
    responseSpeedLabel = lang === 'en' ? `Sent ${dur} ago` : `أُرسلت منذ ${dur}`;
  } else {
    responseSpeedLabel = lang === 'en' ? 'No chat yet' : 'لا توجد محادثة';
  }

  if (status === 'highly_likely') {
    return {
      status,
      score,
      labelAr: 'محتمل جداً',
      labelEn: 'Highly Likely',
      label: lang === 'en' ? 'Highly Likely' : 'محتمل جداً',
      emoji: '🔥',
      badgeClass: 'bg-emerald-100 border-emerald-400 text-emerald-950',
      panelClass: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
      dotClass: 'bg-emerald-500',
      lastInteractionIso,
      daysSinceLastInteraction,
      hoursSinceLastInteraction,
      lastInteractionLabel,
      avgResponseMinutes,
      pendingReplyHours,
      clientRepliesCount: clientMessagesCount,
      responseSpeedLabel,
      reasonText:
        lang === 'en'
          ? 'High recent activity and prompt replies'
          : 'تفاعل حديث واستجابة سريعة للرسائل',
    };
  }

  if (status === 'active_engaged') {
    return {
      status,
      score,
      labelAr: 'نشط متفاعل',
      labelEn: 'Active & Engaged',
      label: lang === 'en' ? 'Active & Engaged' : 'نشط متفاعل',
      emoji: '💬',
      badgeClass: 'bg-sky-100 border-sky-300 text-sky-900',
      panelClass: 'bg-sky-50/70 border-sky-200 text-sky-900',
      dotClass: 'bg-sky-500',
      lastInteractionIso,
      daysSinceLastInteraction,
      hoursSinceLastInteraction,
      lastInteractionLabel,
      avgResponseMinutes,
      pendingReplyHours,
      clientRepliesCount: clientMessagesCount,
      responseSpeedLabel,
      reasonText:
        lang === 'en'
          ? 'Consistent interaction and timely follow-up'
          : 'تواصل منتظم وتفاعل مستمر',
    };
  }

  if (status === 'slow_responder') {
    return {
      status,
      score,
      labelAr: 'بطيء الاستجابة',
      labelEn: 'Slow Responder',
      label: lang === 'en' ? 'Slow Responder' : 'بطيء الاستجابة',
      emoji: '⏳',
      badgeClass: 'bg-amber-100 border-amber-300 text-amber-950',
      panelClass: 'bg-amber-50/70 border-amber-200 text-amber-950',
      dotClass: 'bg-amber-500',
      lastInteractionIso,
      daysSinceLastInteraction,
      hoursSinceLastInteraction,
      lastInteractionLabel,
      avgResponseMinutes,
      pendingReplyHours,
      clientRepliesCount: clientMessagesCount,
      responseSpeedLabel,
      reasonText:
        lang === 'en'
          ? 'Delayed replies or moderate inactivity'
          : 'تأخر في الرد على الرسائل أو فتور بالتفاعل',
    };
  }

  return {
    status: 'dormant',
    score,
    labelAr: 'خامل',
    labelEn: 'Dormant',
    label: lang === 'en' ? 'Dormant' : 'خامل',
    emoji: '💤',
    badgeClass: 'bg-slate-200 border-slate-300 text-slate-800',
    panelClass: 'bg-slate-100/80 border-slate-200 text-slate-700',
    dotClass: 'bg-slate-400',
    lastInteractionIso,
    daysSinceLastInteraction,
    hoursSinceLastInteraction,
    lastInteractionLabel,
    avgResponseMinutes,
    pendingReplyHours,
    clientRepliesCount: clientMessagesCount,
    responseSpeedLabel,
    reasonText:
      lang === 'en'
        ? 'No recent interaction or prolonged silence'
        : 'انقطاع عن التفاعل أو عدم الرد لفترة طويلة',
  };
}


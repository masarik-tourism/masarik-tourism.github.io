import {
  AdminPermission,
  ChatMessage,
  DocumentReviewStatus,
  OrderAuditAction,
  SubAdminAccount,
  TravelerProfile,
} from '../types/travel';
import { buildDocumentAuditTimeline } from './documentAuditHelpers';
import { isClientOrderCompleted } from './whatsappHelpers';

export type StaffPeriodFilter = 'all' | '7d' | '30d' | '90d';

export type StaffAuditSource = 'document_audit' | 'order_audit' | 'deliverable' | 'chat_reply';

export interface UnifiedStaffAuditItem {
  id: string;
  staffKey: string;
  staffName: string;
  source: StaffAuditSource;
  actionType: string;
  actionLabelAr: string;
  actionLabelEn: string;
  phone: string;
  clientName: string;
  orderCode: string;
  targetLabel?: string;
  note?: string;
  responseMinutes?: number | null;
  timestamp: string;
}

export interface StaffPerformanceMetric {
  staffKey: string;
  staffName: string;
  role: 'super_admin' | 'sub_admin' | 'archive';
  permissions: AdminPermission[];
  completedOrdersCount: number;
  completedOrderPhones: string[];
  deliverablesIssuedCount: number;
  docReviewsCount: number;
  docApprovalsCount: number;
  docRejectionsCount: number;
  stageUpdatesCount: number;
  accountVerificationsCount: number;
  chatRepliesCount: number;
  auditEventsCount: number;
  avgResponseMinutes: number | null;
  avgAuditResponseMinutes: number | null;
  avgChatResponseMinutes: number | null;
  fastestResponseMinutes: number | null;
  responseSamplesCount: number;
  lastActivityAt: string | null;
}

export interface StaffPerformanceSummary {
  staffMetrics: StaffPerformanceMetric[];
  auditFeed: UnifiedStaffAuditItem[];
  totalCompletedOrders: number;
  totalAuditEvents: number;
  teamAvgResponseMinutes: number | null;
  topPerformerName: string | null;
  fastestResponderName: string | null;
}

export function normalizeStaffActorName(rawName?: string | null): string {
  const clean = String(rawName || '').trim();
  if (!clean) return '';
  if (/^(general manager|super admin|المدير العام)$/i.test(clean)) {
    return 'المدير العام';
  }
  return clean;
}

function getClientDisplayLabel(profile: TravelerProfile): string {
  if (profile.accountType === 'b2b_partner' && profile.companyName) {
    return profile.companyName;
  }
  return profile.name || profile.phone || 'العميل';
}

function isWithinPeriod(
  isoTimestamp: string | undefined | null,
  period: StaffPeriodFilter,
  nowMs: number
): boolean {
  if (period === 'all') return true;
  if (!isoTimestamp) return false;
  const ts = Date.parse(isoTimestamp);
  if (!Number.isFinite(ts)) return false;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return nowMs - ts <= days * 86_400_000;
}

export function formatResponseDuration(
  minutes: number | null | undefined,
  lang: 'ar' | 'en' = 'ar'
): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return lang === 'en' ? 'No samples' : 'لا توجد قياسات';
  }
  const roundedMin = Math.max(1, Math.round(minutes));
  if (roundedMin < 60) {
    return lang === 'en' ? `${roundedMin} min` : `${roundedMin} دقيقة`;
  }
  const hours = roundedMin / 60;
  if (hours < 24) {
    const hVal = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
    return lang === 'en' ? `${hVal} hr` : `${hVal} ساعة`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return lang === 'en' ? `${days} d` : `${days} يوم`;
}

function getOrderAuditActionLabels(
  action: OrderAuditAction,
  toStatus?: string
): { ar: string; en: string } {
  if (action === 'deliverable_issued') {
    return {
      ar: 'إصدار وتسليم مستند تنفيذ',
      en: 'Issued & Delivered Document',
    };
  }
  if (action === 'order_completed') {
    return {
      ar: toStatus ? `إنجاز الطلب (${toStatus})` : 'إنجاز الطلب بالكامل',
      en: toStatus ? `Order Completed (${toStatus})` : 'Order Completed',
    };
  }
  if (action === 'order_opened') {
    return {
      ar: 'فتح وتفعيل طلب خدمة',
      en: 'Opened Service Order',
    };
  }
  if (action === 'account_verified') {
    return {
      ar: 'توثيق وتفعيل حساب العميل',
      en: 'Verified Client Account',
    };
  }
  return {
    ar: toStatus ? `تحديث المرحلة إلى: ${toStatus}` : 'تحديث مرحلة الطلب',
    en: toStatus ? `Stage updated to: ${toStatus}` : 'Order Stage Updated',
  };
}

function getDocumentAuditActionLabels(
  action: string,
  status?: DocumentReviewStatus
): { ar: string; en: string } {
  if (action === 'approved' || status === 'completed') {
    return { ar: 'قبول واعتماد مستند', en: 'Approved Document' };
  }
  if (action === 'rejected' || status === 'pending_completion') {
    return { ar: 'رفض / طلب استكمال مستند', en: 'Rejected / Needs Completion' };
  }
  if (action === 'note_updated') {
    return { ar: 'تحديث ملاحظة مراجعة', en: 'Updated Review Note' };
  }
  return { ar: 'استلام ومراجعة مستند', en: 'Reviewed Document' };
}

interface MutableStaffAccumulator {
  staffKey: string;
  staffName: string;
  role: 'super_admin' | 'sub_admin' | 'archive';
  permissions: AdminPermission[];
  completedOrderPhones: Set<string>;
  deliverablesIssuedCount: number;
  docReviewsCount: number;
  docApprovalsCount: number;
  docRejectionsCount: number;
  stageUpdatesCount: number;
  accountVerificationsCount: number;
  chatRepliesCount: number;
  auditEventsCount: number;
  auditResponseSamples: number[];
  chatResponseSamples: number[];
  lastActivityMs: number;
  lastActivityAt: string | null;
}

export function buildStaffPerformanceSummary(params: {
  travelers: TravelerProfile[];
  subAdmins: SubAdminAccount[];
  chatMessagesByPhone?: Record<string, ChatMessage[]>;
  period?: StaffPeriodFilter;
  nowMs?: number;
}): StaffPerformanceSummary {
  const {
    travelers,
    subAdmins,
    chatMessagesByPhone = {},
    period = 'all',
    nowMs = Date.now(),
  } = params;

  const staffMap = new Map<string, MutableStaffAccumulator>();

  const ensureStaff = (
    rawName: string,
    roleHint?: 'super_admin' | 'sub_admin' | 'archive',
    permissions?: AdminPermission[]
  ): MutableStaffAccumulator | null => {
    const normalizedName = normalizeStaffActorName(rawName);
    if (!normalizedName) return null;
    const isGenericArchive = normalizedName === 'إدارة مسارك';
    const staffKey = isGenericArchive ? '__archive_masarik__' : normalizedName;
    const existing = staffMap.get(staffKey);
    if (existing) return existing;

    const resolvedRole: MutableStaffAccumulator['role'] = isGenericArchive
      ? 'archive'
      : normalizedName === 'المدير العام'
      ? 'super_admin'
      : roleHint || 'sub_admin';

    const acc: MutableStaffAccumulator = {
      staffKey,
      staffName: isGenericArchive ? 'فريق الإدارة (سجل أرشيفي)' : normalizedName,
      role: resolvedRole,
      permissions: permissions ? [...permissions] : [],
      completedOrderPhones: new Set<string>(),
      deliverablesIssuedCount: 0,
      docReviewsCount: 0,
      docApprovalsCount: 0,
      docRejectionsCount: 0,
      stageUpdatesCount: 0,
      accountVerificationsCount: 0,
      chatRepliesCount: 0,
      auditEventsCount: 0,
      auditResponseSamples: [],
      chatResponseSamples: [],
      lastActivityMs: 0,
      lastActivityAt: null,
    };
    staffMap.set(staffKey, acc);
    return acc;
  };

  const touchActivity = (acc: MutableStaffAccumulator, tsIso?: string | null) => {
    if (!tsIso) return;
    const ms = Date.parse(tsIso);
    if (Number.isFinite(ms) && ms > acc.lastActivityMs) {
      acc.lastActivityMs = ms;
      acc.lastActivityAt = tsIso;
    }
  };

  // Seed General Manager & all registered Sub-Admins so inactive employees are also evaluated
  ensureStaff('المدير العام', 'super_admin', [
    'manage_clients',
    'activate_otp',
    'edit_content',
    'delete_records',
  ]);
  for (const sa of subAdmins) {
    ensureStaff(sa.name, 'sub_admin', sa.permissions);
  }

  const auditFeed: UnifiedStaffAuditItem[] = [];
  const attributedCompletionPhones = new Set<string>();
  const recordedDeliverableKeys = new Set<string>();

  for (const tr of travelers) {
    const clientName = getClientDisplayLabel(tr);
    const orderCode = tr.orderCode || `MSK-${tr.phone.slice(-6)}`;

    // 1. Document Audit Log linking (reviews, approvals, rejections, and upload-to-review latency)
    const docs = Array.isArray(tr.documents) ? tr.documents : [];
    for (const docItem of docs) {
      const timeline = buildDocumentAuditTimeline(tr, docItem);
      const chronological = [...timeline].sort(
        (a, b) => Date.parse(a.timestamp || '') - Date.parse(b.timestamp || '')
      );
      const uploadEvent = chronological.find(
        (e) => e.action === 'uploaded' || e.action === 'replaced'
      );
      const uploadMs = Date.parse(uploadEvent?.timestamp || docItem.uploadedAt || '');

      let firstAdminHandled = false;
      for (const entry of chronological) {
        if (entry.actorRole !== 'admin') continue;
        const acc = ensureStaff(entry.actorName);
        if (!acc) continue;

        const entryMs = Date.parse(entry.timestamp || '');
        let responseMinutes: number | null = null;
        if (
          !firstAdminHandled &&
          Number.isFinite(uploadMs) &&
          Number.isFinite(entryMs) &&
          entryMs >= uploadMs
        ) {
          firstAdminHandled = true;
          responseMinutes = Math.max(1, (entryMs - uploadMs) / 60_000);
        }

        if (!isWithinPeriod(entry.timestamp, period, nowMs)) continue;

        acc.docReviewsCount += 1;
        acc.auditEventsCount += 1;
        if (entry.action === 'approved' || entry.status === 'completed') {
          acc.docApprovalsCount += 1;
        } else if (entry.action === 'rejected' || entry.status === 'pending_completion') {
          acc.docRejectionsCount += 1;
        }
        if (responseMinutes !== null) {
          acc.auditResponseSamples.push(responseMinutes);
        }
        touchActivity(acc, entry.timestamp);

        const labels = getDocumentAuditActionLabels(entry.action, entry.status);
        auditFeed.push({
          id: `doc-${tr.phone}-${docItem.id}-${entry.id}`,
          staffKey: acc.staffKey,
          staffName: acc.staffName,
          source: 'document_audit',
          actionType: entry.action,
          actionLabelAr: labels.ar,
          actionLabelEn: labels.en,
          phone: tr.phone,
          clientName,
          orderCode,
          targetLabel: docItem.label || docItem.fileName,
          note: entry.note,
          responseMinutes,
          timestamp: entry.timestamp,
        });
      }
    }

    // 2. Order Audit Log entries (stage transitions, completions, deliverables, account verification)
    const orderEntries = Array.isArray(tr.orderAuditLog) ? tr.orderAuditLog : [];
    const chronologicalOrderEntries = [...orderEntries].sort(
      (a, b) => Date.parse(a.timestamp || '') - Date.parse(b.timestamp || '')
    );
    const createdMs = Date.parse(tr.createdAt || '');
    let firstOrderAdminActionMeasured = false;

    for (const oEntry of chronologicalOrderEntries) {
      const acc = ensureStaff(oEntry.actorName);
      if (!acc) continue;

      const entryMs = Date.parse(oEntry.timestamp || '');
      let responseMinutes: number | null = null;
      if (
        !firstOrderAdminActionMeasured &&
        Number.isFinite(createdMs) &&
        Number.isFinite(entryMs) &&
        entryMs >= createdMs
      ) {
        firstOrderAdminActionMeasured = true;
        // Only record order-level latency when document review didn't already capture it and latency > 0
        if (docs.length === 0) {
          responseMinutes = Math.max(1, (entryMs - createdMs) / 60_000);
        }
      }

      if (!isWithinPeriod(oEntry.timestamp, period, nowMs)) continue;

      acc.auditEventsCount += 1;
      touchActivity(acc, oEntry.timestamp);

      if (oEntry.action === 'deliverable_issued') {
        acc.deliverablesIssuedCount += 1;
        acc.completedOrderPhones.add(tr.phone);
        attributedCompletionPhones.add(tr.phone);
        recordedDeliverableKeys.add(
          `${tr.phone}|${acc.staffKey}|${String(oEntry.timestamp).slice(0, 19)}`
        );
      } else if (oEntry.action === 'order_completed') {
        acc.completedOrderPhones.add(tr.phone);
        attributedCompletionPhones.add(tr.phone);
      } else if (oEntry.action === 'stage_updated' || oEntry.action === 'order_opened') {
        acc.stageUpdatesCount += 1;
      } else if (oEntry.action === 'account_verified') {
        acc.accountVerificationsCount += 1;
      }

      if (responseMinutes !== null) {
        acc.auditResponseSamples.push(responseMinutes);
      }

      const labels = getOrderAuditActionLabels(oEntry.action, oEntry.toStatus);
      auditFeed.push({
        id: `ord-${tr.phone}-${oEntry.id}`,
        staffKey: acc.staffKey,
        staffName: acc.staffName,
        source: oEntry.action === 'deliverable_issued' ? 'deliverable' : 'order_audit',
        actionType: oEntry.action,
        actionLabelAr: labels.ar,
        actionLabelEn: labels.en,
        phone: tr.phone,
        clientName,
        orderCode,
        targetLabel: oEntry.note || oEntry.toStatus,
        note: oEntry.note,
        responseMinutes,
        timestamp: oEntry.timestamp,
      });
    }

    // 3. Issued Deliverables (captures deliverables created before orderAuditLog existed)
    const issuedDocs = Array.isArray(tr.issuedDocuments) ? tr.issuedDocuments : [];
    for (const del of issuedDocs) {
      const actorRaw = del.issuedBy || '';
      const acc = ensureStaff(actorRaw);
      if (!acc) continue;
      if (!isWithinPeriod(del.issuedAt, period, nowMs)) continue;

      const dedupKey = `${tr.phone}|${acc.staffKey}|${String(del.issuedAt || '').slice(0, 19)}`;
      if (recordedDeliverableKeys.has(dedupKey)) continue;
      recordedDeliverableKeys.add(dedupKey);

      acc.deliverablesIssuedCount += 1;
      acc.auditEventsCount += 1;
      acc.completedOrderPhones.add(tr.phone);
      attributedCompletionPhones.add(tr.phone);
      touchActivity(acc, del.issuedAt);

      auditFeed.push({
        id: `del-${tr.phone}-${del.id}`,
        staffKey: acc.staffKey,
        staffName: acc.staffName,
        source: 'deliverable',
        actionType: 'deliverable_issued',
        actionLabelAr: 'إصدار وتسليم مستند تنفيذ',
        actionLabelEn: 'Issued & Delivered Document',
        phone: tr.phone,
        clientName,
        orderCode,
        targetLabel: del.docTypeLabel || del.fileName,
        note: del.notes,
        timestamp: del.issuedAt,
      });
    }

    // 4. Legacy / Direct completed orders without an explicit orderAuditLog entry
    if (isClientOrderCompleted(tr) && !attributedCompletionPhones.has(tr.phone)) {
      const completionTs =
        tr.completedAt ||
        issuedDocs[0]?.issuedAt ||
        tr.updatedAt ||
        tr.createdAt;
      if (isWithinPeriod(completionTs, period, nowMs)) {
        const fallbackActor =
          tr.completedBy ||
          issuedDocs[0]?.issuedBy ||
          docs.find((d) => d.status === 'completed' && d.lastReviewedBy)?.lastReviewedBy ||
          '';
        const acc = ensureStaff(fallbackActor);
        if (acc) {
          acc.completedOrderPhones.add(tr.phone);
          attributedCompletionPhones.add(tr.phone);
          touchActivity(acc, completionTs);
        }
      }
    }

    // 5. Live Chat response latency per staff member (client prompt -> admin reply)
    const cleanPhoneKey = tr.phone.replace(/\D/g, '') || tr.phone;
    const rawMessages =
      chatMessagesByPhone[cleanPhoneKey] || chatMessagesByPhone[tr.phone] || [];
    if (rawMessages.length > 0) {
      const sortedMsgs = [...rawMessages].sort(
        (a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '')
      );
      let pendingClientMs: number | null = null;
      for (const msg of sortedMsgs) {
        const msgMs = Date.parse(msg.createdAt || '');
        if (!Number.isFinite(msgMs)) continue;
        if (msg.senderRole === 'client') {
          if (pendingClientMs === null) {
            pendingClientMs = msgMs;
          }
        } else if (msg.senderRole === 'admin') {
          const replyLatencyMin =
            pendingClientMs !== null && msgMs >= pendingClientMs
              ? Math.max(1, (msgMs - pendingClientMs) / 60_000)
              : null;
          pendingClientMs = null;

          if (!isWithinPeriod(msg.createdAt, period, nowMs)) continue;
          const acc = ensureStaff(msg.senderName || 'المدير العام');
          if (!acc) continue;

          acc.chatRepliesCount += 1;
          touchActivity(acc, msg.createdAt);
          if (replyLatencyMin !== null) {
            acc.chatResponseSamples.push(replyLatencyMin);
          }
        }
      }
    }
  }

  const avgOf = (nums: number[]): number | null => {
    if (nums.length === 0) return null;
    const sum = nums.reduce((acc, v) => acc + v, 0);
    return Math.round((sum / nums.length) * 10) / 10;
  };

  const staffMetrics: StaffPerformanceMetric[] = Array.from(staffMap.values())
    .filter(
      (acc) =>
        acc.role !== 'archive' ||
        acc.completedOrderPhones.size > 0 ||
        acc.auditEventsCount > 0 ||
        acc.chatRepliesCount > 0
    )
    .map((acc) => {
      const combinedSamples = [...acc.chatResponseSamples, ...acc.auditResponseSamples];
      const fastest =
        combinedSamples.length > 0 ? Math.min(...combinedSamples) : null;
      return {
        staffKey: acc.staffKey,
        staffName: acc.staffName,
        role: acc.role,
        permissions: acc.permissions,
        completedOrdersCount: acc.completedOrderPhones.size,
        completedOrderPhones: Array.from(acc.completedOrderPhones),
        deliverablesIssuedCount: acc.deliverablesIssuedCount,
        docReviewsCount: acc.docReviewsCount,
        docApprovalsCount: acc.docApprovalsCount,
        docRejectionsCount: acc.docRejectionsCount,
        stageUpdatesCount: acc.stageUpdatesCount,
        accountVerificationsCount: acc.accountVerificationsCount,
        chatRepliesCount: acc.chatRepliesCount,
        auditEventsCount: acc.auditEventsCount,
        avgResponseMinutes: avgOf(combinedSamples),
        avgAuditResponseMinutes: avgOf(acc.auditResponseSamples),
        avgChatResponseMinutes: avgOf(acc.chatResponseSamples),
        fastestResponseMinutes: fastest !== null ? Math.round(fastest * 10) / 10 : null,
        responseSamplesCount: combinedSamples.length,
        lastActivityAt: acc.lastActivityAt,
      };
    })
    .sort((a, b) => {
      if (b.completedOrdersCount !== a.completedOrdersCount) {
        return b.completedOrdersCount - a.completedOrdersCount;
      }
      if (b.auditEventsCount !== a.auditEventsCount) {
        return b.auditEventsCount - a.auditEventsCount;
      }
      return b.chatRepliesCount - a.chatRepliesCount;
    });

  auditFeed.sort(
    (a, b) => Date.parse(b.timestamp || '') - Date.parse(a.timestamp || '')
  );

  const allResponseSamples: number[] = [];
  for (const acc of staffMap.values()) {
    allResponseSamples.push(...acc.chatResponseSamples, ...acc.auditResponseSamples);
  }

  const totalCompletedOrders = staffMetrics.reduce(
    (sum, s) => sum + s.completedOrdersCount,
    0
  );
  const totalAuditEvents = auditFeed.length;
  const teamAvgResponseMinutes = avgOf(allResponseSamples);

  const topPerformer = staffMetrics.find((s) => s.completedOrdersCount > 0) || null;
  const fastestResponder =
    staffMetrics
      .filter((s) => s.avgResponseMinutes !== null && s.role !== 'archive')
      .sort((a, b) => (a.avgResponseMinutes ?? 1e9) - (b.avgResponseMinutes ?? 1e9))[0] ||
    null;

  return {
    staffMetrics,
    auditFeed,
    totalCompletedOrders,
    totalAuditEvents,
    teamAvgResponseMinutes,
    topPerformerName: topPerformer?.staffName || null,
    fastestResponderName: fastestResponder?.staffName || null,
  };
}

// ============================================================================
// Global Admin Search Helpers (Name, Phone, Passport Number, Order Code)
// ============================================================================

export type GlobalSearchMatchField =
  | 'name'
  | 'company'
  | 'phone'
  | 'passport'
  | 'family_passport'
  | 'orderCode';

export interface GlobalClientSearchResult {
  profile: TravelerProfile;
  displayName: string;
  phone: string;
  passportNumber: string;
  orderCode: string;
  matchField: GlobalSearchMatchField;
  matchedPassportNumber?: string;
  matchedFamilyMemberName?: string;
  score: number;
}

function normalizeDigitsPure(input: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return String(input || '').replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

export function searchAdminClientsGlobal(
  travelers: TravelerProfile[],
  rawQuery: string,
  limitCount = 8
): GlobalClientSearchResult[] {
  const cleanQuery = normalizeDigitsPure(rawQuery).trim();
  if (!cleanQuery) return [];

  const qLower = cleanQuery.toLowerCase();
  const qDigits = cleanQuery.replace(/\D/g, '');
  const qCompact = cleanQuery.replace(/[\s\-+]/g, '').toLowerCase();

  const matches: GlobalClientSearchResult[] = [];

  for (const tr of travelers) {
    const displayName = getClientDisplayLabel(tr);
    const orderCode = (tr.orderCode || `MSK-${tr.phone.slice(-6)}`).trim();
    const phoneRaw = normalizeDigitsPure(tr.phoneNormalized || tr.phone || '');
    const phoneDisplay = phoneRaw.startsWith('20') && phoneRaw.length === 12
      ? phoneRaw.slice(1)
      : phoneRaw;

    const primaryPassport = String(tr.passportNumber || '').trim();
    const docPassport = String(tr.documentPassportNumber || '').trim();

    const nameCandidates = [
      displayName,
      tr.name,
      tr.firstName,
      tr.lastName,
      tr.passportFullName,
      tr.passportFullNameEn,
      tr.passportFullNameAr,
      tr.applicantNameAr,
      tr.applicantNameEn,
      tr.companyName,
      tr.contactPersonName,
    ]
      .filter((v): v is string => Boolean(v && v.trim()))
      .map((v) => v.trim());

    let bestScore = 0;
    let matchField: GlobalSearchMatchField = 'name';
    let matchedPassportNumber: string | undefined;
    let matchedFamilyMemberName: string | undefined;

    // 1. Passport Number match (primary or document passport)
    for (const pNum of [primaryPassport, docPassport]) {
      if (!pNum) continue;
      const pLower = pNum.toLowerCase();
      if (pLower === qCompact) {
        bestScore = 100;
        matchField = 'passport';
        matchedPassportNumber = pNum;
        break;
      } else if (pLower.startsWith(qCompact) && qCompact.length >= 2) {
        if (90 > bestScore) {
          bestScore = 90;
          matchField = 'passport';
          matchedPassportNumber = pNum;
        }
      } else if (pLower.includes(qCompact) && qCompact.length >= 2) {
        if (78 > bestScore) {
          bestScore = 78;
          matchField = 'passport';
          matchedPassportNumber = pNum;
        }
      }
    }

    // 2. Phone Number match (handles 01..., 201..., +201..., Arabic numerals)
    if (qDigits.length >= 2) {
      if (phoneRaw === qDigits || phoneDisplay === qDigits) {
        if (99 > bestScore) {
          bestScore = 99;
          matchField = 'phone';
        }
      } else if (phoneDisplay.startsWith(qDigits) || phoneRaw.startsWith(qDigits)) {
        if (88 > bestScore) {
          bestScore = 88;
          matchField = 'phone';
        }
      } else if (phoneRaw.includes(qDigits)) {
        if (75 > bestScore) {
          bestScore = 75;
          matchField = 'phone';
        }
      }
    }

    // 3. Order Code match
    if (orderCode.toLowerCase() === qLower) {
      if (96 > bestScore) {
        bestScore = 96;
        matchField = 'orderCode';
      }
    } else if (orderCode.toLowerCase().includes(qLower) && qLower.length >= 2) {
      if (72 > bestScore) {
        bestScore = 72;
        matchField = 'orderCode';
      }
    }

    // 4. Client / Company / Passport Name match
    for (const candidate of nameCandidates) {
      const cLower = candidate.toLowerCase();
      if (cLower === qLower) {
        if (95 > bestScore) {
          bestScore = 95;
          matchField =
            tr.accountType === 'b2b_partner' && candidate === tr.companyName
              ? 'company'
              : 'name';
        }
      } else if (cLower.startsWith(qLower)) {
        if (84 > bestScore) {
          bestScore = 84;
          matchField =
            tr.accountType === 'b2b_partner' && candidate === tr.companyName
              ? 'company'
              : 'name';
        }
      } else if (cLower.includes(qLower)) {
        if (70 > bestScore) {
          bestScore = 70;
          matchField =
            tr.accountType === 'b2b_partner' && candidate === tr.companyName
              ? 'company'
              : 'name';
        }
      }
    }

    // 5. Companion / Family Member Passport or Name match
    for (const fm of tr.familyMembers || []) {
      const fmPass = String(fm.passportNumber || '').trim();
      const fmName = `${fm.firstName || ''} ${fm.lastName || ''}`.trim() || fm.passportFullName || '';
      if (fmPass && qCompact.length >= 2 && fmPass.toLowerCase().includes(qCompact)) {
        const s = fmPass.toLowerCase() === qCompact ? 92 : 76;
        if (s > bestScore) {
          bestScore = s;
          matchField = 'family_passport';
          matchedPassportNumber = fmPass;
          matchedFamilyMemberName = fmName;
        }
      } else if (fmName && fmName.toLowerCase().includes(qLower)) {
        if (62 > bestScore) {
          bestScore = 62;
          matchField = 'family_passport';
          matchedPassportNumber = fmPass || undefined;
          matchedFamilyMemberName = fmName;
        }
      }
    }

    if (bestScore > 0) {
      matches.push({
        profile: tr,
        displayName,
        phone: tr.phone,
        passportNumber: primaryPassport || docPassport,
        orderCode,
        matchField,
        ...(matchedPassportNumber ? { matchedPassportNumber } : {}),
        ...(matchedFamilyMemberName ? { matchedFamilyMemberName } : {}),
        score: bestScore,
      });
    }
  }

  return matches
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(b.profile.updatedAt || b.profile.createdAt || '') -
        Date.parse(a.profile.updatedAt || a.profile.createdAt || '');
    })
    .slice(0, limitCount);
}

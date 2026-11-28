import {
  AccountType,
  DocumentAuditAction,
  DocumentAuditEntry,
  DocumentReviewStatus,
  TravelerDocument,
  TravelerProfile,
} from '../types/travel';

export interface DocumentReviewStatusMeta {
  status: DocumentReviewStatus;
  labelAr: string;
  labelEn: string;
  shortLabelAr: string;
  shortLabelEn: string;
  badgeClass: string;
}

export function resolveDocumentReviewMeta(
  status?: DocumentReviewStatus | string | null
): DocumentReviewStatusMeta {
  if (status === 'completed') {
    return {
      status: 'completed',
      labelAr: 'تم القبول (معتمد)',
      labelEn: 'Approved & Completed',
      shortLabelAr: 'تم القبول ✓',
      shortLabelEn: 'Approved ✓',
      badgeClass: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    };
  }
  if (status === 'pending_completion') {
    return {
      status: 'pending_completion',
      labelAr: 'مرفوض / مطلوب استكماله',
      labelEn: 'Rejected / Needs Completion',
      shortLabelAr: 'مرفوض ✕',
      shortLabelEn: 'Rejected ✕',
      badgeClass: 'bg-red-50 border-red-300 text-red-900',
    };
  }
  return {
    status: 'received',
    labelAr: 'تم الاستلام (قيد المراجعة)',
    shortLabelAr: 'قيد المراجعة',
    labelEn: 'Received (Under Review)',
    shortLabelEn: 'Under Review',
    badgeClass: 'bg-sky-50 border-sky-200 text-sky-900',
  };
}

export function createDocumentAuditEntry(params: {
  action: DocumentAuditAction;
  status?: DocumentReviewStatus;
  actorName: string;
  actorRole: 'client' | 'admin' | 'system';
  note?: string;
  timestamp?: string;
  id?: string;
}): DocumentAuditEntry {
  const timestamp = String(params.timestamp || new Date().toISOString()).slice(0, 64);
  const cleanActor =
    String(params.actorName || '')
      .trim()
      .slice(0, 120) || (params.actorRole === 'client' ? 'العميل' : 'إدارة مسارك');
  const cleanNote = String(params.note || '').trim().slice(0, 300);

  let statusLabelAr = 'تم الرفع';
  let statusLabelEn = 'Uploaded';

  if (params.action === 'uploaded') {
    statusLabelAr = 'تم رفع المستند';
    statusLabelEn = 'Document Uploaded';
  } else if (params.action === 'replaced') {
    statusLabelAr = 'تم تحديث / استبدال المستند';
    statusLabelEn = 'Document Replaced';
  } else if (params.action === 'approved' || params.status === 'completed') {
    statusLabelAr = 'تم القبول';
    statusLabelEn = 'Approved';
  } else if (params.action === 'rejected' || params.status === 'pending_completion') {
    statusLabelAr = 'مرفوض / مطلوب استكماله';
    statusLabelEn = 'Rejected / Needs Completion';
  } else if (params.action === 'received' || params.status === 'received') {
    statusLabelAr = 'تم الاستلام (قيد المراجعة)';
    statusLabelEn = 'Received (Under Review)';
  } else if (params.action === 'note_updated') {
    statusLabelAr = 'تحديث ملاحظة المراجعة';
    statusLabelEn = 'Review Note Updated';
  }

  return {
    id:
      String(params.id || `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`).slice(
        0,
        80
      ),
    action: params.action,
    ...(params.status ? { status: params.status } : {}),
    statusLabelAr,
    statusLabelEn,
    actorName: cleanActor,
    actorRole: params.actorRole,
    ...(cleanNote ? { note: cleanNote } : {}),
    timestamp,
  };
}

function getProfileDisplayName(profile: Pick<TravelerProfile, 'name' | 'companyName' | 'accountType' | 'phone'>): string {
  if (profile.accountType === 'b2b_partner' && profile.companyName) {
    return profile.companyName;
  }
  return profile.name || profile.phone || 'العميل';
}

/**
 * Produces a complete chronological (newest-first) audit log timeline for a document.
 * Combines explicit `doc.auditLog` entries with legacy/notification reconstructions so older
 * documents still display full upload + review history.
 */
export function buildDocumentAuditTimeline(
  profile: Pick<
    TravelerProfile,
    'name' | 'companyName' | 'accountType' | 'phone' | 'notifications'
  >,
  docItem: TravelerDocument
): DocumentAuditEntry[] {
  const clientActor = docItem.uploadedBy || getProfileDisplayName(profile);
  const explicit = Array.isArray(docItem.auditLog) ? docItem.auditLog.filter(Boolean) : [];
  const entries: DocumentAuditEntry[] = [...explicit];

  const hasUploadEvent = entries.some((e) => e.action === 'uploaded');
  if (!hasUploadEvent && docItem.uploadedAt) {
    entries.push(
      createDocumentAuditEntry({
        id: `aud-init-${docItem.id}`,
        action: 'uploaded',
        status: 'received',
        actorName: clientActor,
        actorRole: 'client',
        timestamp: docItem.uploadedAt,
      })
    );
  }

  // Reconstruct any historical status changes recorded in client notifications when explicit log was absent
  if (explicit.length === 0 && Array.isArray(profile.notifications)) {
    for (const n of profile.notifications) {
      if (n.docId !== docItem.id || !n.createdAt) continue;
      const body = `${n.bodyAr || ''} ${n.bodyEn || ''}`;
      let derivedStatus: DocumentReviewStatus = 'received';
      let derivedAction: DocumentAuditAction = 'received';
      if (/مكتمل|معتمد|approved|completed/i.test(body)) {
        derivedStatus = 'completed';
        derivedAction = 'approved';
      } else if (/استكماله|إعادة رفعه|مرفوض|rejected|incomplete|completion/i.test(body)) {
        derivedStatus = 'pending_completion';
        derivedAction = 'rejected';
      }
      const noteMatch = /ملاحظة الإدارة:\s*(.+)$|Note:\s*(.+)$/i.exec(n.bodyAr || n.bodyEn || '');
      const extractedNote = (noteMatch?.[1] || noteMatch?.[2] || '').trim();
      entries.push(
        createDocumentAuditEntry({
          id: `aud-notif-${n.id}`,
          action: derivedAction,
          status: derivedStatus,
          actorName: docItem.lastReviewedBy || 'إدارة مسارك',
          actorRole: 'admin',
          note: extractedNote || undefined,
          timestamp: n.createdAt,
        })
      );
    }
  }

  // Ensure the current status & review timestamp are reflected if not already represented
  const currentStatus: DocumentReviewStatus = docItem.status || 'received';
  const statusTs = docItem.statusUpdatedAt || docItem.uploadedAt;
  const hasExplicitStatusMatch = entries.some(
    (e) =>
      e.actorRole === 'admin' &&
      e.status === currentStatus &&
      (!statusTs || e.timestamp === statusTs || Math.abs(Date.parse(e.timestamp) - Date.parse(statusTs)) < 5000)
  );

  if (
    !hasExplicitStatusMatch &&
    (currentStatus !== 'received' ||
      Boolean(docItem.statusNote) ||
      Boolean(docItem.lastReviewedBy) ||
      (docItem.statusUpdatedAt && docItem.statusUpdatedAt !== docItem.uploadedAt))
  ) {
    const action: DocumentAuditAction =
      currentStatus === 'completed'
        ? 'approved'
        : currentStatus === 'pending_completion'
        ? 'rejected'
        : 'received';
    entries.push(
      createDocumentAuditEntry({
        id: `aud-cur-${docItem.id}`,
        action,
        status: currentStatus,
        actorName: docItem.lastReviewedBy || 'إدارة مسارك',
        actorRole: 'admin',
        note: docItem.statusNote,
        timestamp: statusTs || new Date().toISOString(),
      })
    );
  }

  // Deduplicate identical action+timestamp pairs and sort newest first
  const deduped = new Map<string, DocumentAuditEntry>();
  for (const item of entries) {
    const key = `${item.action}|${item.status || ''}|${item.timestamp.slice(0, 19)}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values()).sort(
    (a, b) => Date.parse(b.timestamp || '') - Date.parse(a.timestamp || '')
  );
}

export interface DocumentMonitorRecord {
  recordKey: string;
  phone: string;
  clientName: string;
  accountType: AccountType;
  orderCode: string;
  doc: TravelerDocument;
  currentStatus: DocumentReviewStatus;
  uploadedAt: string;
  lastUpdatedAt: string;
  uploadedBy: string;
  lastReviewedBy: string | null;
  statusNote: string;
  timeline: DocumentAuditEntry[];
}

export interface DocumentMonitorStats {
  totalDocs: number;
  approvedCount: number;
  rejectedCount: number;
  pendingReviewCount: number;
  totalEventsCount: number;
}

export function collectGlobalDocumentAuditRecords(
  travelers: TravelerProfile[]
): DocumentMonitorRecord[] {
  const records: DocumentMonitorRecord[] = [];

  for (const tr of travelers) {
    const clientName = getProfileDisplayName(tr);
    const docs = Array.isArray(tr.documents) ? tr.documents : [];
    for (const docItem of docs) {
      const timeline = buildDocumentAuditTimeline(tr, docItem);
      const latestAdminEvent = timeline.find((e) => e.actorRole === 'admin');
      const currentStatus: DocumentReviewStatus = docItem.status || 'received';
      const lastUpdatedAt =
        timeline[0]?.timestamp || docItem.statusUpdatedAt || docItem.uploadedAt || '';

      records.push({
        recordKey: `${tr.phone}__${docItem.id}`,
        phone: tr.phone,
        clientName,
        accountType: tr.accountType || 'individual',
        orderCode: tr.orderCode || `MSK-${tr.phone.slice(-6)}`,
        doc: docItem,
        currentStatus,
        uploadedAt: docItem.uploadedAt || '',
        lastUpdatedAt,
        uploadedBy: docItem.uploadedBy || clientName,
        lastReviewedBy:
          docItem.lastReviewedBy || latestAdminEvent?.actorName || null,
        statusNote: docItem.statusNote || latestAdminEvent?.note || '',
        timeline,
      });
    }
  }

  return records.sort(
    (a, b) => Date.parse(b.lastUpdatedAt || '') - Date.parse(a.lastUpdatedAt || '')
  );
}

export function computeDocumentMonitorStats(
  records: DocumentMonitorRecord[]
): DocumentMonitorStats {
  let approvedCount = 0;
  let rejectedCount = 0;
  let pendingReviewCount = 0;
  let totalEventsCount = 0;

  for (const r of records) {
    if (r.currentStatus === 'completed') approvedCount++;
    else if (r.currentStatus === 'pending_completion') rejectedCount++;
    else pendingReviewCount++;
    totalEventsCount += r.timeline.length;
  }

  return {
    totalDocs: records.length,
    approvedCount,
    rejectedCount,
    pendingReviewCount,
    totalEventsCount,
  };
}

export interface DocumentMonitorFilterCriteria {
  query: string;
  status: 'all' | DocumentReviewStatus;
  docType: 'all' | TravelerDocument['docType'];
  dateRange: 'all' | 'today' | '7d' | '30d';
}

export function filterDocumentAuditRecords(
  records: DocumentMonitorRecord[],
  criteria: DocumentMonitorFilterCriteria,
  nowMs: number = Date.now()
): DocumentMonitorRecord[] {
  const q = criteria.query.trim().toLowerCase();
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);

  return records.filter((rec) => {
    if (criteria.status !== 'all' && rec.currentStatus !== criteria.status) {
      return false;
    }
    if (criteria.docType !== 'all' && rec.doc.docType !== criteria.docType) {
      return false;
    }
    if (criteria.dateRange !== 'all') {
      const tsMs = Date.parse(rec.lastUpdatedAt || rec.uploadedAt || '');
      if (!Number.isFinite(tsMs)) return false;
      if (criteria.dateRange === 'today') {
        const recDay = new Date(tsMs).toISOString().slice(0, 10);
        if (recDay !== todayIso) return false;
      } else if (criteria.dateRange === '7d') {
        if (nowMs - tsMs > 7 * 86_400_000) return false;
      } else if (criteria.dateRange === '30d') {
        if (nowMs - tsMs > 30 * 86_400_000) return false;
      }
    }
    if (q) {
      const actors = rec.timeline.map((t) => `${t.actorName} ${t.note || ''}`).join(' ');
      const haystack = `${rec.clientName} ${rec.phone} ${rec.orderCode} ${rec.doc.label} ${rec.doc.fileName} ${rec.lastReviewedBy || ''} ${rec.statusNote} ${actors}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

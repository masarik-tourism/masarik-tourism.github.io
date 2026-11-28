import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentAuditTimeline,
  collectGlobalDocumentAuditRecords,
  computeDocumentMonitorStats,
  createDocumentAuditEntry,
  filterDocumentAuditRecords,
  resolveDocumentReviewMeta,
} from './documentAuditHelpers';
import { TravelerDocument, TravelerProfile } from '../types/travel';

function makeProfile(overrides: Partial<TravelerProfile> = {}): TravelerProfile {
  return {
    phone: '201001112233',
    name: 'أحمد محمود',
    otp: '123456',
    verified: true,
    createdAt: '2026-11-01T09:00:00.000Z',
    orderStatus: 'قيد المراجعة والتنفيذ',
    documents: [],
    ...overrides,
  };
}

test('resolveDocumentReviewMeta maps completed to تم القبول and pending_completion to مرفوض', () => {
  assert.equal(resolveDocumentReviewMeta('completed').labelAr, 'تم القبول (معتمد)');
  assert.equal(resolveDocumentReviewMeta('pending_completion').labelAr, 'مرفوض / مطلوب استكماله');
  assert.equal(resolveDocumentReviewMeta('received').labelAr, 'تم الاستلام (قيد المراجعة)');
});

test('buildDocumentAuditTimeline preserves explicit auditLog entries in newest-first order and includes upload entry', () => {
  const docItem: TravelerDocument = {
    id: 'doc-100',
    label: 'جواز السفر',
    docType: 'passport',
    fileName: 'passport.jpg',
    dataUrl: 'https://drive.google.com/uc?id=1',
    uploadedAt: '2026-11-20T10:00:00.000Z',
    uploadedBy: 'أحمد محمود',
    lastReviewedBy: 'المدير العام',
    status: 'completed',
    statusUpdatedAt: '2026-11-22T15:00:00.000Z',
    auditLog: [
      createDocumentAuditEntry({
        id: 'aud-1',
        action: 'uploaded',
        status: 'received',
        actorName: 'أحمد محمود',
        actorRole: 'client',
        timestamp: '2026-11-20T10:00:00.000Z',
      }),
      createDocumentAuditEntry({
        id: 'aud-2',
        action: 'rejected',
        status: 'pending_completion',
        actorName: 'سارة الموظفة',
        actorRole: 'admin',
        note: 'الصورة غير واضحة',
        timestamp: '2026-11-21T12:00:00.000Z',
      }),
      createDocumentAuditEntry({
        id: 'aud-3',
        action: 'approved',
        status: 'completed',
        actorName: 'المدير العام',
        actorRole: 'admin',
        note: 'تمت المطابقة بنجاح',
        timestamp: '2026-11-22T15:00:00.000Z',
      }),
    ],
  };

  const timeline = buildDocumentAuditTimeline(makeProfile(), docItem);
  assert.equal(timeline.length, 3);
  assert.equal(timeline[0].action, 'approved');
  assert.equal(timeline[0].statusLabelAr, 'تم القبول');
  assert.equal(timeline[0].actorName, 'المدير العام');
  assert.equal(timeline[1].action, 'rejected');
  assert.equal(timeline[1].statusLabelAr, 'مرفوض / مطلوب استكماله');
  assert.equal(timeline[2].action, 'uploaded');
});

test('buildDocumentAuditTimeline reconstructs legacy documents without explicit auditLog', () => {
  const legacyDoc: TravelerDocument = {
    id: 'legacy-1',
    label: 'إيصال سداد',
    docType: 'receipt',
    fileName: 'receipt.jpg',
    dataUrl: 'https://drive.google.com/uc?id=2',
    uploadedAt: '2026-11-18T08:00:00.000Z',
    status: 'pending_completion',
    statusNote: 'المبلغ ناقص',
    statusUpdatedAt: '2026-11-19T14:00:00.000Z',
  };

  const timeline = buildDocumentAuditTimeline(makeProfile(), legacyDoc);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].action, 'rejected');
  assert.equal(timeline[0].note, 'المبلغ ناقص');
  assert.equal(timeline[1].action, 'uploaded');
  assert.equal(timeline[1].actorName, 'أحمد محمود');
});

test('collectGlobalDocumentAuditRecords, computeDocumentMonitorStats, and filterDocumentAuditRecords work end-to-end', () => {
  const nowMs = Date.parse('2026-11-28T12:00:00.000Z');
  const p1 = makeProfile({
    phone: '201001112233',
    name: 'سعيد علي',
    documents: [
      {
        id: 'd-ok',
        label: 'جواز سفر',
        docType: 'passport',
        fileName: 'pass.jpg',
        dataUrl: 'https://drive.google.com/uc?id=a',
        uploadedAt: '2026-11-27T10:00:00.000Z',
        lastReviewedBy: 'أحمد المشرف',
        status: 'completed',
        statusUpdatedAt: '2026-11-28T09:00:00.000Z',
      },
      {
        id: 'd-rej',
        label: 'صورة شخصية',
        docType: 'photo',
        fileName: 'photo.jpg',
        dataUrl: 'https://drive.google.com/uc?id=b',
        uploadedAt: '2026-11-10T10:00:00.000Z',
        lastReviewedBy: 'سارة',
        status: 'pending_completion',
        statusNote: 'خلفية غير بيضاء',
        statusUpdatedAt: '2026-11-12T10:00:00.000Z',
      },
    ],
  });

  const records = collectGlobalDocumentAuditRecords([p1]);
  assert.equal(records.length, 2);
  assert.equal(records[0].doc.id, 'd-ok');

  const stats = computeDocumentMonitorStats(records);
  assert.equal(stats.totalDocs, 2);
  assert.equal(stats.approvedCount, 1);
  assert.equal(stats.rejectedCount, 1);
  assert.equal(stats.pendingReviewCount, 0);

  const rejectedOnly = filterDocumentAuditRecords(
    records,
    { query: 'سارة', status: 'pending_completion', docType: 'all', dateRange: '30d' },
    nowMs
  );
  assert.equal(rejectedOnly.length, 1);
  assert.equal(rejectedOnly[0].doc.id, 'd-rej');
});

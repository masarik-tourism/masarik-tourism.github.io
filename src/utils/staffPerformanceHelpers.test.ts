import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaffPerformanceSummary,
  formatResponseDuration,
  searchAdminClientsGlobal,
} from './staffPerformanceHelpers';
import { ChatMessage, SubAdminAccount, TravelerProfile } from '../types/travel';

const NOW_MS = Date.parse('2026-11-28T12:00:00.000Z');

const subAdmins: SubAdminAccount[] = [
  {
    id: 'sa-1',
    name: 'أحمد الإنجاز',
    pin: '1122',
    permissions: ['manage_clients', 'activate_otp'],
    createdAt: '2026-10-01T09:00:00.000Z',
  },
  {
    id: 'sa-2',
    name: 'سارة المتابعة',
    pin: '3344',
    permissions: ['manage_clients'],
    createdAt: '2026-10-02T09:00:00.000Z',
  },
];

const sampleTravelers: TravelerProfile[] = [
  {
    phone: '201112223344',
    phoneNormalized: '201112223344',
    orderCode: 'MSK-223344',
    name: 'محمود السيد علي',
    passportNumber: 'A12345678',
    otp: '1234',
    verified: true,
    createdAt: '2026-11-20T09:00:00.000Z',
    orderStatus: 'تم تنفيذ الطلب',
    hasActiveOrder: true,
    completedBy: 'أحمد الإنجاز',
    completedAt: '2026-11-21T10:00:00.000Z',
    orderAuditLog: [
      {
        id: 'oa-1',
        action: 'deliverable_issued',
        fromStatus: 'قيد المراجعة والتنفيذ',
        toStatus: 'تم تنفيذ الطلب',
        actorName: 'أحمد الإنجاز',
        note: 'تأشيرة سياحية',
        timestamp: '2026-11-21T10:00:00.000Z',
      },
    ],
    documents: [
      {
        id: 'doc-1',
        label: 'جواز السفر',
        docType: 'passport',
        fileName: 'passport.jpg',
        dataUrl: '',
        uploadedAt: '2026-11-20T10:00:00.000Z',
        status: 'completed',
        lastReviewedBy: 'أحمد الإنجاز',
        statusUpdatedAt: '2026-11-20T10:20:00.000Z',
        auditLog: [
          {
            id: 'aud-1',
            action: 'uploaded',
            status: 'received',
            statusLabelAr: 'تم رفع المستند',
            statusLabelEn: 'Uploaded',
            actorName: 'محمود السيد علي',
            actorRole: 'client',
            timestamp: '2026-11-20T10:00:00.000Z',
          },
          {
            id: 'aud-2',
            action: 'approved',
            status: 'completed',
            statusLabelAr: 'تم القبول',
            statusLabelEn: 'Approved',
            actorName: 'أحمد الإنجاز',
            actorRole: 'admin',
            timestamp: '2026-11-20T10:20:00.000Z',
          },
        ],
      },
    ],
    issuedDocuments: [
      {
        id: 'del-1',
        docTypeLabel: 'تأشيرة سياحية',
        fileName: 'visa.pdf',
        mimeType: 'application/pdf',
        downloadUrl: 'https://example.com/visa.pdf',
        issuedAt: '2026-11-21T10:00:00.000Z',
        issuedBy: 'أحمد الإنجاز',
      },
    ],
  },
  {
    phone: '201009998877',
    phoneNormalized: '201009998877',
    orderCode: 'MSK-998877',
    name: 'فاطمة حسن',
    passportNumber: 'B99887766',
    otp: '5678',
    verified: true,
    createdAt: '2026-11-25T08:00:00.000Z',
    orderStatus: 'مكتمل',
    hasActiveOrder: true,
    completedBy: 'سارة المتابعة',
    completedAt: '2026-11-26T12:00:00.000Z',
    orderAuditLog: [
      {
        id: 'oa-2',
        action: 'order_completed',
        fromStatus: 'تم الحجز / الإصدار',
        toStatus: 'مكتمل',
        actorName: 'سارة المتابعة',
        timestamp: '2026-11-26T12:00:00.000Z',
      },
    ],
    documents: [
      {
        id: 'doc-2',
        label: 'صورة شخصية',
        docType: 'photo',
        fileName: 'photo.jpg',
        dataUrl: '',
        uploadedAt: '2026-11-25T09:00:00.000Z',
        status: 'pending_completion',
        lastReviewedBy: 'سارة المتابعة',
        statusUpdatedAt: '2026-11-25T10:00:00.000Z',
        auditLog: [
          {
            id: 'aud-3',
            action: 'uploaded',
            status: 'received',
            statusLabelAr: 'تم رفع المستند',
            statusLabelEn: 'Uploaded',
            actorName: 'فاطمة حسن',
            actorRole: 'client',
            timestamp: '2026-11-25T09:00:00.000Z',
          },
          {
            id: 'aud-4',
            action: 'rejected',
            status: 'pending_completion',
            statusLabelAr: 'مرفوض',
            statusLabelEn: 'Rejected',
            actorName: 'سارة المتابعة',
            actorRole: 'admin',
            note: 'خلفية غير بيضاء',
            timestamp: '2026-11-25T10:00:00.000Z',
          },
        ],
      },
    ],
    familyMembers: [
      {
        id: 'fm-1',
        relationship: 'child',
        firstName: 'يوسف',
        lastName: 'حسن',
        passportNumber: 'C55443322',
        passportPhotoUrl: '',
        personalPhotoUrl: '',
        createdAt: '2026-11-25T08:30:00.000Z',
      },
    ],
  },
];

const sampleChats: Record<string, ChatMessage[]> = {
  '201112223344': [
    {
      id: 'm1',
      phoneId: '201112223344',
      senderRole: 'client',
      senderName: 'محمود السيد علي',
      text: 'هل تم مراجعة الجواز؟',
      attachments: [],
      messageType: 'text',
      readByAdmin: true,
      readByClient: true,
      createdAt: '2026-11-20T11:00:00.000Z',
    },
    {
      id: 'm2',
      phoneId: '201112223344',
      senderRole: 'admin',
      senderName: 'أحمد الإنجاز',
      text: 'نعم، تم اعتماده وجارٍ التنفيذ.',
      attachments: [],
      messageType: 'text',
      readByAdmin: true,
      readByClient: true,
      createdAt: '2026-11-20T11:10:00.000Z',
    },
  ],
};

test('buildStaffPerformanceSummary aggregates completed orders, response speed, and Audit Log feed', () => {
  const summary = buildStaffPerformanceSummary({
    travelers: sampleTravelers,
    subAdmins,
    chatMessagesByPhone: sampleChats,
    period: 'all',
    nowMs: NOW_MS,
  });

  assert.equal(summary.totalCompletedOrders, 2);
  assert.ok(summary.auditFeed.length >= 4);

  const ahmed = summary.staffMetrics.find((m) => m.staffName === 'أحمد الإنجاز');
  assert.ok(ahmed);
  assert.equal(ahmed.completedOrdersCount, 1);
  assert.equal(ahmed.deliverablesIssuedCount, 1);
  assert.equal(ahmed.docApprovalsCount, 1);
  assert.equal(ahmed.chatRepliesCount, 1);
  // 20 min doc audit latency + 10 min chat reply latency => 15 min average
  assert.equal(ahmed.avgAuditResponseMinutes, 20);
  assert.equal(ahmed.avgChatResponseMinutes, 10);
  assert.equal(ahmed.avgResponseMinutes, 15);

  const sara = summary.staffMetrics.find((m) => m.staffName === 'سارة المتابعة');
  assert.ok(sara);
  assert.equal(sara.completedOrdersCount, 1);
  assert.equal(sara.docRejectionsCount, 1);
  assert.equal(sara.avgAuditResponseMinutes, 60);

  assert.equal(summary.fastestResponderName, 'أحمد الإنجاز');
  assert.equal(formatResponseDuration(15, 'ar'), '15 دقيقة');
  assert.equal(formatResponseDuration(60, 'ar'), '1 ساعة');
});

test('buildStaffPerformanceSummary respects period window filtering (7d vs all)', () => {
  const recentOnly = buildStaffPerformanceSummary({
    travelers: sampleTravelers,
    subAdmins,
    chatMessagesByPhone: sampleChats,
    period: '7d',
    nowMs: NOW_MS,
  });

  // Ahmed's actions were on 2026-11-20/21 (>7 days before Nov 28 at 12:00); Sara's were on Nov 25/26
  const ahmed7d = recentOnly.staffMetrics.find((m) => m.staffName === 'أحمد الإنجاز');
  const sara7d = recentOnly.staffMetrics.find((m) => m.staffName === 'سارة المتابعة');
  assert.equal(ahmed7d?.completedOrdersCount, 0);
  assert.equal(sara7d?.completedOrdersCount, 1);
});

test('searchAdminClientsGlobal matches by name, phone (including Arabic digits), and passport number', () => {
  const byName = searchAdminClientsGlobal(sampleTravelers, 'محمود');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].matchField, 'name');
  assert.equal(byName[0].phone, '201112223344');

  const byArabicDigitsPhone = searchAdminClientsGlobal(sampleTravelers, '٠١٠٠٩٩٩');
  assert.equal(byArabicDigitsPhone.length, 1);
  assert.equal(byArabicDigitsPhone[0].matchField, 'phone');
  assert.equal(byArabicDigitsPhone[0].phone, '201009998877');

  const byPassport = searchAdminClientsGlobal(sampleTravelers, 'a12345678');
  assert.equal(byPassport.length, 1);
  assert.equal(byPassport[0].matchField, 'passport');
  assert.equal(byPassport[0].matchedPassportNumber, 'A12345678');

  const byFamilyPassport = searchAdminClientsGlobal(sampleTravelers, 'C55443322');
  assert.equal(byFamilyPassport.length, 1);
  assert.equal(byFamilyPassport[0].matchField, 'family_passport');
  assert.equal(byFamilyPassport[0].matchedFamilyMemberName, 'يوسف حسن');
});

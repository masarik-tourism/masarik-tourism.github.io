import assert from 'node:assert/strict';
import test from 'node:test';
import { TravelerProfile } from '../types/travel';
import {
  CLIENT_PRIORITY_TIERS,
  analyzeClientEngagement,
  buildDocumentReminderWhatsAppMessage,
  buildSixMonthReportsData,
  collectClientFilterOptions,
  evaluateClientDocumentStaleness,
  getClientTierConfig,
  matchesAdvancedClientFilters,
  normalizeClientPriorityTier,
} from './clientReportsHelpers';

function makeTraveler(overrides: Partial<TravelerProfile>): TravelerProfile {
  return {
    phone: '201000000001',
    name: 'عميل تجريبي',
    otp: '1234',
    verified: true,
    createdAt: '2026-10-05T10:00:00.000Z',
    orderStatus: 'none',
    documents: [],
    ...overrides,
  };
}

test('getClientTierConfig returns distinct colors & labels for VIP, New, Delayed, and Standard', () => {
  assert.deepEqual(CLIENT_PRIORITY_TIERS, ['vip', 'new', 'delayed']);
  assert.equal(normalizeClientPriorityTier('vip'), 'vip');
  assert.equal(normalizeClientPriorityTier('unknown'), undefined);

  const vip = getClientTierConfig('vip', 'ar');
  const newTier = getClientTierConfig('new', 'ar');
  const delayed = getClientTierConfig('delayed', 'ar');
  const standard = getClientTierConfig(undefined, 'ar');

  assert.equal(vip.label, 'عميل VIP');
  assert.equal(vip.chartColor, '#C6A052');
  assert.match(vip.avatarFallbackClass, /C6A052/);

  assert.equal(newTier.label, 'عميل جديد');
  assert.equal(newTier.chartColor, '#0284C7');
  assert.match(newTier.avatarFallbackClass, /sky-600/);

  assert.equal(delayed.label, 'عميل متأخر');
  assert.equal(delayed.chartColor, '#DC2626');
  assert.match(delayed.avatarFallbackClass, /red-600/);

  assert.equal(standard.isClassified, false);
  assert.match(standard.avatarFallbackClass, /0F2438/);
});

test('buildSixMonthReportsData aggregates 6 trailing months of orders, completed visas, and tier counts', () => {
  const ref = new Date('2026-11-15T12:00:00.000Z');
  const travelers: TravelerProfile[] = [
    makeTraveler({
      phone: '201000000001',
      clientTier: 'vip',
      createdAt: '2026-06-12T08:00:00.000Z',
      hasActiveOrder: true,
      orderStatus: 'مكتمل',
      updatedAt: '2026-07-03T09:00:00.000Z',
    }),
    makeTraveler({
      phone: '201000000002',
      clientTier: 'new',
      createdAt: '2026-11-02T08:00:00.000Z',
      hasActiveOrder: true,
      orderStatus: 'قيد المراجعة والتنفيذ',
    }),
    makeTraveler({
      phone: '201000000003',
      clientTier: 'delayed',
      createdAt: '2026-09-18T08:00:00.000Z',
      hasActiveOrder: true,
      orderStatus: 'تم الحجز / الإصدار',
      issuedDocuments: [
        {
          id: 'doc-1',
          docTypeLabel: 'تأشيرة سياحية',
          fileName: 'visa.pdf',
          mimeType: 'application/pdf',
          downloadUrl: 'https://example.com/visa.pdf',
          issuedAt: '2026-10-10T10:00:00.000Z',
        },
      ],
    }),
    makeTraveler({
      phone: '201000000004',
      // No active order and older than 6 months -> only counted in standard tier
      createdAt: '2025-12-01T08:00:00.000Z',
      hasActiveOrder: false,
      orderStatus: 'none',
    }),
  ];

  const report = buildSixMonthReportsData(travelers, 'ar', ref);
  assert.equal(report.monthlyTrends.length, 6);
  assert.deepEqual(
    report.monthlyTrends.map((m) => m.monthKey),
    ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
  );

  assert.equal(report.tierCounts.vip, 1);
  assert.equal(report.tierCounts.new, 1);
  assert.equal(report.tierCounts.delayed, 1);
  assert.equal(report.tierCounts.standard, 1);

  assert.equal(report.totalOrders6M, 3);
  assert.equal(report.completedVisas6M, 2);
  assert.equal(report.inProgressOrders6M, 1);
  assert.equal(report.completionRatePct, 67);

  const june = report.monthlyTrends.find((m) => m.monthKey === '2026-06')!;
  const july = report.monthlyTrends.find((m) => m.monthKey === '2026-07')!;
  const oct = report.monthlyTrends.find((m) => m.monthKey === '2026-10')!;
  const nov = report.monthlyTrends.find((m) => m.monthKey === '2026-11')!;

  assert.equal(june.totalOrders, 1);
  assert.equal(july.completedVisas, 1);
  assert.equal(oct.completedVisas, 1);
  assert.equal(nov.inProgressOrders, 1);
  assert.equal(nov.newClients, 1);
});

test('evaluateClientDocumentStaleness flags non-completed clients > 7 days without doc updates', () => {
  const nowMs = Date.parse('2026-11-28T12:00:00.000Z');

  // 10 days old document on active order -> stale
  const staleWithDocs = evaluateClientDocumentStaleness(
    makeTraveler({
      orderStatus: 'قيد المراجعة والتنفيذ',
      hasActiveOrder: true,
      documents: [
        {
          id: 'd1',
          label: 'جواز',
          docType: 'passport',
          fileName: 'p.jpg',
          dataUrl: 'https://drive.google.com/1',
          uploadedAt: '2026-11-18T10:00:00.000Z',
        },
      ],
    }),
    nowMs
  );
  assert.equal(staleWithDocs.isStale, true);
  assert.equal(staleWithDocs.hasDocuments, true);
  assert.equal(staleWithDocs.daysSinceUpdate, 10);

  // 0 documents, registered 9 days ago -> stale
  const staleNoDocs = evaluateClientDocumentStaleness(
    makeTraveler({
      createdAt: '2026-11-19T08:00:00.000Z',
      documents: [],
    }),
    nowMs
  );
  assert.equal(staleNoDocs.isStale, true);
  assert.equal(staleNoDocs.hasDocuments, false);
  assert.equal(staleNoDocs.daysSinceUpdate, 9);

  // Document updated 3 days ago -> fresh
  const freshDocs = evaluateClientDocumentStaleness(
    makeTraveler({
      documents: [
        {
          id: 'd2',
          label: 'صورة',
          docType: 'photo',
          fileName: 'pic.jpg',
          dataUrl: 'https://drive.google.com/2',
          uploadedAt: '2026-11-10T10:00:00.000Z',
          statusUpdatedAt: '2026-11-25T10:00:00.000Z',
        },
      ],
    }),
    nowMs
  );
  assert.equal(freshDocs.isStale, false);
  assert.equal(freshDocs.daysSinceUpdate, 3);

  // Completed order with old documents -> not flagged as stale
  const completedOld = evaluateClientDocumentStaleness(
    makeTraveler({
      orderStatus: 'مكتمل',
      hasActiveOrder: true,
      documents: [
        {
          id: 'd3',
          label: 'جواز',
          docType: 'passport',
          fileName: 'p.jpg',
          dataUrl: 'https://drive.google.com/3',
          uploadedAt: '2026-10-01T10:00:00.000Z',
        },
      ],
    }),
    nowMs
  );
  assert.equal(completedOld.isStale, false);

  const waMsg = buildDocumentReminderWhatsAppMessage({
    clientName: 'محمد علي',
    orderCode: 'MSK-100001',
    daysSinceUpdate: 10,
    hasDocuments: true,
    isStale: true,
    serviceTitle: 'تأشيرة سياحية',
    lang: 'ar',
  });
  assert.match(waMsg, /محمد علي/);
  assert.match(waMsg, /MSK-100001/);
  assert.match(waMsg, /10 يوماً/);
});

test('matchesAdvancedClientFilters filters accurately by city, registration date, and visa type', () => {
  const nowMs = Date.parse('2026-11-28T12:00:00.000Z');
  const cairoVisa = makeTraveler({
    city: 'القاهرة',
    createdAt: '2026-11-26T09:00:00.000Z',
    preferredVisaType: 'حجز تساهيل VFS',
  });
  const riyadhUmrah = makeTraveler({
    city: 'الرياض',
    createdAt: '2026-10-10T09:00:00.000Z',
    preferredVisaType: '',
    b2cVisa: {
      visaType: 'umrah_b2c',
      entryDate: '2026-10-15',
      stayDays: 30,
      expectedExitDate: '2026-11-14',
      status: 'active',
    },
  });

  const options = collectClientFilterOptions([cairoVisa, riyadhUmrah]);
  assert.ok(options.cityOptions.includes('القاهرة'));
  assert.ok(options.visaTypeOptions.includes('حجز تساهيل VFS'));

  assert.equal(
    matchesAdvancedClientFilters(
      cairoVisa,
      { city: 'القاهرة', regPreset: 'last_7_days', regFrom: '', regTo: '', visaType: 'تساهيل' },
      nowMs
    ),
    true
  );

  assert.equal(
    matchesAdvancedClientFilters(
      riyadhUmrah,
      { city: 'القاهرة', regPreset: 'all', regFrom: '', regTo: '', visaType: '' },
      nowMs
    ),
    false
  );

  assert.equal(
    matchesAdvancedClientFilters(
      riyadhUmrah,
      {
        city: 'الرياض',
        regPreset: 'custom',
        regFrom: '2026-10-01',
        regTo: '2026-10-31',
        visaType: 'عمرة B2C',
      },
      nowMs
    ),
    true
  );
});

test('analyzeClientEngagement classifies highly_likely, active_engaged, slow_responder, and dormant from recency & reply speed', () => {
  const nowMs = Date.parse('2026-11-28T12:00:00.000Z');

  // 1. Highly Likely (محتمل جداً): recent interaction + fast replies (15 min) + active order
  const fastProfile = makeTraveler({
    phone: '201000000010',
    lastSeenAt: '2026-11-28T10:30:00.000Z',
    hasActiveOrder: true,
    orderStatus: 'تم استلام الطلب',
  });
  const fastAnalysis = analyzeClientEngagement({
    profile: fastProfile,
    messages: [
      {
        id: 'm1',
        phoneId: '201000000010',
        senderRole: 'admin',
        senderName: 'إدارة مسارك',
        text: 'يرجى إرسال صورة الجواز',
        attachments: [],
        messageType: 'text',
        readByAdmin: true,
        readByClient: true,
        createdAt: '2026-11-28T10:00:00.000Z',
      },
      {
        id: 'm2',
        phoneId: '201000000010',
        senderRole: 'client',
        senderName: 'عميل',
        text: 'تفضل مرفق الجواز',
        attachments: [],
        messageType: 'text',
        readByAdmin: true,
        readByClient: true,
        createdAt: '2026-11-28T10:15:00.000Z',
      },
    ],
    lang: 'ar',
    nowMs,
  });
  assert.equal(fastAnalysis.status, 'highly_likely');
  assert.equal(fastAnalysis.labelAr, 'محتمل جداً');
  assert.equal(fastAnalysis.avgResponseMinutes, 15);
  assert.ok(fastAnalysis.score >= 80);

  // 2. Active & Engaged (نشط متفاعل): moderate recency (5d ago) & moderate reply (~3h)
  const warmProfile = makeTraveler({
    phone: '201000000011',
    lastSeenAt: '2026-11-23T12:00:00.000Z',
  });
  const warmAnalysis = analyzeClientEngagement({
    profile: warmProfile,
    messages: [
      {
        id: 'm3',
        phoneId: '201000000011',
        senderRole: 'admin',
        senderName: 'إدارة مسارك',
        text: 'مرحبا بك',
        attachments: [],
        messageType: 'text',
        readByAdmin: true,
        readByClient: true,
        createdAt: '2026-11-23T09:00:00.000Z',
      },
      {
        id: 'm4',
        phoneId: '201000000011',
        senderRole: 'client',
        senderName: 'عميل',
        text: 'أهلا',
        attachments: [],
        messageType: 'text',
        readByAdmin: true,
        readByClient: true,
        createdAt: '2026-11-23T12:00:00.000Z',
      },
    ],
    lang: 'ar',
    nowMs,
  });
  assert.equal(warmAnalysis.status, 'active_engaged');
  assert.equal(warmAnalysis.labelAr, 'نشط متفاعل');
  assert.equal(warmAnalysis.avgResponseMinutes, 180);

  // 3. Slow Responder (بطيء الاستجابة): unanswered admin prompt waiting ~3 days
  const slowProfile = makeTraveler({
    phone: '201000000012',
    lastSeenAt: '2026-11-25T10:00:00.000Z',
  });
  const slowAnalysis = analyzeClientEngagement({
    profile: slowProfile,
    thread: {
      phoneId: '201000000012',
      lastMessageText: 'هل قمت بتجهيز الأوراق؟',
      lastMessageAt: '2026-11-25T10:00:00.000Z',
      lastSenderRole: 'admin',
      unreadAdminCount: 0,
      unreadClientCount: 1,
      updatedAt: '2026-11-25T10:00:00.000Z',
    },
    lang: 'ar',
    nowMs,
  });
  assert.equal(slowAnalysis.status, 'slow_responder');
  assert.equal(slowAnalysis.labelAr, 'بطيء الاستجابة');

  // 4. Dormant (خامل): last interaction 25 days ago with no response
  const dormantProfile = makeTraveler({
    phone: '201000000013',
    createdAt: '2026-10-01T10:00:00.000Z',
    lastSeenAt: '2026-11-03T10:00:00.000Z',
  });
  const dormantAnalysis = analyzeClientEngagement({
    profile: dormantProfile,
    lang: 'ar',
    nowMs,
  });
  assert.equal(dormantAnalysis.status, 'dormant');
  assert.equal(dormantAnalysis.labelAr, 'خامل');
  assert.ok(dormantAnalysis.daysSinceLastInteraction >= 25);
});


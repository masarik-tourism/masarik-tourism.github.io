import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAppointmentReminderStatus,
  buildAppointment24hReminderWhatsAppMessage,
  buildCalendarMonthMatrix,
  collectUpcoming24hAppointmentAlerts,
  parseAppointmentEpochMs,
} from './appointmentCalendarHelpers';
import { TravelerProfile } from '../types/travel';

test('parseAppointmentEpochMs parses valid YYYY-MM-DD and HH:mm', () => {
  const epoch = parseAppointmentEpochMs('2026-11-29', '10:30');
  assert.ok(epoch !== null);
  const dt = new Date(epoch);
  assert.equal(dt.getFullYear(), 2026);
  assert.equal(dt.getMonth(), 10); // November is 10 (0-indexed)
  assert.equal(dt.getDate(), 29);
  assert.equal(dt.getHours(), 10);
  assert.equal(dt.getMinutes(), 30);
});

test('evaluateAppointmentReminderStatus flags 24h reminder due when within 30 hours', () => {
  const now = new Date('2026-11-28T10:00:00Z').getTime();
  // Appointment tomorrow at 10:00 AM (24 hours away)
  const tomorrowDate = '2026-11-29';
  const tomorrowTime = '10:00';

  const res = evaluateAppointmentReminderStatus(
    {
      serviceType: 'موعد تساهيل (VFS Tasheer)',
      appointmentDate: tomorrowDate,
      appointmentTime: tomorrowTime,
      location: 'فرع تساهيل المنصورة',
    },
    now
  );

  assert.equal(res.hasAppointment, true);
  assert.equal(res.isPast, false);
  assert.equal(res.isAlreadyReminded, false);
  assert.ok(res.isDueForReminder);
  assert.ok(res.statusBadge.textAr.includes('تذكير الـ 24 ساعة مستحق'));
});

test('evaluateAppointmentReminderStatus marks as reminded when reminder24hSentAt is present', () => {
  const now = new Date('2026-11-28T10:00:00Z').getTime();
  const res = evaluateAppointmentReminderStatus(
    {
      serviceType: 'كشف طبي جامكا (GAMCA)',
      appointmentDate: '2026-11-29',
      appointmentTime: '09:00',
      reminder24hSentAt: '2026-11-28T09:30:00Z',
    },
    now
  );

  assert.equal(res.hasAppointment, true);
  assert.equal(res.isAlreadyReminded, true);
  assert.equal(res.isDueForReminder, false);
  assert.ok(res.statusBadge.textAr.includes('تم إرسال تذكير الـ 24 ساعة'));
});

test('evaluateAppointmentReminderStatus marks future appointment > 36 hours as upcoming without due reminder', () => {
  const now = new Date('2026-11-28T10:00:00Z').getTime();
  const res = evaluateAppointmentReminderStatus(
    {
      serviceType: 'موعد تساهيل',
      appointmentDate: '2026-12-05',
      appointmentTime: '11:00',
    },
    now
  );

  assert.equal(res.hasAppointment, true);
  assert.equal(res.isPast, false);
  assert.equal(res.isDueForReminder, false);
  assert.equal(res.isWithin24h, false);
  assert.ok(res.daysRemaining !== null && res.daysRemaining >= 6);
});

test('buildAppointment24hReminderWhatsAppMessage generates complete Arabic reminder', () => {
  const msg = buildAppointment24hReminderWhatsAppMessage({
    clientName: 'أحمد محمود',
    orderCode: 'MSK-9901',
    serviceType: 'موعد تساهيل (VFS Tasheer) — فرع المنصورة',
    appointmentDate: '2026-11-29',
    appointmentTime: '10:30',
    location: 'برج السوسن، المنصورة',
    referenceNumber: 'VFS-MN-8841',
    notes: 'إحضار أصل الجواز وصور شخصية',
    lang: 'ar',
  });

  assert.ok(msg.includes('أحمد محمود'));
  assert.ok(msg.includes('موعد تساهيل (VFS Tasheer)'));
  assert.ok(msg.includes('10:30'));
  assert.ok(msg.includes('برج السوسن، المنصورة'));
  assert.ok(msg.includes('VFS-MN-8841'));
  assert.ok(msg.includes('إرشادات وتعليمات هامة للحضور'));
});

test('buildCalendarMonthMatrix generates complete week rows with 7 days', () => {
  const matrix = buildCalendarMonthMatrix(2026, 10, '2026-11-29'); // November 2026
  assert.ok(matrix.length >= 4);
  for (const week of matrix) {
    assert.equal(week.length, 7);
  }
  const flatDays = matrix.flat();
  const targetDay = flatDays.find((d) => d.isoDate === '2026-11-29');
  assert.ok(targetDay);
  assert.equal(targetDay.isSelected, true);
  assert.equal(targetDay.isCurrentMonth, true);
  assert.equal(targetDay.dayNumber, 29);
});

test('collectUpcoming24hAppointmentAlerts aggregates clients needing 24h reminder', () => {
  const now = new Date('2026-11-28T10:00:00Z').getTime();
  const mockTravelers: TravelerProfile[] = [
    {
      phone: '201111111111',
      name: 'محمد علي',
      orderStatus: 'قيد المراجعة والتنفيذ',
      hasActiveOrder: true,
      verified: true,
      otp: '1234',
      createdAt: '2026-11-20T00:00:00Z',
      documents: [],
      appointmentDetails: {
        serviceType: 'موعد تساهيل (VFS Tasheer)',
        appointmentDate: '2026-11-29',
        appointmentTime: '10:00',
        location: 'فرع تساهيل المنصورة',
      },
    },
    {
      phone: '201222222222',
      name: 'محمود حسن',
      orderStatus: 'تم تنفيذ الطلب',
      hasActiveOrder: true,
      verified: true,
      otp: '5678',
      createdAt: '2026-11-20T00:00:00Z',
      documents: [],
      appointmentDetails: {
        serviceType: 'كشف طبي جامكا',
        appointmentDate: '2026-11-29',
        appointmentTime: '11:00',
        reminder24hSentAt: '2026-11-28T09:00:00Z', // already sent
      },
    },
    {
      phone: '201333333333',
      name: 'علي إبراهيم',
      orderStatus: 'تم استلام الطلب',
      hasActiveOrder: true,
      verified: true,
      otp: '9999',
      createdAt: '2026-11-20T00:00:00Z',
      documents: [],
      // no appointment
    },
  ];

  const alerts = collectUpcoming24hAppointmentAlerts(mockTravelers, now);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].phone, '201111111111');
  assert.equal(alerts[0].displayName, 'محمد علي');
});

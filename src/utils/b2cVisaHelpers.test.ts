import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildB2cExitReminderWhatsAppMessage,
  calculateExpectedExitDate,
  evaluateB2cExitCountdown,
  isB2cUrgentOrWarning,
} from './b2cVisaHelpers';

test('calculateExpectedExitDate accurately adds stayDays in UTC calendar days', () => {
  assert.equal(calculateExpectedExitDate('2026-11-01', 15), '2026-11-16');
  assert.equal(calculateExpectedExitDate('2026-11-01', 30), '2026-12-01');
  assert.equal(calculateExpectedExitDate('2026-11-01', 90), '2027-01-30');
  assert.equal(calculateExpectedExitDate('invalid-date', 30), '');
});

test('evaluateB2cExitCountdown classifies safe, warning (<=5d), urgent (<=1d / overdue), and exited', () => {
  // 10 days left -> safe
  const safeEval = evaluateB2cExitCountdown(
    { visaType: 'umrah_b2c', entryDate: '2026-11-01', stayDays: 30, status: 'active' },
    '2026-11-21'
  );
  assert.equal(safeEval?.expectedExitDate, '2026-12-01');
  assert.equal(safeEval?.remainingDays, 10);
  assert.equal(safeEval?.alertLevel, 'safe');

  // 5 days left -> warning
  const warnEval = evaluateB2cExitCountdown(
    { visaType: 'umrah_b2c', entryDate: '2026-11-01', stayDays: 30, status: 'active' },
    '2026-11-26'
  );
  assert.equal(warnEval?.remainingDays, 5);
  assert.equal(warnEval?.alertLevel, 'warning');
  assert.equal(
    isB2cUrgentOrWarning(
      { visaType: 'umrah_b2c', entryDate: '2026-11-01', stayDays: 30, status: 'active' },
      '2026-11-26'
    ),
    true
  );

  // 1 day left -> urgent
  const urgentOneDay = evaluateB2cExitCountdown(
    { visaType: 'free_b2c', entryDate: '2026-11-01', stayDays: 30, status: 'active' },
    '2026-11-30'
  );
  assert.equal(urgentOneDay?.remainingDays, 1);
  assert.equal(urgentOneDay?.alertLevel, 'urgent');

  // Overdue -> urgent with negative remainingDays
  const overdueEval = evaluateB2cExitCountdown(
    { visaType: 'free_b2c', entryDate: '2026-11-01', stayDays: 15, status: 'active' },
    '2026-11-20'
  );
  assert.equal(overdueEval?.remainingDays, -4);
  assert.equal(overdueEval?.alertLevel, 'urgent');

  // Exited -> no alert even if exit date passed
  const exitedRecord = {
    visaType: 'umrah_b2c' as const,
    entryDate: '2026-11-01',
    stayDays: 15,
    status: 'exited' as const,
  };
  assert.equal(evaluateB2cExitCountdown(exitedRecord, '2026-11-20')?.alertLevel, 'exited');
  assert.equal(isB2cUrgentOrWarning(exitedRecord, '2026-11-20'), false);
});

test('buildB2cExitReminderWhatsAppMessage formats polite reminder with visa type and deadline', () => {
  const arMsg = buildB2cExitReminderWhatsAppMessage({
    clientName: 'محمد حسن',
    passportNumber: 'A12345678',
    visaType: 'umrah_b2c',
    expectedExitDate: '2026-12-01',
    remainingDays: 3,
    lang: 'ar',
  });
  assert.ok(arMsg.includes('محمد حسن'));
  assert.ok(arMsg.includes('A12345678'));
  assert.ok(arMsg.includes('عمرة B2C'));
  assert.ok(arMsg.includes('2026-12-01'));
  assert.ok(arMsg.includes('غرامات تأخير'));
});

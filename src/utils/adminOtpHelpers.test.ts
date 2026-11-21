import test from 'node:test';
import assert from 'node:assert/strict';
import type { TravelerProfile } from '../types/travel';
import {
  buildPendingOtpSnapshot,
  buildSmsSendUrl,
  findNewPendingOtpTrigger,
  getPendingOtpClients,
} from './adminOtpHelpers';

function makeTraveler(overrides: Partial<TravelerProfile>): TravelerProfile {
  return {
    phone: '01012345678',
    phoneNormalized: '201012345678',
    name: 'Test User',
    otp: '654321',
    otpGeneratedAt: '2026-11-21T10:00:00.000Z',
    verified: false,
    accountStatus: 'pending_verification',
    orderStatus: 'تم استلام الطلب',
    createdAt: '2026-11-21T10:00:00.000Z',
    documents: [],
    notifications: [],
    ...overrides,
  };
}

test('buildSmsSendUrl constructs standards-compliant E.164 sms: URI with encoded body', () => {
  const msg = 'مرحباً أحمد، كود تفعيل حسابك: 654321\nhttps://masarik.example/?otp=654321';
  const url = buildSmsSendUrl('01012345678', msg);

  assert.equal(url.startsWith('sms:+201012345678?body='), true);
  const encodedPart = url.split('?body=')[1];
  assert.equal(decodeURIComponent(encodedPart), msg);
});

test('buildSmsSendUrl supports international numbers and empty message fallback', () => {
  assert.equal(buildSmsSendUrl('+966 50 123 4567'), 'sms:+966501234567');
  assert.equal(buildSmsSendUrl('00201128440008', 'OTP 112233'), 'sms:+201128440008?body=OTP%20112233');
  assert.equal(buildSmsSendUrl('', 'Hello'), 'sms:?body=Hello');
});

test('getPendingOtpClients filters unverified or pending_verification profiles and sorts newest first', () => {
  const verifiedClient = makeTraveler({
    phone: '01000000001',
    phoneNormalized: '201000000001',
    verified: true,
    accountStatus: 'verified',
    otpGeneratedAt: '2026-11-21T12:00:00.000Z',
  });
  const olderPending = makeTraveler({
    phone: '01000000002',
    phoneNormalized: '201000000002',
    verified: false,
    accountStatus: 'pending_verification',
    otpGeneratedAt: '2026-11-21T09:00:00.000Z',
  });
  const newestPending = makeTraveler({
    phone: '01000000003',
    phoneNormalized: '201000000003',
    verified: true, // even if stale verified=true, pending_verification must stay in queue
    accountStatus: 'pending_verification',
    otpGeneratedAt: '2026-11-21T11:30:00.000Z',
  });

  const result = getPendingOtpClients([verifiedClient, olderPending, newestPending]);
  assert.deepEqual(
    result.map((c) => c.phoneNormalized),
    ['201000000003', '201000000002']
  );
});

test('findNewPendingOtpTrigger stays quiet during initial hydration and fires on new/regenerated OTP', () => {
  const initialClient = makeTraveler({
    phoneNormalized: '201000000010',
    otp: '111222',
    otpGeneratedAt: '2026-11-21T10:00:00.000Z',
  });

  // Initial unhydrated pass -> no chime trigger
  const pass1 = findNewPendingOtpTrigger(new Map(), [initialClient], false);
  assert.equal(pass1.triggeredClient, null);
  assert.equal(pass1.nextSnapshot.size, 1);

  // Same state after hydration -> still no chime trigger
  const pass2 = findNewPendingOtpTrigger(pass1.nextSnapshot, [initialClient], true);
  assert.equal(pass2.triggeredClient, null);

  // New unverified client registers -> triggers!
  const newClient = makeTraveler({
    phone: '01099998888',
    phoneNormalized: '201099998888',
    otp: '998877',
    otpGeneratedAt: '2026-11-21T10:05:00.000Z',
  });
  const pass3 = findNewPendingOtpTrigger(pass2.nextSnapshot, [initialClient, newClient], true);
  assert.equal(pass3.triggeredClient?.phoneNormalized, '201099998888');

  // Existing unverified client requests a fresh OTP -> triggers!
  const regeneratedClient = makeTraveler({
    ...initialClient,
    otp: '334455',
    otpGeneratedAt: '2026-11-21T10:06:00.000Z',
  });
  const prevWithBoth = buildPendingOtpSnapshot([initialClient, newClient]);
  const pass4 = findNewPendingOtpTrigger(prevWithBoth, [regeneratedClient, newClient], true);
  assert.equal(pass4.triggeredClient?.phoneNormalized, '201000000010');
});

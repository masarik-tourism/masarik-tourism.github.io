import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_COMPANY_WHATSAPP_NUMBER,
  buildClientOtpRequestMessage,
  buildClientOtpRequestUrl,
  buildWhatsAppSendUrl,
  createPendingVerificationClientFields,
  formatWhatsAppPhoneForMessage,
  isClientAccountVerified,
  normalizeWhatsAppPhoneDigits,
  resolveOtpCompanyWhatsAppNumber,
} from './whatsappHelpers';

test('normalizeWhatsAppPhoneDigits converts Egyptian local and Arabic numerals to international WhatsApp format', () => {
  assert.equal(normalizeWhatsAppPhoneDigits('01128440008'), '201128440008');
  assert.equal(normalizeWhatsAppPhoneDigits('٠١٠١٢٣٤٥٦٧٨'), '201012345678');
  assert.equal(normalizeWhatsAppPhoneDigits('+20 112 844 0008'), '201128440008');
  assert.equal(normalizeWhatsAppPhoneDigits('00966501234567'), '966501234567');
});

test('resolveOtpCompanyWhatsAppNumber always guarantees the official number ending in 0008', () => {
  assert.equal(resolveOtpCompanyWhatsAppNumber(undefined), OFFICIAL_COMPANY_WHATSAPP_NUMBER);
  assert.equal(resolveOtpCompanyWhatsAppNumber('01128440008'), '201128440008');
  assert.equal(resolveOtpCompanyWhatsAppNumber('201128440008'), '201128440008');
  // Even if an unrelated number is accidentally configured, fall back safely to official ...0008
  assert.equal(resolveOtpCompanyWhatsAppNumber('01099999999'), OFFICIAL_COMPANY_WHATSAPP_NUMBER);
});

test('buildClientOtpRequestUrl uses api.whatsapp.com/send, targets 0008, and includes exact Arabic prompt with client phone', () => {
  const url = buildClientOtpRequestUrl('201098765432', 'ar');
  const parsed = new URL(url);

  assert.equal(parsed.origin, 'https://api.whatsapp.com');
  assert.equal(parsed.pathname, '/send');
  assert.equal(parsed.searchParams.get('phone'), '201128440008');
  assert.equal(parsed.searchParams.get('phone')?.endsWith('0008'), true);
  assert.equal(url.includes('wa.me'), false);
  assert.equal(
    parsed.searchParams.get('text'),
    'مرحباً مسارك، أرجو إرسال كود تفعيل حسابي رقم: 01098765432'
  );
});

test('buildClientOtpRequestMessage supports international phones and English localization', () => {
  assert.equal(formatWhatsAppPhoneForMessage('966501234567'), '966501234567');
  assert.equal(
    buildClientOtpRequestMessage('01011112222', 'ar'),
    'مرحباً مسارك، أرجو إرسال كود تفعيل حسابي رقم: 01011112222'
  );
  assert.equal(
    buildClientOtpRequestMessage('01011112222', 'en'),
    'Hello Masarik, please send the activation code for my account number: 01011112222'
  );
});

test('buildWhatsAppSendUrl replaces wa.me with api.whatsapp.com/send for Admin and Customer Service links', () => {
  const adminUrl = buildWhatsAppSendUrl('01055556666', 'مرحباً عميلنا العزيز');
  const parsed = new URL(adminUrl);
  assert.equal(parsed.origin, 'https://api.whatsapp.com');
  assert.equal(parsed.pathname, '/send');
  assert.equal(parsed.searchParams.get('phone'), '201055556666');
  assert.equal(parsed.searchParams.get('text'), 'مرحباً عميلنا العزيز');
  assert.equal(adminUrl.includes('wa.me'), false);

  const plainUrl = buildWhatsAppSendUrl('201128440008');
  assert.equal(plainUrl, 'https://api.whatsapp.com/send?phone=201128440008');
});

test('New client defaults and isClientAccountVerified strictly block unverified entry', () => {
  const initialFields = createPendingVerificationClientFields();
  assert.equal(initialFields.verified, false);
  assert.equal(initialFields.accountStatus, 'pending_verification');
  assert.equal(initialFields.activatedByAdmin, false);
  assert.equal(initialFields.otpConsumed, false);

  assert.equal(isClientAccountVerified(null), false);
  assert.equal(isClientAccountVerified(initialFields), false);
  assert.equal(isClientAccountVerified({ verified: true, accountStatus: 'pending_verification' }), false);
  assert.equal(isClientAccountVerified({ verified: false, accountStatus: 'verified' }), false);
  assert.equal(isClientAccountVerified({ verified: true, accountStatus: 'verified' }), true);
});

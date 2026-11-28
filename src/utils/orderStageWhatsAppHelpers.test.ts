import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_STAGE_DEFINITIONS,
  buildStageWhatsAppMessage,
  findStageQuickReplyTemplate,
} from './orderStageWhatsAppHelpers';
import { ChatQuickReplyTemplate, TravelerProfile } from '../types/travel';

test('ORDER_STAGE_DEFINITIONS covers all major stages', () => {
  const statuses = ORDER_STAGE_DEFINITIONS.map((d) => d.status);
  assert.ok(statuses.includes('تم استلام الطلب'));
  assert.ok(statuses.includes('قيد المراجعة والتنفيذ'));
  assert.ok(statuses.includes('تم الحجز / الإصدار'));
  assert.ok(statuses.includes('تم تنفيذ الطلب'));
  assert.ok(statuses.includes('مكتمل'));
});

test('findStageQuickReplyTemplate finds by orderStatusTrigger or category title', () => {
  const mockTemplates: ChatQuickReplyTemplate[] = [
    {
      id: 'qr-custom-1',
      title: 'مرحلة خاصة بالتقديم',
      text: 'مرحبا {اسم_العميل} تم التقديم برقم {رقم_الطلب}',
      category: 'order_stages',
      orderStatusTrigger: 'تم استلام الطلب',
      createdAt: '2026-01-01',
    },
    {
      id: 'qr-custom-2',
      title: 'مرحلة تم الحجز / الإصدار',
      text: 'تم الحجز بنجاح {رقم_الطلب}',
      category: 'order_stages',
      createdAt: '2026-01-01',
    },
  ];

  const found1 = findStageQuickReplyTemplate(mockTemplates, 'تم استلام الطلب');
  assert.ok(found1);
  assert.equal(found1.id, 'qr-custom-1');

  const found2 = findStageQuickReplyTemplate(mockTemplates, 'تم الحجز / الإصدار');
  assert.ok(found2);
  assert.equal(found2.id, 'qr-custom-2');
});

test('buildStageWhatsAppMessage resolves placeholders from custom template', () => {
  const client: TravelerProfile = {
    phone: '201128440008',
    name: 'سارة خالد',
    orderCode: 'MSK-7710',
    preferredVisaType: 'تأشيرة سياحة السعودية',
    orderStatus: 'تم استلام الطلب',
    verified: true,
    otp: '1234',
    createdAt: '2026-01-01',
    documents: [],
  };

  const customTemplates: ChatQuickReplyTemplate[] = [
    {
      id: 'qr-test',
      title: 'تم التقديم',
      text: 'مرحباً أ/ {اسم_العميل} 🌸 طلبكم {رقم_الطلب} لخدمة {نوع_الخدمة} في مرحلة {المرحلة_الحالية}.',
      category: 'order_stages',
      orderStatusTrigger: 'تم استلام الطلب',
      createdAt: '2026-01-01',
    },
  ];

  const msg = buildStageWhatsAppMessage({
    client,
    stage: 'تم استلام الطلب',
    customTemplates,
    lang: 'ar',
  });

  assert.ok(msg.includes('سارة خالد'));
  assert.ok(msg.includes('MSK-7710'));
  assert.ok(msg.includes('تأشيرة سياحة السعودية'));
  assert.ok(msg.includes('تم استلام الطلب'));
});

test('buildStageWhatsAppMessage uses default stage text when no custom template exists', () => {
  const client: TravelerProfile = {
    phone: '201128440008',
    name: 'محمود عبد الله',
    orderCode: 'MSK-8822',
    preferredVisaType: 'تأشيرة عمرة',
    orderStatus: 'تم تنفيذ الطلب',
    verified: true,
    otp: '1234',
    createdAt: '2026-01-01',
    documents: [],
  };

  const msg = buildStageWhatsAppMessage({
    client,
    stage: 'تم تنفيذ الطلب',
    customTemplates: [],
    lang: 'ar',
  });

  assert.ok(msg.includes('محمود عبد الله'));
  assert.ok(msg.includes('MSK-8822'));
  assert.ok(msg.includes('تأشيرة عمرة'));
  assert.ok(msg.includes('جاهز وتم تنفيذه'));
});

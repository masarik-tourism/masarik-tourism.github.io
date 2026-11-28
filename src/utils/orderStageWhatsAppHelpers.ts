import { ChatQuickReplyTemplate, TravelerProfile, VisaOrderStatus } from '../types/travel';
import { translateOrderStatus } from '../data/travelData';
import { buildOrderCodeFromPhone, getTravelerDisplayNames, normalizePhone } from './travelerStore';
import { buildWhatsAppSendUrl, normalizeWhatsAppPhoneDigits } from './whatsappHelpers';
import { getQuickReplyTemplates, resolveQuickReplyTextPlaceholders } from './chatStore';
import { openWhatsApp } from './communication';

export const AUTO_WHATSAPP_STAGE_STORAGE_KEY = 'masarik_auto_whatsapp_on_stage_change_v1';

export interface StageTemplateDefinition {
  status: VisaOrderStatus;
  titleAr: string;
  titleEn: string;
  badgeLabelAr: string;
  defaultTextAr: string;
  defaultTextEn: string;
}

export const ORDER_STAGE_DEFINITIONS: StageTemplateDefinition[] = [
  {
    status: 'تم استلام الطلب',
    titleAr: 'مرحلة 1: تم التقديم واستلام الطلب',
    titleEn: 'Stage 1: Application Received',
    badgeLabelAr: 'تم التقديم',
    defaultTextAr:
      'السلام عليكم أ/ {اسم_العميل} 🌸\nتم استلام وتسجيل طلبكم رقم ({رقم_الطلب}) الخاص بخدمة ({نوع_الخدمة}) بنجاح لدى مسارك للإنجاز السياحي.\n• الحالة الحالية: تم التقديم واستلام الطلب والبدء في الإجراءات ✓\nجاري مراجعة الأوراق والبيانات لدى المختصين.',
    defaultTextEn:
      'Hello {clientName} 🌸\nYour application ({orderCode}) for ({serviceTitle}) has been received successfully by Masarik Tourism.\n• Current Stage: Application Received ✓\nOur team is currently reviewing your documents.',
  },
  {
    status: 'قيد المراجعة والتنفيذ',
    titleAr: 'مرحلة 2: قيد المراجعة والتنفيذ',
    titleEn: 'Stage 2: Under Review & Processing',
    badgeLabelAr: 'قيد التنفيذ',
    defaultTextAr:
      'أهلاً بك أ/ {اسم_العميل} 🌸\nيود فريق مسارك للإنجاز السياحي إبلاغكم بأن طلبكم رقم ({رقم_الطلب}) الخاص بخدمة ({نوع_الخدمة}) أصبح الآن: (قيد المراجعة والتنفيذ) لدى الجهات المختصة.\nملفكم قيد المتابعة الحثيثة وسنوافيكم بأي تحديث فوراً بإذن الله.',
    defaultTextEn:
      'Hello {clientName} 🌸\nMasarik Tourism team is pleased to update you that your order ({orderCode}) for ({serviceTitle}) is now: (Under Review & Processing).\nWe are actively processing your file.',
  },
  {
    status: 'تم الحجز / الإصدار',
    titleAr: 'مرحلة 3: تم الحجز / الإصدار',
    titleEn: 'Stage 3: Booked & Issued',
    badgeLabelAr: 'تم الحجز / الإصدار',
    defaultTextAr:
      'بشرى سارة أ/ {اسم_العميل} 🌸\nتم إنجاز مرحلة (تم الحجز / الإصدار) لطلبكم رقم ({رقم_الطلب}) بنجاح.\nيمكنكم الاطلاع على تفاصيل ومستندات الحجز المحدثة عبر محفظتكم في مسارك:\n{رابط_المنصة}',
    defaultTextEn:
      'Good news {clientName} 🌸\nThe booking & issuance stage for order ({orderCode}) is successfully completed.\nYou can review your updated documents inside your Masarik wallet:\n{portalUrl}',
  },
  {
    status: 'تم تنفيذ الطلب',
    titleAr: 'مرحلة 4: تأشيرة جاهزة / تم التنفيذ',
    titleEn: 'Stage 4: Visa Ready / Completed',
    badgeLabelAr: 'تأشيرة جاهزة / مكتمل',
    defaultTextAr:
      'تهانينا الحارة أ/ {اسم_العميل} 🎉\nتأشيرتكم / طلبكم رقم ({رقم_الطلب}) الخاص بخدمة ({نوع_الخدمة}) جاهز وتم تنفيذه بنجاح تام!\nتم إيداع المستندات ووثائق الإنجاز في محفظة حسابكم بمسارك:\n{رابط_المنصة}\nنتمنى لكم رحلة مباركة وموفقة بإذن الله.',
    defaultTextEn:
      'Congratulations {clientName} 🎉\nYour visa / order ({orderCode}) for ({serviceTitle}) is ready and successfully completed!\nAll documents have been delivered to your Masarik wallet:\n{portalUrl}\nWe wish you a blessed journey.',
  },
  {
    status: 'مكتمل',
    titleAr: 'مرحلة: الطلب مكتمل نهائياً',
    titleEn: 'Stage: Fully Completed',
    badgeLabelAr: 'مكتمل',
    defaultTextAr:
      'السلام عليكم أ/ {اسم_العميل}، تم اكتمال كافة متطلبات طلبكم رقم ({رقم_الطلب}) بنجاح تام. شرفنا بخدمتكم في مسارك للإنجاز السياحي ونتطلع دائماً لخدمتكم.',
    defaultTextEn:
      'Hello {clientName}, all requirements for order ({orderCode}) have been fully completed. Thank you for choosing Masarik Tourism.',
  },
  {
    status: 'تم حجز موعد تساهيل',
    titleAr: 'مرحلة: تم حجز موعد تساهيل (VFS)',
    titleEn: 'Stage: Tasheer VFS Booked',
    badgeLabelAr: 'موعد تساهيل',
    defaultTextAr:
      'أهلاً أ/ {اسم_العميل} 🌸\nتم حجز وتأكيد موعد تساهيل (VFS) لطلبكم رقم ({رقم_الطلب}) بنجاح.\nيمكنكم فتح بطاقة الموعد والباركود الذكي (QR Pass) مباشرة عبر حسابكم في مسارك:\n{رابط_المنصة}',
    defaultTextEn:
      'Hello {clientName} 🌸\nYour Tasheer (VFS) appointment for order ({orderCode}) is confirmed.\nAccess your Appointment QR Pass directly from your Masarik account:\n{portalUrl}',
  },
  {
    status: 'صدرت التأشيرة',
    titleAr: 'مرحلة: صدرت التأشيرة رسمياً',
    titleEn: 'Stage: Visa Officially Issued',
    badgeLabelAr: 'صدرت التأشيرة',
    defaultTextAr:
      'ألف مبروك أ/ {اسم_العميل} 🎉\nصدرت التأشيرة رسمياً لطلبكم رقم ({رقم_الطلب})!\nيمكنكم تحميل وثيقة التأشيرة الأصلية مباشرة من محفظتكم في مسارك:\n{رابط_المنصة}',
    defaultTextEn:
      'Congratulations {clientName} 🎉\nYour visa for order ({orderCode}) has been officially issued!\nDownload your official visa document inside your Masarik wallet:\n{portalUrl}',
  },
];

export function getAutoWhatsAppOnStageChange(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(AUTO_WHATSAPP_STAGE_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setAutoWhatsAppOnStageChange(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTO_WHATSAPP_STAGE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota
  }
}

export function findStageQuickReplyTemplate(
  templates: ChatQuickReplyTemplate[],
  status: VisaOrderStatus
): ChatQuickReplyTemplate | undefined {
  if (!Array.isArray(templates) || templates.length === 0) return undefined;

  // 1. Exact trigger match
  const exact = templates.find((t) => t.orderStatusTrigger === status);
  if (exact) return exact;

  // 2. Category order_stages with title or text containing status
  const matchedCat = templates.find(
    (t) =>
      t.category === 'order_stages' &&
      (t.title.includes(status) || t.text.includes(status))
  );
  if (matchedCat) return matchedCat;

  // 3. Fallback to any template titled with status
  return templates.find((t) => t.title.includes(status));
}

export function buildStageWhatsAppMessage(params: {
  client: TravelerProfile;
  stage: VisaOrderStatus;
  lang?: 'ar' | 'en';
  customTemplateText?: string;
  customTemplates?: ChatQuickReplyTemplate[];
  portalUrl?: string;
}): string {
  const {
    client,
    stage,
    lang = 'ar',
    customTemplateText,
    customTemplates,
    portalUrl = 'https://masarik-tourism.github.io/',
  } = params;

  const names = getTravelerDisplayNames(client);
  const displayName = client.passportFullName?.trim() || names.fullDisplayName || client.name;
  const orderCode = client.orderCode || buildOrderCodeFromPhone(client.phone);
  const serviceTitle = client.preferredVisaType?.trim() || 'خدمة تأشيرة سياحية';
  const stageLabel = translateOrderStatus(stage, lang);
  const phone = client.phoneNormalized || normalizePhone(client.phone);

  let rawTemplate = customTemplateText?.trim();

  if (!rawTemplate) {
    const allTemplates = customTemplates || getQuickReplyTemplates();
    const matched = findStageQuickReplyTemplate(allTemplates, stage);
    if (matched?.text?.trim()) {
      rawTemplate = matched.text.trim();
    }
  }

  if (!rawTemplate) {
    const stageDef = ORDER_STAGE_DEFINITIONS.find((d) => d.status === stage);
    if (stageDef) {
      rawTemplate = lang === 'en' ? stageDef.defaultTextEn : stageDef.defaultTextAr;
    }
  }

  if (!rawTemplate) {
    // Fallback standard message
    if (lang === 'en') {
      return `Hello ${displayName},\nMasarik Tourism team has updated your order (${orderCode})${
        serviceTitle ? ` for (${serviceTitle})` : ''
      } to: ${stageLabel}.\nTrack your order inside your Masarik wallet: ${portalUrl}`;
    }
    return `السلام عليكم أ/ ${displayName}،\nيود فريق مسارك للإنجاز السياحي إبلاغكم بتحديث حالة طلبكم رقم (${orderCode})${
      serviceTitle ? ` الخاص بخدمة (${serviceTitle})` : ''
    } إلى: ${stageLabel}.\nيمكنكم متابعة تفاصيل الطلب والمستندات عبر حسابكم في مسارك: ${portalUrl}`;
  }

  return resolveQuickReplyTextPlaceholders(rawTemplate, {
    clientName: displayName,
    orderCode,
    serviceTitle,
    stageLabel,
    portalUrl,
    phone,
  });
}

export function dispatchStageWhatsAppNotification(params: {
  client: TravelerProfile;
  stage: VisaOrderStatus;
  lang?: 'ar' | 'en';
  customTemplateText?: string;
  customTemplates?: ChatQuickReplyTemplate[];
  portalUrl?: string;
}): { sent: boolean; message: string; url: string } {
  const message = buildStageWhatsAppMessage(params);
  const phoneDigits =
    params.client.phoneNormalized || normalizeWhatsAppPhoneDigits(params.client.phone);
  const url = buildWhatsAppSendUrl(phoneDigits, message);
  openWhatsApp(url);
  return { sent: true, message, url };
}

import { TravelRepository } from '../data/travelData';
import { formatPhoneToDialHref, getSiteConfig } from './siteConfigStore';
import {
  OFFICIAL_COMPANY_WHATSAPP_NUMBER,
  buildWhatsAppSendUrl,
} from './whatsappHelpers';

// Unified Official Masarik Tourism WhatsApp Number (Customer Service, Orders & OTP Activation)
export const CUSTOMER_SERVICE_WHATSAPP_NUMBER = OFFICIAL_COMPANY_WHATSAPP_NUMBER;
export const CUSTOMER_SERVICE_PHONE_DISPLAY = '01128440008';

export { buildWhatsAppSendUrl };

export function openCustomerServiceWhatsApp(message?: string): void {
  const url = buildWhatsAppSendUrl(CUSTOMER_SERVICE_WHATSAPP_NUMBER, message);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openWhatsApp(urlOrMessage?: string): void {
  if (!urlOrMessage) {
    openCustomerServiceWhatsApp();
    return;
  }
  if (urlOrMessage.startsWith('http://') || urlOrMessage.startsWith('https://')) {
    window.open(urlOrMessage, '_blank', 'noopener,noreferrer');
  } else {
    openCustomerServiceWhatsApp(urlOrMessage);
  }
}

export function dialPhoneNumber(phoneNumber?: string): void {
  const target = phoneNumber || formatPhoneToDialHref(getSiteConfig().phoneNumber);
  window.location.href = `tel:${target}`;
}

export function launchEmail(
  email = TravelRepository.OFFICIAL_EMAIL,
  subject = '',
  body = ''
): void {
  const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
}

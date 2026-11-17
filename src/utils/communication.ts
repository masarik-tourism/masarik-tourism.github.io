import { TravelRepository } from '../data/travelData';
import { formatPhoneToDialHref, getSiteConfig } from './siteConfigStore';

// Official Customer Service & General Inquiries WhatsApp Number ONLY (OTP uses 201119227270 in travelerStore)
export const CUSTOMER_SERVICE_WHATSAPP_NUMBER = '201128440008';
export const CUSTOMER_SERVICE_PHONE_DISPLAY = '01128440008';

export function openCustomerServiceWhatsApp(message?: string): void {
  const baseWhatsappUrl = `https://wa.me/${CUSTOMER_SERVICE_WHATSAPP_NUMBER}`;
  if (!message) {
    window.open(baseWhatsappUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  const encoded = encodeURIComponent(message);
  window.open(`${baseWhatsappUrl}?text=${encoded}`, '_blank', 'noopener,noreferrer');
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

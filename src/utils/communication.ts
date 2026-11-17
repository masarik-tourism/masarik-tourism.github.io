import { TravelRepository } from '../data/travelData';
import {
  formatPhoneToDialHref,
  formatPhoneToWhatsAppDigits,
  getSiteConfig,
} from './siteConfigStore';

export function openWhatsApp(urlOrMessage?: string): void {
  const configuredDigits = formatPhoneToWhatsAppDigits(getSiteConfig().phoneNumber);
  const baseWhatsappUrl = `https://wa.me/${configuredDigits}`;

  if (!urlOrMessage) {
    window.open(baseWhatsappUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  if (urlOrMessage.startsWith('http://') || urlOrMessage.startsWith('https://')) {
    window.open(urlOrMessage, '_blank', 'noopener,noreferrer');
  } else {
    const encoded = encodeURIComponent(urlOrMessage);
    window.open(`${baseWhatsappUrl}?text=${encoded}`, '_blank', 'noopener,noreferrer');
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

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CalendarCheck2,
  Clock,
  Download,
  MapPin,
  QrCode,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { TravelerProfile } from '../types/travel';
import { TravelRepository, translateOrderStatus } from '../data/travelData';
import { buildOrderCodeFromPhone, getTravelerDisplayNames } from '../utils/travelerStore';
import { useLanguage } from '../contexts/LanguageContext';

interface AppointmentQrPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  traveler: TravelerProfile;
}

function formatReadableTime(rawTime: string, lang: 'ar' | 'en'): string {
  const trimmed = (rawTime || '').trim();
  if (!trimmed) return lang === 'en' ? 'As scheduled' : 'حسب الموعد المؤكد';

  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return trimmed;

  const hours24 = Number(match[1]);
  const mins = match[2];
  if (!Number.isFinite(hours24) || hours24 < 0 || hours24 > 23) return trimmed;

  const isPm = hours24 >= 12;
  const hours12 = hours24 % 12 || 12;
  if (lang === 'en') {
    return `${hours12}:${mins} ${isPm ? 'PM' : 'AM'}`;
  }
  return `${hours12}:${mins} ${isPm ? 'مساءً' : 'صباحاً'}`;
}

export const AppointmentQrPassModal: React.FC<AppointmentQrPassModalProps> = ({
  isOpen,
  onClose,
  traveler,
}) => {
  const { lang, dir, t } = useLanguage();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState(false);

  const names = getTravelerDisplayNames(traveler);
  const travelerName = traveler.passportFullName?.trim() || names.fullDisplayName || traveler.name;
  const passportNo = (traveler.passportNumber || '').trim() || t('غير مسجل', 'Not set');
  const orderCode = traveler.orderCode || buildOrderCodeFromPhone(traveler.phone);

  const appt = traveler.appointmentDetails;
  const serviceType =
    appt?.serviceType?.trim() ||
    traveler.preferredVisaType?.trim() ||
    traveler.issuedDocuments?.[0]?.docTypeLabel ||
    t('موعد خدمة معتمدة / تأشيرة', 'Certified Service / Appointment');

  const appointmentDate =
    appt?.appointmentDate?.trim() || t('مؤكد — راجع تفاصيل المستند', 'Confirmed — Check Ticket/Slip');
  const appointmentTime = appt?.appointmentTime?.trim()
    ? formatReadableTime(appt.appointmentTime, lang)
    : t('حسب التوقيت المعتمد', 'As Scheduled');
  const location = appt?.location?.trim() || '';
  const referenceNo = appt?.referenceNumber?.trim() || orderCode;

  const qrPayload = [
    `MASARIK TOURISM LLC (CR ${TravelRepository.COMMERCIAL_RECORD})`,
    `ORDER: ${orderCode}`,
    `SERVICE: ${serviceType}`,
    `NAME: ${travelerName}`,
    `PASSPORT: ${passportNo}`,
    `DATE: ${appt?.appointmentDate?.trim() || 'CONFIRMED'}`,
    `TIME: ${appt?.appointmentTime?.trim() || 'SCHEDULED'}`,
    location ? `LOCATION: ${location}` : null,
    `REF: ${referenceNo}`,
  ]
    .filter(Boolean)
    .join('\n');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setQrError(false);
    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 520,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrError(true);
      });

    return () => {
      active = false;
    };
  }, [isOpen, qrPayload]);

  if (!isOpen) return null;

  const handleDownloadQrImage = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `Masarik_Pass_${orderCode}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 150);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border-2 border-[#0F2438] my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        {/* High-Contrast Pass Top Header */}
        <div className="bg-[#0A1926] text-white px-5 py-4 flex items-center justify-between gap-3 border-b-2 border-[#C6A052]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#C6A052] text-[#0A1926] flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 stroke-[2.25]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate">
                {t('بطاقة باركود الموعد السريع', 'Appointment QR Pass')}
              </h3>
              <p className="text-[11px] text-[#E5C887] font-bold truncate">
                {t('مسارك للإنجاز السياحي • س.ت 7839', 'Masarik Tourism LLC • CR 7839')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 cursor-pointer transition"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* High-Contrast Ticket Body */}
        <div className="p-5 space-y-4 bg-white text-[#0A1926]">
          {/* Service Headline + Order Code */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b-2 border-dashed border-slate-300">
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-500 block">
                {t('نوع الخدمة / الموعد', 'Service / Appointment Type')}
              </span>
              <h4 className="text-base sm:text-lg font-black text-[#0A1926] leading-snug">
                {serviceType}
              </h4>
            </div>
            <div className="text-end shrink-0">
              <span className="text-[10.5px] font-bold text-slate-500 block">
                {t('رقم الطلب', 'Order Ref')}
              </span>
              <span
                className="font-mono text-xs sm:text-sm font-black text-[#0F2438] bg-[#FAF8F2] border border-[#C6A052] px-2 py-0.5 rounded-lg inline-block tabular-nums"
                dir="ltr"
              >
                {orderCode}
              </span>
            </div>
          </div>

          {/* Traveler Name & Passport No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-300 rounded-2xl p-3">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-[#0F2438]" />
                <span>{t('اسم المسافر', 'Traveler Name')}</span>
              </span>
              <strong className="block text-sm font-black text-[#0A1926] mt-0.5 break-words">
                {travelerName}
              </strong>
            </div>

            <div className="bg-slate-50 border border-slate-300 rounded-2xl p-3">
              <span className="text-[11px] font-bold text-slate-600 block">
                {t('رقم جواز السفر', 'Passport Number')}
              </span>
              <strong
                className="block font-mono text-sm sm:text-base font-black text-[#0A1926] mt-0.5 tabular-nums uppercase tracking-wider"
                dir="ltr"
              >
                {passportNo}
              </strong>
            </div>
          </div>

          {/* Appointment Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#FAF8F2] border-2 border-[#C6A052] rounded-2xl p-3">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <CalendarCheck2 className="w-3.5 h-3.5 text-[#0F2438]" />
                <span>{t('تاريخ الموعد', 'Date')}</span>
              </span>
              <strong
                className="block text-sm sm:text-base font-black text-[#0A1926] mt-0.5 tabular-nums"
                dir="ltr"
              >
                {appointmentDate}
              </strong>
            </div>

            <div className="bg-[#FAF8F2] border-2 border-[#C6A052] rounded-2xl p-3">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#0F2438]" />
                <span>{t('وقت الموعد', 'Time')}</span>
              </span>
              <strong className="block text-sm sm:text-base font-black text-[#0A1926] mt-0.5 tabular-nums">
                {appointmentTime}
              </strong>
            </div>
          </div>

          {(location || referenceNo) && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              {location && (
                <span className="flex items-center gap-1 font-bold">
                  <MapPin className="w-3.5 h-3.5 text-[#0F2438] shrink-0" />
                  <span>{location}</span>
                </span>
              )}
              <span className="font-mono font-bold tabular-nums" dir="ltr">
                {t('مرجع:', 'Ref:')} {referenceNo}
              </span>
            </div>
          )}

          {/* Crisp High-Contrast QR Code Stage */}
          <div className="border-2 border-[#0A1926] rounded-2xl p-4 bg-white flex flex-col items-center justify-center text-center space-y-2.5">
            {qrDataUrl && !qrError ? (
              <img
                src={qrDataUrl}
                alt={`QR Code ${orderCode}`}
                className="w-48 h-48 sm:w-52 sm:h-52 object-contain select-none"
              />
            ) : (
              <div className="w-48 h-48 bg-slate-100 rounded-xl flex items-center justify-center text-xs font-bold text-slate-600">
                {qrError
                  ? t('تعذر توليد رمز QR', 'Could not generate QR')
                  : t('جاري تجهيز الباركود...', 'Generating QR...')}
              </div>
            )}

            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-1.5 text-xs font-black text-[#0A1926]">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{translateOrderStatus(traveler.orderStatus, lang)}</span>
              </div>
              <p className="text-[11px] font-bold text-slate-600">
                {t(
                  'اعرض هذه البطاقة مباشرة من شاشة هاتفك عند بوابة الدخول أو المراجعة',
                  'Present this high-contrast QR pass directly from your phone screen upon arrival'
                )}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {qrDataUrl && (
              <button
                type="button"
                onClick={handleDownloadQrImage}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <Download className="w-4 h-4" />
                <span>{t('حفظ صورة الباركود (PNG)', 'Save QR Image (PNG)')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-xs font-black cursor-pointer transition"
            >
              {t('إغلاق', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

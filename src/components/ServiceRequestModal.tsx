import React, { useState, useEffect } from 'react';
import { X, Phone, CheckCircle2, ShieldCheck } from 'lucide-react';
import { getLocalizedTravelContent } from '../data/travelData';
import { dialPhoneNumber, openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface ServiceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialServiceTitle?: string;
}

export const ServiceRequestModal: React.FC<ServiceRequestModalProps> = ({
  isOpen,
  onClose,
  initialServiceTitle,
}) => {
  const { lang, dir, t } = useLanguage();
  const localized = getLocalizedTravelContent(lang);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedService, setSelectedService] = useState(
    initialServiceTitle || localized.services[0].title
  );
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (initialServiceTitle) {
      setSelectedService(initialServiceTitle);
    } else {
      setSelectedService(localized.services[0].title);
    }
  }, [initialServiceTitle, lang]);

  if (!isOpen) return null;

  const handleSubmitWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    const message =
      lang === 'en'
        ? `Hello Masarik Tourism LLC,
I would like to request a service:
📌 *Service:* ${selectedService}
👤 *Full Name:* ${fullName.trim() || 'Client'}
📱 *Phone / WhatsApp:* ${phone.trim() || 'N/A'}
${notes.trim() ? `📝 *Notes:* ${notes.trim()}` : ''}
Please share requirements and next steps. Thank you.`
        : `السلام عليكم ورحمة الله وبركاته،
أرغب في طلب خدمة من منصة مسارك للإنجاز السياحي:
📌 *الخدمة المطلوبة:* ${selectedService}
👤 *الاسم:* ${fullName.trim() || 'عميل مسارك'}
📱 *رقم الهاتف:* ${phone.trim() || 'غير محدد'}
${notes.trim() ? `📝 *تفاصيل إضافية:* ${notes.trim()}` : ''}
يرجى تزويدي بالمتطلبات والتفاصيل وسرعة المتابعة. شكراً لكم.`;

    openWhatsApp(message);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden text-start"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        {/* Modal Header */}
        <div className="bg-[#0F2438] text-white p-5 flex items-center justify-between border-b-2 border-[#C6A052]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#E5C887]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {t('طلب خدمة فورية معتمدة', 'Request Certified Service')}
              </h3>
              <p className="text-xs text-slate-300">
                {t('مسارك للإنجاز السياحي • س.ت: ٧٨٣٩', 'Masarik Tourism LLC • CR: 7839')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-[#0F2438]">
              {t('تم تحويل طلبك للواتساب بنجاح!', 'Request Redirected to WhatsApp!')}
            </h4>
            <p className="text-sm text-slate-600">
              {t(
                'يقوم فريق خدمة عملاء مسارك بمراجعة بياناتك والتواصل معك فوراً لتأكيد طلبك.',
                'Our support team will review your details and contact you right away.'
              )}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmitWhatsApp} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                {t('الخدمة المطلوبة', 'Requested Service')} <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs md:text-sm text-[#0F2438] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
              >
                {localized.services.map((s) => (
                  <option key={s.id} value={s.title}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('الاسم بالكامل', 'Full Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('مثال: محمد أحمد', 'e.g. Mohamed Ahmed')}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs md:text-sm text-[#0F2438] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('رقم الهاتف أو الواتساب', 'Phone / WhatsApp')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01000000000"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs md:text-sm text-[#0F2438] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                {t('ملاحظات أو تفاصيل إضافية (اختياري)', 'Notes or Additional Details (Optional)')}
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t(
                  'تاريخ السفر، عدد الأفراد، نوع التأشيرة أو المدينة...',
                  'Travel date, number of travelers, visa type or destination...'
                )}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs md:text-sm text-[#0F2438] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition resize-none"
              />
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="submit"
                className="w-full sm:flex-1 py-3 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer"
              >
                <WhatsAppIcon className="w-4.5 h-4.5" variant="white" />
                <span>{t('إرسال الطلب عبر واتساب (مباشر)', 'Send Request via WhatsApp')}</span>
              </button>
              <button
                type="button"
                onClick={() => dialPhoneNumber()}
                className="w-full sm:w-auto py-3 px-4 bg-slate-100 hover:bg-slate-200 text-[#0F2438] rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
              >
                <Phone className="w-4 h-4 text-[#0F2438]" />
                <span>{t('اتصال فوري', 'Call Now')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

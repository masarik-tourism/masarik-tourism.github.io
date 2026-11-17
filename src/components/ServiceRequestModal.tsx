import React, { useState, useEffect } from 'react';
import { X, Phone, CheckCircle2, ShieldCheck, Users, Check } from 'lucide-react';
import { getLocalizedTravelContent } from '../data/travelData';
import { dialPhoneNumber, openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';
import {
  TRAVELERS_UPDATED_EVENT,
  formatPhoneForDisplay,
  formatTravelersOrderSummary,
  getActiveTraveler,
  getRelationshipLabel,
  getTravelerDisplayNames,
} from '../utils/travelerStore';
import { TravelerProfile } from '../types/travel';

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
  const [activeTraveler, setActiveTraveler] = useState<TravelerProfile | null>(() =>
    getActiveTraveler()
  );
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedService, setSelectedService] = useState(
    initialServiceTitle || localized.services[0].title
  );
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>(['owner']);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const sync = () => setActiveTraveler(getActiveTraveler());
    window.addEventListener(TRAVELERS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TRAVELERS_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (initialServiceTitle) {
      setSelectedService(initialServiceTitle);
    } else {
      setSelectedService(localized.services[0].title);
    }
  }, [initialServiceTitle, lang]);

  useEffect(() => {
    if (isOpen && activeTraveler) {
      const names = getTravelerDisplayNames(activeTraveler);
      setFullName((prev) => prev.trim() || names.fullDisplayName);
      setPhone((prev) => prev.trim() || formatPhoneForDisplay(activeTraveler.phone));
      setSelectedTravelerIds((prev) => (prev.length > 0 ? prev : ['owner']));
    }
  }, [isOpen, activeTraveler]);

  if (!isOpen) return null;

  const toggleTravelerId = (id: string) => {
    setSelectedTravelerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmitWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    const travelersBlock = activeTraveler
      ? formatTravelersOrderSummary(activeTraveler, selectedTravelerIds, lang)
      : '';

    const message =
      lang === 'en'
        ? `Hello Masarik Tourism LLC,
I would like to request a service:
• Service: ${selectedService}
• Full Name: ${fullName.trim() || 'Client'}
• Phone / WhatsApp: ${phone.trim() || 'N/A'}${
            travelersBlock ? `\n\nSelected Traveler(s) & Cloud Documents:\n${travelersBlock}` : ''
          }${notes.trim() ? `\n• Notes: ${notes.trim()}` : ''}
Please share requirements and next steps. Thank you.`
        : `السلام عليكم ورحمة الله وبركاته،
أرغب في طلب خدمة من منصة مسارك للإنجاز السياحي:
• الخدمة المطلوبة: ${selectedService}
• الاسم: ${fullName.trim() || 'عميل مسارك'}
• رقم الهاتف: ${phone.trim() || 'غير محدد'}${
            travelersBlock ? `\n\nالمسافرون المشمولون بالطلب ومستنداتهم السحابية:\n${travelersBlock}` : ''
          }${notes.trim() ? `\n• تفاصيل إضافية: ${notes.trim()}` : ''}
يرجى تزويدي بالمتطلبات والتفاصيل وسرعة المتابعة. شكراً لكم.`;

    openWhatsApp(message);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2500);
  };

  const ownerNames = activeTraveler ? getTravelerDisplayNames(activeTraveler) : null;
  const familyMembers = activeTraveler?.familyMembers || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] border border-slate-200 shadow-2xl overflow-hidden text-start flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        {/* Modal Header */}
        <div className="bg-[#0F2438] text-white p-5 flex items-center justify-between border-b-2 border-[#C6A052] shrink-0">
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

        <div className="overflow-y-auto flex-1">
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

              {/* Logged-in Account Holder + Family Members Multi-Selector */}
              {activeTraveler && (
                <div className="bg-[#FAF8F2] border border-[#E5C887] rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#0F2438]">
                      <Users className="w-4 h-4 text-[#9E7B33]" />
                      <span>
                        {t('اختيار المسافرين المشمولين بالطلب', 'Select Traveler(s) for This Request')}
                      </span>
                    </div>
                    <span className="text-[10.5px] font-bold text-[#9E7B33] tabular-nums">
                      {t(`محدد: ${selectedTravelerIds.length}`, `Selected: ${selectedTravelerIds.length}`)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {/* Account Holder Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleTravelerId('owner')}
                      className={`w-full p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition cursor-pointer text-start ${
                        selectedTravelerIds.includes('owner')
                          ? 'bg-white border-[#0F2438] ring-1 ring-[#C6A052]'
                          : 'bg-white/60 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {activeTraveler.avatarUrl ? (
                          <img
                            src={activeTraveler.avatarUrl}
                            alt={ownerNames?.fullDisplayName}
                            className="w-9 h-9 rounded-full object-cover border border-[#C6A052] shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#0F2438] text-[#E5C887] flex items-center justify-center text-xs font-black shrink-0">
                            {ownerNames?.fullDisplayName.slice(0, 1) || 'م'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-[#0F2438] truncate">
                              {ownerNames?.fullDisplayName}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#0F2438] text-[#E5C887] text-[10px] font-bold shrink-0">
                              {t('صاحب الحساب نفسه', 'Account Holder')}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-slate-500 block tabular-nums uppercase">
                            {t('الجواز:', 'Passport:')}{' '}
                            {activeTraveler.passportNumber || t('غير مسجل', 'Not set')}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          selectedTravelerIds.includes('owner')
                            ? 'bg-[#0F2438] border-[#0F2438] text-[#E5C887]'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        {selectedTravelerIds.includes('owner') && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </button>

                    {/* Family Members Toggles */}
                    {familyMembers.map((member) => {
                      const isChecked = selectedTravelerIds.includes(member.id);
                      const mName = `${member.firstName} ${member.lastName}`.trim();
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleTravelerId(member.id)}
                          className={`w-full p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition cursor-pointer text-start ${
                            isChecked
                              ? 'bg-white border-[#0F2438] ring-1 ring-[#C6A052]'
                              : 'bg-white/60 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {member.personalPhotoUrl ? (
                              <img
                                src={member.personalPhotoUrl}
                                alt={mName}
                                className="w-9 h-9 rounded-full object-cover border border-[#C6A052] shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-200 text-[#0F2438] flex items-center justify-center text-xs font-black shrink-0">
                                {mName.slice(0, 1) || 'ع'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-[#0F2438] truncate">
                                  {mName}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-[#C6A052]/20 text-[#0F2438] text-[10px] font-bold shrink-0">
                                  {getRelationshipLabel(member.relationship, lang)}
                                </span>
                              </div>
                              <span className="text-[10.5px] text-slate-500 block tabular-nums uppercase">
                                {t('الجواز:', 'Passport:')} {member.passportNumber}
                              </span>
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              isChecked
                                ? 'bg-[#0F2438] border-[#0F2438] text-[#E5C887]'
                                : 'bg-white border-slate-300'
                            }`}
                          >
                            {isChecked && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
    </div>
  );
};

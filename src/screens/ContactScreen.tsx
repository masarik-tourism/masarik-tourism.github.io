import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Mail,
  Phone,
  MessageCircle,
  Send,
  CheckCircle,
  AlertCircle,
  MapPin,
  Clock,
  Loader2,
  Users,
  Check,
} from 'lucide-react';
import { TravelRepository, getLocalizedTravelContent } from '../data/travelData';
import { dialPhoneNumber, openWhatsApp, launchEmail } from '../utils/communication';
import { FacebookIcon } from '../components/FacebookIcon';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { useSiteConfig } from '../utils/siteConfigStore';
import {
  TRAVELERS_UPDATED_EVENT,
  formatPhoneForDisplay,
  formatTravelersOrderSummary,
  getActiveTraveler,
  getRelationshipLabel,
  getTravelerDisplayNames,
} from '../utils/travelerStore';
import { TravelerProfile } from '../types/travel';

interface ContactScreenProps {
  initialService?: string | null;
}

export const ContactScreen: React.FC<ContactScreenProps> = ({ initialService }) => {
  const { lang, dir, t } = useLanguage();
  const siteConfig = useSiteConfig();
  const localized = getLocalizedTravelContent(lang);

  const serviceOptions =
    lang === 'en'
      ? [
          'VFS Tasheer Biometric Appointments',
          'Tourist & Visit Visa File Preparation',
          'Confirmed Flight Ticket Reservations',
          'Passport Issuance & Official Records Guidance',
          'Document Attestation & Certified Translation',
          'Enjaz Platform Payments & Medical Insurance',
          'General Inquiry or Existing Application Follow-Up',
        ]
      : [
          'حجز مواعيد تساهيل و VFS Tasheer',
          'استخراج وتجهيز ملفات التأشيرات السياحية',
          'حجز الطيران وتذاكر السفر المؤكدة',
          'استخراج جوازات السفر والمستخرجات الرسمية',
          'تصديق الأوراق وترجمة الوثائق المعتمدة',
          'خدمات منصة إنجاز ودفع الرسوم والتأمين الطبي',
          'استفسار عام أو متابعة معاملة سابقة',
        ];

  const [activeTraveler, setActiveTraveler] = useState<TravelerProfile | null>(() =>
    getActiveTraveler()
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedService, setSelectedService] = useState(
    initialService || serviceOptions[0]
  );
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>(['owner']);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setActiveTraveler(getActiveTraveler());
    window.addEventListener(TRAVELERS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TRAVELERS_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (activeTraveler) {
      const names = getTravelerDisplayNames(activeTraveler);
      setName((prev) => prev.trim() || names.fullDisplayName);
      setPhone((prev) => prev.trim() || formatPhoneForDisplay(activeTraveler.phone));
    }
  }, [activeTraveler]);

  useEffect(() => {
    if (initialService) {
      const match = serviceOptions.find(
        (opt) => opt.includes(initialService) || initialService.includes(opt)
      );
      setSelectedService(match || initialService);
    } else {
      setSelectedService(serviceOptions[0]);
    }
  }, [initialService, lang]);

  const toggleTravelerId = (id: string) => {
    setSelectedTravelerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !phone.trim() || !email.trim()) {
      setValidationError(
        t(
          'يرجى ملء الاسم ورقم الهاتف والبريد الإلكتروني لإتمام الإرسال.',
          'Please fill in your full name, phone number, and email address.'
        )
      );
      return;
    }
    setValidationError(null);
    setIsSending(true);

    const now = new Date();
    const formattedDate = now.toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG');
    const subject =
      lang === 'en'
        ? `New Service Request from Masarik Tourism (CR: ${TravelRepository.COMMERCIAL_RECORD}): ${selectedService}`
        : `طلب جديد من مسارك للإنجاز السياحي (س.ت: ${TravelRepository.COMMERCIAL_RECORD}): ${selectedService}`;
    const travelersBlock = activeTraveler
      ? formatTravelersOrderSummary(activeTraveler, selectedTravelerIds, lang)
      : '';
    const bodyText = `
• Client Name: ${name}
• Client Email: ${email}
• Phone / WhatsApp: ${phone}
• Requested Service: ${selectedService}${
      travelersBlock ? `\n• Selected Traveler(s) & Documents:\n${travelersBlock}` : ''
    }
• Message / Notes:
${message.trim() ? message.trim() : 'No additional notes'}
--------------------------------------------------
CR: ${TravelRepository.COMMERCIAL_RECORD}
Timestamp: ${formattedDate}
Official Email: ${TravelRepository.OFFICIAL_EMAIL}
    `.trim();

    try {
      const response = await fetch(
        `https://formsubmit.co/ajax/${TravelRepository.OFFICIAL_EMAIL}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            service: selectedService,
            message: bodyText,
            _subject: subject,
            _replyto: email.trim(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Network error');
      }
    } catch {
      launchEmail(TravelRepository.OFFICIAL_EMAIL, subject, bodyText);
    } finally {
      setIsSending(false);
      setShowSuccessDialog(true);
    }
  };

  const handleWhatsAppForward = () => {
    const travelersBlock = activeTraveler
      ? formatTravelersOrderSummary(activeTraveler, selectedTravelerIds, lang)
      : '';
    const msg =
      lang === 'en'
        ? `Hello ${localized.companyName} (CR: ${TravelRepository.COMMERCIAL_RECORD}):\n• Name: ${
            name.trim() || 'Client'
          }\n• Email: ${email.trim() || 'N/A'}\n• Phone: ${
            phone.trim() || 'N/A'
          }\n• Service: ${selectedService}${
            travelersBlock ? `\n\nSelected Traveler(s) & Cloud Documents:\n${travelersBlock}` : ''
          }\n• Details: ${message.trim() || 'None'}`
        : `السلام عليكم، أود حجز خدمة من مكتب ${TravelRepository.COMPANY_NAME_AR} (س.ت: ${
            TravelRepository.COMMERCIAL_RECORD
          }):\n• الاسم: ${name.trim() || 'عميل'}\n• الإيميل: ${
            email.trim() || 'غير محدد'
          }\n• الهاتف: ${phone.trim() || 'غير محدد'}\n• الخدمة: ${selectedService}${
            travelersBlock ? `\n\nالمسافرون المشمولون بالطلب ومستنداتهم السحابية:\n${travelersBlock}` : ''
          }\n• تفاصيل: ${message.trim() || 'لا توجد'}`;
    openWhatsApp(msg);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24 md:pb-16 pt-5">
      <div className="max-w-4xl mx-auto px-4 space-y-5">
        <div className="bg-[#FBF7EE] border border-[#E5C887] rounded-xl p-3.5 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-[#9E7B33] shrink-0" />
          <div>
            <h2 className="text-xs md:text-sm font-black text-[#9E7B33]">
              {localized.certificationTitle}
            </h2>
            <p className="text-[11px] md:text-xs font-bold text-[#0F2437]">
              {localized.commercialRecordStatement}
            </p>
          </div>
        </div>

        <div className="bg-[#FAF8F2] border-2 border-[#E5C887] rounded-2xl p-5 shadow-sm space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C6A052]/20 text-[#9E7B33] flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-black text-[#0F2437]">
                {t('تواصل ومراسلة مباشرة للإيميل', 'Direct Official Email Contact')}
              </h2>
              <p className="text-[11px] md:text-xs text-[#324D61]">
                {t(
                  'يتم إرسال كافة البيانات فوراً إلى بريد المكتب الرسمي:',
                  'All requests are delivered directly to our official company email:'
                )}
              </p>
            </div>
          </div>
          <div
            dir="ltr"
            className="bg-white border border-[#E2DAC8] rounded-xl px-3.5 py-2 text-xs md:text-sm font-bold text-[#2A7688] font-mono text-center md:text-start"
          >
            {TravelRepository.OFFICIAL_EMAIL}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            onClick={() => openWhatsApp()}
            className="bg-[#25D366] hover:bg-[#128C7E] text-white py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer"
          >
            <WhatsAppIcon className="w-4 h-4" variant="white" />
            <span>{t('واتساب فوري', 'Instant WhatsApp')}</span>
          </button>
          <a
            href={TravelRepository.FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#1877F2] hover:bg-[#166fe5] text-white py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] text-center"
          >
            <FacebookIcon className="w-4 h-4 fill-white" />
            <span>{t('صفحة فيسبوك', 'Facebook Page')}</span>
          </a>
          <button
            onClick={() => dialPhoneNumber()}
            className="bg-[#17344F] hover:bg-[#0F2437] text-white py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span>{t('اتصال هاتفياً', 'Call Directly')}</span>
          </button>
        </div>

        <div className="bg-white border border-[#E2DAC8] rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base md:text-lg font-bold text-[#17344F]">
              {t('نموذج إرسال الطلب وحجز الخدمة', 'Service Inquiry & Booking Form')}
            </h2>
            <p className="text-xs text-[#678093] mt-0.5">
              {t(
                `اكتب بياناتك وسيتم إرسالها فوراً لبريد ${TravelRepository.OFFICIAL_EMAIL}`,
                `Enter your details to send directly to ${TravelRepository.OFFICIAL_EMAIL}`
              )}
            </p>
          </div>

          {validationError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-xs font-bold text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-[#0F2437] mb-1">
                {t('الاسم بالكامل *', 'Full Name *')}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('مثال: أحمد محمد علي', 'e.g. Ahmed Mohamed Ali')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2DAC8] focus:border-[#2A7688] focus:ring-1 focus:ring-[#2A7688] outline-none text-xs md:text-sm bg-[#FAF8F2] font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2437] mb-1">
                {t('بريدك الإلكتروني (لإرسال الرد والتأكيد) *', 'Your Email (For Reply & Confirmation) *')}
              </label>
              <input
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2DAC8] focus:border-[#2A7688] focus:ring-1 focus:ring-[#2A7688] outline-none text-xs md:text-sm bg-[#FAF8F2] font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2437] mb-1">
                {t('رقم الهاتف / الواتساب *', 'Phone / WhatsApp Number *')}
              </label>
              <input
                type="tel"
                required
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={siteConfig.phoneNumber}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2DAC8] focus:border-[#2A7688] focus:ring-1 focus:ring-[#2A7688] outline-none text-xs md:text-sm bg-[#FAF8F2] font-medium tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2437] mb-1">
                {t('نوع الخدمة المراد إنجازها:', 'Required Service:')}
              </label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2DAC8] focus:border-[#2A7688] focus:ring-1 focus:ring-[#2A7688] outline-none text-xs md:text-sm bg-[#FAF8F2] font-bold text-[#0F2437]"
              >
                {serviceOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {activeTraveler && (
              <div className="bg-[#FAF8F2] border border-[#E5C887] rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#0F2437]">
                    <Users className="w-4 h-4 text-[#9E7B33]" />
                    <span>
                      {t('اختيار المسافرين المشمولين بالطلب', 'Select Traveler(s) for This Request')}
                    </span>
                  </div>
                  <span className="text-[10.5px] font-bold text-[#9E7B33] tabular-nums">
                    {t(`محدد: ${selectedTravelerIds.length}`, `Selected: ${selectedTravelerIds.length}`)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Account Holder */}
                  <button
                    type="button"
                    onClick={() => toggleTravelerId('owner')}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition cursor-pointer text-start ${
                      selectedTravelerIds.includes('owner')
                        ? 'bg-white border-[#0F2437] ring-1 ring-[#C6A052]'
                        : 'bg-white/60 border-[#E2DAC8] hover:border-[#C6A052]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {activeTraveler.avatarUrl ? (
                        <img
                          src={activeTraveler.avatarUrl}
                          alt={getTravelerDisplayNames(activeTraveler).fullDisplayName}
                          loading="lazy"
                          decoding="async"
                          className="w-9 h-9 rounded-full object-cover border border-[#C6A052] shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#17344F] text-[#E5C887] flex items-center justify-center text-xs font-black shrink-0">
                          {getTravelerDisplayNames(activeTraveler).fullDisplayName.slice(0, 1) || 'م'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-xs font-black text-[#0F2437] block truncate">
                          {getTravelerDisplayNames(activeTraveler).fullDisplayName}
                        </span>
                        <span className="text-[10px] font-bold text-[#9E7B33] block">
                          {t('صاحب الحساب نفسه', 'Account Holder')} ·{' '}
                          {activeTraveler.passportNumber || t('بدون جواز', 'No Passport')}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        selectedTravelerIds.includes('owner')
                          ? 'bg-[#0F2437] border-[#0F2437] text-[#E5C887]'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      {selectedTravelerIds.includes('owner') && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </button>

                  {/* Family Members */}
                  {(activeTraveler.familyMembers || []).map((member) => {
                    const checked = selectedTravelerIds.includes(member.id);
                    const mName = `${member.firstName} ${member.lastName}`.trim();
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleTravelerId(member.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition cursor-pointer text-start ${
                          checked
                            ? 'bg-white border-[#0F2437] ring-1 ring-[#C6A052]'
                            : 'bg-white/60 border-[#E2DAC8] hover:border-[#C6A052]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {member.personalPhotoUrl ? (
                            <img
                              src={member.personalPhotoUrl}
                              alt={mName}
                              loading="lazy"
                              decoding="async"
                              className="w-9 h-9 rounded-full object-cover border border-[#C6A052] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-slate-200 text-[#0F2437] flex items-center justify-center text-xs font-black shrink-0">
                              {mName.slice(0, 1) || 'ع'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-black text-[#0F2437] block truncate">
                              {mName}
                            </span>
                            <span className="text-[10px] font-bold text-slate-600 block tabular-nums">
                              {getRelationshipLabel(member.relationship, lang)} ·{' '}
                              {member.passportNumber}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-[#0F2437] border-[#0F2437] text-[#E5C887]'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#0F2437] mb-1">
                {t('تفاصيل الرسالة أو الاستفسار أو الموعد:', 'Message, Inquiry, or Preferred Date:')}
              </label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t(
                  'اكتب أي بيانات إضافية تخص التأشيرة أو عدد المسافرين أو الموعد المرغوب...',
                  'Share any extra details about visa type, number of travelers, or preferred appointment date...'
                )}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2DAC8] focus:border-[#2A7688] focus:ring-1 focus:ring-[#2A7688] outline-none text-xs md:text-sm bg-[#FAF8F2] font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full bg-[#17344F] hover:bg-[#0F2437] text-white py-3 px-4 rounded-xl text-xs md:text-sm font-bold shadow-md transition active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('جارٍ إرسال الإيميل...', 'Sending Email...')}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{t('إرسال الطلب عبر الإيميل', 'Submit Request via Email')}</span>
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={handleWhatsAppForward}
            className="w-full bg-transparent hover:bg-green-50 text-[#128C7E] border-2 border-[#25D366] py-2.5 px-4 rounded-xl text-xs md:text-sm font-bold transition active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 text-[#25D366]" />
            <span>{t('إرسال نسخة عبر الواتساب فوراً', 'Send a Copy via WhatsApp')}</span>
          </button>
        </div>

        <div className="bg-[#FAF8F2] border border-[#E2DAC8] rounded-xl p-4 space-y-2.5 text-xs md:text-sm">
          <h3 className="font-bold text-[#0F2437]">
            {t(`بيانات اعتماد ومقر ${TravelRepository.COMPANY_NAME_AR}`, `${localized.companyName} Credentials & Address`)}
          </h3>
          <div className="space-y-1.5 text-[#324D61]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C6A052] shrink-0" />
              <span>{localized.commercialRecordStatement}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#2A7688] shrink-0" />
              <span>
                {t('المقر الرئيسي:', 'Headquarters:')} {localized.address}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[#678093]">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'en' ? siteConfig.workingHoursEn : siteConfig.workingHoursAr} •{' '}
                {localized.experienceText}
              </span>
            </div>
          </div>
        </div>
      </div>

      {showSuccessDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E2DAC8] text-start space-y-4"
            dir={dir}
          >
            <div className="flex items-center gap-2.5 text-green-700">
              <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
              <h3 className="text-base font-bold">
                {t('تم إرسال الطلب بنجاح!', 'Request Sent Successfully!')}
              </h3>
            </div>

            <p className="text-xs text-[#324D61] leading-relaxed">
              {t('شكراً لك يا', 'Thank you,')}{' '}
              <span className="font-bold text-[#0F2437]">{name}</span>.{' '}
              {t(
                'تم إرسال رسالتك وتفاصيل طلبك بنجاح إلى البريد الإلكتروني الرسمي:',
                'Your inquiry details have been sent to our official email:'
              )}
            </p>

            <div
              dir="ltr"
              className="bg-[#FAF8F2] border border-[#E2DAC8] rounded-xl p-3 text-xs font-mono font-bold text-[#17344F] text-center"
            >
              {TravelRepository.OFFICIAL_EMAIL}
            </div>

            <div className="bg-[#FBF7EE] border border-[#E5C887]/60 rounded-xl p-3 text-xs space-y-1 text-[#324D61]">
              <p>
                • {t('الخدمة:', 'Service:')}{' '}
                <span className="font-bold text-[#0F2437]">{selectedService}</span>
              </p>
              <p>
                • {t('رقم الهاتف:', 'Phone:')}{' '}
                <span className="font-bold text-[#0F2437]">{phone}</span>
              </p>
              <p>
                • {t('بريد العميل:', 'Email:')}{' '}
                <span className="font-bold text-[#0F2437]">{email}</span>
              </p>
              <p>
                • {t('رقم السجل التجاري:', 'CR No.:')}{' '}
                <span className="font-bold text-[#0F2437]">
                  {TravelRepository.COMMERCIAL_RECORD}
                </span>
              </p>
            </div>

            <p className="text-[11px] text-[#678093]">
              {t(
                'سيقوم فريق العمل بالرد والتواصل معك في أقرب وقت لإتمام الإجراءات وتأكيد الموعد.',
                'Our team will follow up with you promptly to finalize your request.'
              )}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  const msg =
                    lang === 'en'
                      ? `Hello Masarik Tourism, I submitted a request for (${selectedService}) via email under name (${name}) and phone (${phone}). Please follow up.`
                      : `السلام عليكم، قمت بإرسال طلب لخدمة (${selectedService}) عبر الإيميل باسم (${name}) ورقم (${phone}). أرجو المتابعة.`;
                  openWhatsApp(msg);
                  setShowSuccessDialog(false);
                }}
                className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-2.5 rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t('متابعة بالواتساب أيضاً', 'Follow Up on WhatsApp Too')}</span>
              </button>
              <button
                onClick={() => {
                  setShowSuccessDialog(false);
                  setName('');
                  setEmail('');
                  setPhone('');
                  setMessage('');
                }}
                className="w-full py-2 rounded-xl text-xs font-bold text-[#678093] hover:text-[#17344F] transition cursor-pointer"
              >
                {t('تم', 'Done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

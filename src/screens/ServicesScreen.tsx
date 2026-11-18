import React, { useState } from 'react';
import {
  Check,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  PhoneCall,
  Clock,
  FileCheck2,
  Calculator,
  Users,
  Minus,
  Plus,
} from 'lucide-react';
import { TravelRepository, getLocalizedTravelContent } from '../data/travelData';
import { openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { ServiceRequestModal } from '../components/ServiceRequestModal';
import { FAQAccordion } from '../components/FAQAccordion';
import { useLanguage } from '../contexts/LanguageContext';
import { CmsDynamicGridItems } from '../components/CmsDynamicGrid';
import { OfficialTrustFooter } from '../components/OfficialTrustFooter';

interface ServicesScreenProps {
  onNavigateToContact: (serviceTitle?: string) => void;
}

export const ServicesScreen: React.FC<ServicesScreenProps> = ({ onNavigateToContact }) => {
  const { lang, isAr, t } = useLanguage();
  const localized = getLocalizedTravelContent(lang);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedServiceForModal, setSelectedServiceForModal] = useState<string | undefined>(undefined);
  const [modalInitialTravelerCount, setModalInitialTravelerCount] = useState<number | undefined>(
    undefined
  );
  const [modalInitialNotes, setModalInitialNotes] = useState<string | undefined>(undefined);

  // Instant Service Estimator Card state
  const [estimatorServiceId, setEstimatorServiceId] = useState<string>(localized.services[0].id);
  const [estimatorTravelers, setEstimatorTravelers] = useState<number>(1);

  const ForwardArrow = isAr ? ArrowLeft : ArrowRight;

  const filteredServices =
    selectedCategory === 'all'
      ? localized.services
      : localized.services.filter((s) => s.categoryId === selectedCategory);

  const estimatorService =
    localized.services.find((s) => s.id === estimatorServiceId) || localized.services[0];

  const isSameDayInstant =
    estimatorService.id === 'tasheer-vfs' ||
    estimatorService.id === 'flight-booking' ||
    estimatorService.id === 'hotel-booking' ||
    estimatorService.id === 'enjaz-insurance';

  const estimatedCompletionPrimary = (() => {
    if (isSameDayInstant) {
      if (estimatorTravelers === 1) {
        return t('إنجاز فوري (خلال 30 – 90 دقيقة)', 'Instant Processing (30 – 90 mins)');
      }
      if (estimatorTravelers <= 4) {
        return t(
          `إنجاز متزامن في نفس اليوم (${estimatorTravelers} مسافرين)`,
          `Same-Day Synchronized (${estimatorTravelers} travelers)`
        );
      }
      return t(
        'إنجاز أولوية للمجموعات (خلال 2 – 6 ساعات عمل)',
        'Priority Group Processing (2 – 6 business hours)'
      );
    }
    if (estimatorTravelers === 1) {
      return t('خلال 24 ساعة عمل', 'Within 24 Business Hours');
    }
    if (estimatorTravelers <= 4) {
      return t('24 – 36 ساعة عمل لتجهيز ومراجعة الملفات', '24 – 36 Business Hours for File Prep');
    }
    return t('24 – 48 ساعة عمل لمجموعات المسافرين', '24 – 48 Business Hours (Group Handling)');
  })();

  const travelerCountLabel =
    estimatorTravelers >= 10
      ? t(`10+ (${estimatorTravelers} مسافر)`, `10+ (${estimatorTravelers} travelers)`)
      : estimatorTravelers === 1
      ? t('1 مسافر', '1 Traveler')
      : estimatorTravelers === 2
      ? t('2 مسافران', '2 Travelers')
      : t(`${estimatorTravelers} مسافرين`, `${estimatorTravelers} Travelers`);

  const handleOpenOrder = (
    title: string,
    travelerCount?: number,
    customNotes?: string
  ) => {
    setSelectedServiceForModal(title);
    setModalInitialTravelerCount(travelerCount);
    setModalInitialNotes(customNotes);
    setModalOpen(true);
  };

  const handleOpenEstimatorOrder = () => {
    const noteText =
      lang === 'en'
        ? `From Quick Estimator: ${estimatorService.title} | Number of Travelers: ${estimatorTravelers} | Expected Window: ${estimatedCompletionPrimary}`
        : `من حاسبة التقدير السريع: ${estimatorService.title} | عدد المسافرين: ${travelerCountLabel} | المدة المتوقعة: ${estimatedCompletionPrimary}`;
    handleOpenOrder(estimatorService.title, estimatorTravelers, noteText);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16 pt-6 text-[#0F2438]">
      <div className="max-w-5xl mx-auto px-4 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#C6A052] mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {t(
                    `خدمات معتمدة بسجل تجاري رقم ${TravelRepository.COMMERCIAL_RECORD}`,
                    `Certified Services • CR No. ${TravelRepository.COMMERCIAL_RECORD}`
                  )}
                </span>
              </div>
              <h1 className="text-xl md:text-3xl font-black text-[#0F2438]">
                {t('دليل الخدمات والمعاملات الحكومية', 'Services & Visa Directory')}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
                {t(
                  'اختر معاملتك المطلوبة للاطلاع على المتطلبات والبدء في الإجراءات فوراً عبر الواتساب أو النموذج المباشر.',
                  'Choose your required service to review specifications and start processing immediately via WhatsApp or direct form.'
                )}
              </p>
            </div>

            <button
              onClick={() => onNavigateToContact()}
              className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-[#0F2438] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition self-start sm:self-auto cursor-pointer whitespace-nowrap"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>{t('طلب استشارة أو معاملة خاصة', 'Request Custom Consultation')}</span>
            </button>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pt-4 pb-1 hide-scrollbar">
            {localized.categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-[#0F2438] text-white border-[#0F2438] shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  {cat.titleAr}
                </button>
              );
            })}
          </div>
        </div>

        {/* Instant Service Estimator Card */}
        <section className="bg-white border-2 border-[#E5C887] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                  {t('حاسبة التقدير السريع للخدمات', 'Instant Service Estimator')}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  {t(
                    'حدد نوع الخدمة وعدد المسافرين لمعرفة المستندات المطلوبة والمدة المتوقعة للإنجاز فوراً',
                    'Select service type and traveler count to preview required documents and estimated completion time'
                  )}
                </p>
              </div>
            </div>
            {estimatorService.speedBadge && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>{estimatorService.speedBadge}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
            <div className="md:col-span-7">
              <label className="block text-xs font-black text-[#0F2438] mb-1.5">
                {t('1. اختر نوع الخدمة المطلوبة', '1. Select Service Type')}
              </label>
              <select
                value={estimatorService.id}
                onChange={(e) => setEstimatorServiceId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-[#FAF8F2] text-xs sm:text-sm font-bold text-[#0F2438] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C6A052]"
              >
                {localized.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-5">
              <label className="block text-xs font-black text-[#0F2438] mb-1.5">
                {t('2. عدد المسافرين (1 إلى +10)', '2. Number of Travelers (1 to 10+)')}
              </label>
              <div className="flex items-center gap-2 bg-[#FAF8F2] border border-slate-300 rounded-xl p-1 min-h-[44px]">
                <button
                  type="button"
                  onClick={() => setEstimatorTravelers((c) => Math.max(1, c - 1))}
                  disabled={estimatorTravelers <= 1}
                  aria-label={t('تقليل عدد المسافرين', 'Decrease travelers')}
                  className="min-w-[40px] min-h-[38px] rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-[#0F2438] flex items-center justify-center transition cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <div className="flex-1 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-black text-[#0F2438] tabular-nums">
                  <Users className="w-4 h-4 text-[#9E7B33] shrink-0" />
                  <span>{travelerCountLabel}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setEstimatorTravelers((c) => Math.min(20, c + 1))}
                  disabled={estimatorTravelers >= 20}
                  aria-label={t('زيادة عدد المسافرين', 'Increase travelers')}
                  className="min-w-[40px] min-h-[38px] rounded-lg bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-40 text-[#E5C887] flex items-center justify-center transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-1">
            {/* Estimated Required Documents */}
            <div className="md:col-span-7 bg-[#FAF8F2] border border-[#E5C887]/80 rounded-xl p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-[#0F2438]">
                  <FileCheck2 className="w-4 h-4 text-[#9E7B33] shrink-0" />
                  <span>
                    {t(
                      `المستندات المطلوبة (${travelerCountLabel}):`,
                      `Required Documents (${travelerCountLabel}):`
                    )}
                  </span>
                </div>
              </div>

              <ul className="space-y-1.5">
                {(estimatorService.requiredDocs || []).map((req, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-slate-700 flex items-start gap-2 leading-snug"
                  >
                    <span className="text-[#9E7B33] font-black shrink-0">•</span>
                    <span>
                      {req}
                      {estimatorTravelers > 1 && idx === 0 && (
                        <span className="font-bold text-[#0F2438]">
                          {' '}
                          {t(
                            `(نسخة لكل مسافر × ${estimatorTravelers})`,
                            `(copy per traveler × ${estimatorTravelers})`
                          )}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Estimated Completion Time + CTA */}
            <div className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{t('المدة المتوقعة للإنجاز', 'Estimated Completion Time')}</span>
                </span>
                <p className="text-xs sm:text-sm font-black text-[#0F2438] leading-snug">
                  {estimatedCompletionPrimary}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {t(
                    'يصل المستند الرسمي النهائي (PDF / صورة) مباشرة إلى حسابك مع إشعار فوري.',
                    'Final official document (PDF / Image) is delivered directly to your account with instant alert.'
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenEstimatorOrder}
                className="w-full min-h-[46px] px-4 py-2.5 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99] cursor-pointer"
              >
                <span>{t('تقديم الطلب الآن', 'Submit Request Now')}</span>
                <ForwardArrow className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Services List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5" data-admin-grid="services-directory">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              data-admin-card="true"
              data-admin-editable={`services-dir-card-${service.id}`}
              className="bg-white border border-slate-200/90 hover:border-[#C6A052]/80 rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start gap-2.5 mb-3.5">
                  <h3 className="text-[15px] sm:text-base font-black text-[#0F2438] leading-snug">
                    {service.title}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                    {service.speedBadge && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-md">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{service.speedBadge}</span>
                      </span>
                    )}
                    {service.badge && (
                      <span className="text-[#9E7B33] text-[11px] font-black shrink-0">
                        {service.badge}
                      </span>
                    )}
                  </div>
                </div>

                <ul className="space-y-2.5 mb-4">
                  {service.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                {service.requiredDocs && service.requiredDocs.length > 0 && (
                  <div className="mb-4 bg-[#FAF8F2] border border-[#E5C887]/75 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-black text-[#0F2438]">
                      <FileCheck2 className="w-3.5 h-3.5 text-[#9E7B33] shrink-0" />
                      <span>{t('المستندات المطلوبة:', 'Required Documents:')}</span>
                    </div>
                    <ul className="space-y-1">
                      {service.requiredDocs.map((req, idx) => (
                        <li key={idx} className="text-[11px] text-slate-700 flex items-start gap-1.5 leading-snug">
                          <span className="text-[#9E7B33] font-black shrink-0">•</span>
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5 pt-3.5 border-t border-slate-100">
                <button
                  onClick={() => handleOpenOrder(service.title, undefined, undefined)}
                  className="flex-1 min-h-[44px] bg-[#0F2438] hover:bg-[#163B65] text-white py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black shadow-xs transition active:scale-[0.99] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{t('اطلب الخدمة الآن', 'Request Service')}</span>
                  <ForwardArrow className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    const msg =
                      lang === 'en'
                        ? `Hello Masarik Tourism, I would like to book and start processing: ${service.title}.`
                        : `السلام عليكم، أود حجز والبدء في معاملة: ${service.title} من وكالة مسارك للإنجاز السياحي.`;
                    openWhatsApp(msg);
                  }}
                  className="min-w-[44px] min-h-[44px] p-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl shadow-xs transition cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
                  title={t('تواصل مباشر عبر واتساب', 'Order via WhatsApp')}
                  aria-label={`${t('طلب', 'Request')} ${service.title}`}
                >
                  <WhatsAppIcon className="w-5 h-5" variant="white" />
                </button>
              </div>
            </div>
          ))}
          <CmsDynamicGridItems
            gridId="services-directory"
            selectedCategory={selectedCategory}
            onRequestService={(title) => handleOpenOrder(title, undefined, undefined)}
          />
        </div>

        {/* Simplified FAQ (accessible to all guests without login) */}
        <FAQAccordion />

        {/* Official Trust Footer */}
        <OfficialTrustFooter />
      </div>

      <ServiceRequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialServiceTitle={selectedServiceForModal}
        initialTravelerCount={modalInitialTravelerCount}
        initialNotes={modalInitialNotes}
      />
    </div>
  );
};

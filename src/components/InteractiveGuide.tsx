import React, { useState } from 'react';
import { HelpCircle, ArrowLeft, ArrowRight, RotateCcw, Check } from 'lucide-react';
import { openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface StepOption {
  id: string;
  label: string;
  description?: string;
}

export const InteractiveGuide: React.FC<{ onRequestModal: (serviceTitle: string) => void }> = ({
  onRequestModal,
}) => {
  const { lang, isAr, t } = useLanguage();
  const [step, setStep] = useState<number>(1);
  const [selectedGoal, setSelectedGoal] = useState<string>('');
  const [selectedDetail, setSelectedDetail] = useState<string>('');

  const ForwardArrow = isAr ? ArrowLeft : ArrowRight;
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const goals: StepOption[] = [
    {
      id: 'tasheel',
      label: t('حجز موعد تساهيل VFS وبصمة السفر', 'VFS Tasheer & Biometric Appointment'),
      description: t(
        'حجز موعد البصمة وتسديد رسوم إنجاز والتأمين الصحي',
        'Biometric slot booking, Enjaz fee payment & travel insurance'
      ),
    },
    {
      id: 'visas',
      label: t('تجهيز ملف تأشيرة سياحية أو زيارة', 'Tourist or Visit Visa File Preparation'),
      description: t(
        'تجهيز ملفات السفارات وحجوزات الطيران والفنادق المؤكدة',
        'Embassy-ready application files with verified flights & hotels'
      ),
    },
    {
      id: 'flights',
      label: t('حجز تذاكر الطيران والفنادق المعتمدة', 'Confirmed Flight & Hotel Reservations'),
      description: t(
        'تذاكر طيران مؤكدة وحجوزات فندقية بأفضل الأسعار',
        'Confirmed airfare & hotel vouchers at the best available rates'
      ),
    },
    {
      id: 'documents',
      label: t('تخليص الإجراءات والأوراق والتصديقات', 'Document Clearance & Attestation'),
      description: t(
        'تصديق خارجية وغرفة تجارية وترجمة معتمدة وجوازات',
        'Chamber of Commerce, MOFA legalization, translation & passports'
      ),
    },
  ];

  const getSubOptions = (): StepOption[] => {
    switch (selectedGoal) {
      case 'tasheel':
        return [
          { id: 'tasheel_normal', label: t('موعد عادي بأقرب وقت متاح', 'Earliest Standard Appointment') },
          { id: 'tasheel_vip', label: t('موعد مميز (Lounge VIP) مستعجل', 'Urgent VIP Lounge Appointment') },
          { id: 'tasheel_enjaz_only', label: t('تسديد منصة إنجاز وإصدار التأمين فقط', 'Enjaz Payment & Insurance Only') },
        ];
      case 'visas':
        return [
          { id: 'visa_saudi', label: t('تأشيرات السعودية (زيارة • سياحة • تجارية)', 'Saudi Visas (Visit · Tourist · Business)') },
          { id: 'visa_schengen', label: t('تأشيرات الشنغن وأوروبا وبريطانيا', 'Schengen, Europe & UK Visas') },
          { id: 'visa_other', label: t('تأشيرات دول الخليج وشرق آسيا', 'GCC & East Asia Visas') },
        ];
      case 'flights':
        return [
          { id: 'flight_saudi', label: t('حجز طيران مباشر إلى السعودية أو أي وجهة', 'Direct Flight to KSA or Worldwide') },
          { id: 'hotel_confirmed', label: t('حجز فندق مؤكد أو شقة فندقية', 'Confirmed Hotel or Serviced Apartment') },
          { id: 'flight_hotel_visa', label: t('حجز مبدئي/مؤكد للطيران والفندق لتقديم السفارة', 'Embassy Flight & Hotel Itinerary') },
        ];
      case 'documents':
        return [
          { id: 'doc_attest', label: t('تصديق الغرفة التجارية ووزارة الخارجية', 'Chamber of Commerce & MOFA Attestation') },
          { id: 'doc_passport', label: t('إجراءات استخراج أو تجديد جواز السفر', 'Passport Issuance or Renewal Guidance') },
          { id: 'doc_translation', label: t('ترجمة معتمدة للشهادات والتقارير الطبية', 'Certified Translation of Documents') },
        ];
      default:
        return [];
    }
  };

  const getMatchedService = (): {
    title: string;
    advice: string;
    required: string[];
  } => {
    switch (selectedGoal) {
      case 'tasheel':
        return {
          title: t('حجز مواعيد تساهيل و VFS Tasheer', 'VFS Tasheer Biometric Appointments'),
          advice: t(
            'الخدمة الأنسب لك هي حجز موعد تساهيل المعتمد وتسديد إنجاز والتأمين الصحي مباشرة.',
            'Your best option is an official VFS Tasheer appointment with Enjaz fee payment & medical insurance.'
          ),
          required: [
            t('صورة جواز السفر الساري', 'Valid passport scan'),
            t('رقم طلب التأشيرة أو مستند التأشيرة', 'Visa reference or invitation document'),
            t('بيانات جهة القدوم وفئة الموعد المطلوبة', 'Departure city & preferred slot tier'),
          ],
        };
      case 'visas':
        return {
          title: t('خدمات التأشيرات (Visas) وتجهيز الملفات', 'Visa Services & Application File Preparation'),
          advice: t(
            'نقوم بتجهيز ملفك بالكامل مستوفياً كافة متطلبات السفارة لضمان أعلى نسبة قبول.',
            'We prepare your complete file meeting every embassy rule to maximize approval chances.'
          ),
          required: [
            t('جواز سفر صالح لمدة 6 أشهر على الأقل', 'Passport valid for 6+ months'),
            t('صور شخصية حديثة بخلفية بيضاء', 'Recent white-background photos'),
            t('كشف حساب بنكي وحجوزات طيران وفنادق موثقة', 'Bank statement & verified travel bookings'),
          ],
        };
      case 'flights':
        return {
          title: t('حجز تذاكر الطيران والفنادق المعتمدة', 'Confirmed Flight & Hotel Reservations'),
          advice: t(
            'نوفر لك أفضل خيارات الطيران والفنادق المعتمدة بأقل تكلفة مع تأكيد فوري.',
            'We provide competitive certified airfare & hotel vouchers with instant confirmation.'
          ),
          required: [
            t('تاريخ السفر والوصول والعودة المطلوب', 'Departure & return dates'),
            t('المدينة أو الوجهة وتفضيلات الإقامة', 'Destination city & stay preferences'),
            t('صور جوازات السفر لمطابقة الأسماء', 'Passport scans for exact name matching'),
          ],
        };
      case 'documents':
      default:
        return {
          title: t('تخليص الإجراءات والأوراق والتصديقات', 'Document Clearance, Attestation & Translation'),
          advice: t(
            'نخلص ونوثق مستنداتك الرسمية ونعتمدها من الغرفة التجارية ووزارة الخارجية.',
            'We clear, translate, and legalize your documents at the Chamber of Commerce & MOFA.'
          ),
          required: [
            t('أصل أو صورة واضحة للمستند المطلوب تخليصه', 'Original or clear scan of the document'),
            t('تحديد الجهة أو السفارة الموجه إليها المستند', 'Target authority or destination embassy'),
          ],
        };
    }
  };

  const matched = getMatchedService();

  const handleSelectGoal = (id: string) => {
    setSelectedGoal(id);
    setStep(2);
  };

  const handleSelectDetail = (id: string) => {
    setSelectedDetail(id);
    setStep(3);
  };

  const handleReset = () => {
    setStep(1);
    setSelectedGoal('');
    setSelectedDetail('');
  };

  const handleWhatsAppOrder = () => {
    const goalObj = goals.find((g) => g.id === selectedGoal);
    const detailObj = getSubOptions().find((d) => d.id === selectedDetail);
    const message =
      lang === 'en'
        ? `Hello Masarik Tourism,
I used the Interactive Service Guide:
📌 *Recommended Service:* ${matched.title}
🎯 *Primary Goal:* ${goalObj?.label || selectedGoal}
🔍 *Selected Option:* ${detailObj?.label || selectedDetail}
Please share requirements, fees, and next steps. Thank you.`
        : `السلام عليكم ورحمة الله وبركاته،
استخدمت الدليل التفاعلي لمنصة مسارك للإنجاز السياحي:
📌 *الخدمة الموصى بها:* ${matched.title}
🎯 *الهدف الأساسي:* ${goalObj?.label || selectedGoal}
🔍 *التفاصيل المحددة:* ${detailObj?.label || selectedDetail}
أرغب في البدء في المعاملة ومعرفة الرسوم والخطوات القادمة. شكراً لكم.`;

    openWhatsApp(message);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-7 relative overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0284C7]/10 text-[#0284C7] flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-bold text-[#0F2438]">
              {t('محتار تبدأ منين؟', 'Not Sure Where to Start?')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('دليلك الذكي لاختيار الخدمة المناسبة في ٣ خطوات سريعة', 'Find the right service in 3 quick steps')}
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {[1, 2, 3].map((num) => (
            <div
              key={num}
              className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                step === num
                  ? 'bg-[#0F2438] text-[#E5C887]'
                  : step > num
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step > num ? <Check className="w-3.5 h-3.5" /> : num}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <h4 className="text-sm font-bold text-[#0F2438]">
            {t('الخطوة ١: ما هو نوع المعاملة التي تبحث عنها اليوم؟', 'Step 1: What travel service are you looking for today?')}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {goals.map((goal) => (
              <button
                key={goal.id}
                onClick={() => handleSelectGoal(goal.id)}
                className="text-start p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#0284C7] hover:shadow-xs transition-all flex flex-col justify-between gap-2 cursor-pointer group"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs md:text-sm font-bold text-[#0F2438] group-hover:text-[#0284C7] transition-colors">
                    {goal.label}
                  </span>
                  <ForwardArrow className="w-4 h-4 text-slate-400 group-hover:text-[#0284C7] transition-colors shrink-0" />
                </div>
                {goal.description && (
                  <span className="text-[11px] text-slate-500 leading-snug">
                    {goal.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#0F2438]">
              {t('الخطوة ٢: حدد التفاصيل أو الوجهة الأكثر ملاءمة لك:', 'Step 2: Choose the option that best matches your needs:')}
            </h4>
            <button
              onClick={() => setStep(1)}
              className="text-xs text-slate-500 hover:text-[#0F2438] flex items-center gap-1 cursor-pointer"
            >
              <BackArrow className="w-3 h-3" />
              <span>{t('رجوع', 'Back')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {getSubOptions().map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSelectDetail(opt.id)}
                className="text-start p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#0284C7] hover:shadow-xs transition-all flex flex-col justify-between gap-3 cursor-pointer group"
              >
                <span className="text-xs md:text-sm font-bold text-[#0F2438] group-hover:text-[#0284C7] transition-colors leading-relaxed">
                  {opt.label}
                </span>
                <span className="text-[11px] font-semibold text-[#0284C7] flex items-center gap-1">
                  <span>{t('تأكيد واختيار', 'Select & Continue')}</span>
                  <ForwardArrow className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-4 md:p-5 rounded-2xl bg-gradient-to-br from-[#0F2438] to-[#163B65] text-white space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#E5C887] uppercase tracking-wider">
                {t('الخدمة الموصى بها لحالتك', 'Recommended Service')}
              </span>
              <button
                onClick={handleReset}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('إعادة الاختيار', 'Start Over')}</span>
              </button>
            </div>

            <h4 className="text-base md:text-lg font-bold text-white">
              {matched.title}
            </h4>
            <p className="text-xs md:text-sm text-slate-200 leading-relaxed">
              {matched.advice}
            </p>

            <div className="pt-2 border-t border-white/10">
              <span className="text-xs font-bold text-[#E5C887] block mb-2">
                {t('المستندات المطلوبة للبدء:', 'Required Documents:')}
              </span>
              <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {matched.required.map((req, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-1.5 text-xs text-slate-200 bg-white/10 px-2.5 py-1.5 rounded-lg"
                  >
                    <Check className="w-3.5 h-3.5 text-[#E5C887] shrink-0" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleWhatsAppOrder}
              className="w-full sm:flex-1 py-3 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer"
            >
              <WhatsAppIcon className="w-4.5 h-4.5" variant="white" />
              <span>{t('اطلب هذه الخدمة عبر واتساب الآن', 'Request via WhatsApp Now')}</span>
            </button>
            <button
              onClick={() => onRequestModal(matched.title)}
              className="w-full sm:w-auto py-3 px-5 bg-[#0F2438] hover:bg-[#0A1926] text-white rounded-xl text-xs md:text-sm font-bold transition active:scale-[0.98] cursor-pointer"
            >
              {t('تقديم طلب مباشر', 'Submit Direct Request')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

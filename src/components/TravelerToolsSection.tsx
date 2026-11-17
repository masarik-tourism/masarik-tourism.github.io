import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar,
  ScanLine,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  FileCheck2,
  BookmarkPlus,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { PassportAiCheckResult } from '../types/travel';
import {
  compressImageToDataUrl,
  getActiveTraveler,
  splitPassportName,
  updateTravelerProfileDetails,
  uploadAndAddDocumentToTraveler,
} from '../utils/travelerStore';
import { openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface TravelerToolsSectionProps {
  onOpenTravelerProfile: () => void;
}

const VISA_TYPES_LIST = [
  {
    id: 'saudi_visit',
    ar: 'تأشيرة زيارة عائلية / شخصية للسعودية',
    en: 'Saudi Family / Personal Visit Visa',
  },
  {
    id: 'umrah',
    ar: 'تأشيرة عمرة B2C',
    en: 'Umrah Visa B2C',
  },
  {
    id: 'tasheer',
    ar: 'حجز موعد تساهيل VFS وإنجاز',
    en: 'VFS Tasheer Appointment & Enjaz',
  },
  {
    id: 'work',
    ar: 'تأشيرة عمل / استقدام للسعودية',
    en: 'Saudi Work / Recruitment Visa',
  },
  {
    id: 'schengen',
    ar: 'تأشيرة شنغن / سياحة خارجية',
    en: 'Schengen / International Tourist Visa',
  },
];

const STATIC_CHECKLIST_BY_ID: Record<string, { ar: string[]; en: string[] }> = {
  saudi_visit: {
    ar: [
      'جواز سفر ساري لمدة لا تقل عن 6 أشهر من تاريخ السفر',
      'تأشيرة / مستند الزيارة الصادر من وزارة الخارجية السعودية',
      'سداد رسوم منصة إنجاز وإصدار التأمين الطبي المعتمد',
      'حجز موعد البصمة في مركز تساهيل VFS Tasheer',
    ],
    en: [
      'Passport valid for at least 6 months from your travel date',
      'Official visit visa / invitation issued by Saudi MOFA',
      'Enjaz platform fee payment & accredited travel medical insurance',
      'Biometric appointment booked at VFS Tasheer center',
    ],
  },
  umrah: {
    ar: [
      'جواز سفر ساري لمدة 6 أشهر على الأقل',
      'صورتان شخصيتان حديثتان بخلفية بيضاء',
      'حجز طيران وسكن مؤكد وإصدار باركود العمرة النظامي',
    ],
    en: [
      'Passport valid for at least 6 months',
      'Two recent passport photos with white background',
      'Confirmed flight, hotel booking, and official Umrah barcode',
    ],
  },
  tasheer: {
    ar: [
      'صورة واضحة لصفحة بيانات جواز السفر',
      'رقم الطلب / مستند التأشيرة الصادر',
      'سداد رسوم إنجاز والتأمين الطبي قبل الموعد',
    ],
    en: [
      'Clear scan of passport data page',
      'Visa reference number or issued visa document',
      'Completed Enjaz payment & medical insurance prior to appointment',
    ],
  },
  work: {
    ar: [
      'جواز سفر ساري لمدة 6 أشهر على الأقل ومطابق للمهنة',
      'عقد العمل الموثق من الغرفة التجارية والخارجية وتفويض إنجاز',
      'نتيجة الكشف الطبي المعتمد من معامل GAMCA / وافد',
      'صحيفة حالة جنائية (فيش وتشبيه) موثقة لوزارة الخارجية',
    ],
    en: [
      'Passport valid for at least 6 months matching the profession',
      'Employment contract attested by Chamber & MOFA + Enjaz delegation',
      'Approved medical exam result from GAMCA / Wafid centers',
      'Police clearance certificate legalized by Ministry of Foreign Affairs',
    ],
  },
  schengen: {
    ar: [
      'جواز سفر ساري 6 أشهر بعد العودة وبه صفحتان فارغتان على الأقل',
      'كشف حساب بنكي لآخر 6 أشهر ومفردات مرتب / سجل تجاري مترجم',
      'حجوزات طيران وفندق وتأمين سفر دولي معتمد',
    ],
    en: [
      'Passport valid 6 months past return date with at least 2 blank pages',
      '6-month bank statement and translated employment letter / CR',
      'Confirmed/provisional flight, hotel, and international travel insurance',
    ],
  },
};

function addMonthsToDate(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function diffDays(fromStr: string, toStr: string): number {
  const from = Date.parse(`${fromStr}T00:00:00Z`);
  const to = Date.parse(`${toStr}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export const TravelerToolsSection: React.FC<TravelerToolsSectionProps> = ({
  onOpenTravelerProfile,
}) => {
  const { lang, t } = useLanguage();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [activeTool, setActiveTool] = useState<'calculator' | 'ai-scan'>('calculator');

  // Calculator state
  const [travelDate, setTravelDate] = useState<string>(todayStr);
  const [passportExpiry, setPassportExpiry] = useState<string>('');
  const [visaEntryDate, setVisaEntryDate] = useState<string>(todayStr);
  const [visaDurationDays, setVisaDurationDays] = useState<number>(90);

  // AI Scanner state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedVisaId, setSelectedVisaId] = useState<string>(VISA_TYPES_LIST[0].id);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [compressedPayload, setCompressedPayload] = useState<{
    dataUrl: string;
    base64: string;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string>('');
  const [staticFallbackNote, setStaticFallbackNote] = useState<string>('');
  const [aiResult, setAiResult] = useState<PassportAiCheckResult | null>(null);
  const [savedToWalletFeedback, setSavedToWalletFeedback] = useState<string>('');

  const selectedVisaObj =
    VISA_TYPES_LIST.find((v) => v.id === selectedVisaId) || VISA_TYPES_LIST[0];
  const selectedVisaLabel = lang === 'en' ? selectedVisaObj.en : selectedVisaObj.ar;

  useEffect(() => {
    setScanError('');
    setStaticFallbackNote('');
    setSavedToWalletFeedback('');
  }, [lang]);

  // Derived Passport Validity calculations
  const sixMonthThresholdDate = travelDate ? addMonthsToDate(travelDate, 6) : '';
  const remainingFromTravelDays =
    travelDate && passportExpiry ? diffDays(travelDate, passportExpiry) : null;
  const passportStatus: 'idle' | 'valid_6m' | 'warning_under_6m' | 'expired' =
    remainingFromTravelDays === null
      ? 'idle'
      : remainingFromTravelDays <= 0
      ? 'expired'
      : passportExpiry >= sixMonthThresholdDate
      ? 'valid_6m'
      : 'warning_under_6m';
  const lastEligibleTravelDate = passportExpiry ? addMonthsToDate(passportExpiry, -6) : '';

  // Derived Visa Exit Deadline calculations
  const visaExitDeadline =
    visaEntryDate && visaDurationDays > 0
      ? addDaysToDate(visaEntryDate, visaDurationDays)
      : '';
  const visaRemainingFromToday = visaExitDeadline ? diffDays(todayStr, visaExitDeadline) : null;

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError('');
    setStaticFallbackNote('');
    setAiResult(null);
    setSavedToWalletFeedback('');

    try {
      const compressed = await compressImageToDataUrl(file, 1200, 0.78);
      setPreviewDataUrl(compressed.dataUrl);
      setCompressedPayload({
        ...compressed,
        fileName: file.name || 'passport-document.jpg',
      });
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : t('تعذر قراءة الصورة.', 'Could not read image.')
      );
    }
  };

  const handleRunAiScan = async () => {
    if (!compressedPayload) {
      setScanError(
        t('يرجى رفع صورة جواز السفر أو المستند أولاً.', 'Please upload a passport or document photo first.')
      );
      return;
    }

    setIsScanning(true);
    setScanError('');
    setStaticFallbackNote('');
    setAiResult(null);
    setSavedToWalletFeedback('');

    try {
      const response = await fetch('/api/passport-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressedPayload.base64,
          mimeType: compressedPayload.mimeType,
          visaType: selectedVisaLabel,
          lang,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.status === 404 || !contentType.includes('application/json')) {
        setStaticFallbackNote(
          t(
            'خدمة الفحص الآلي بالذكاء الاصطناعي تعمل عبر الخادم الذكي للمنصة، بينما يمكنك حفظ الصورة مباشرة في محفظة المسافر أو التحقق من تاريخ الانتهاء وقائمة المتطلبات الجاهزة أدناه.',
            'AI Passport Check requires the live backend server; meanwhile, you can save your image directly to your Traveler Wallet or review the visa checklist below.'
          )
        );
        setIsScanning(false);
        return;
      }

      const data = (await response.json()) as {
        result?: PassportAiCheckResult;
        error?: string;
      };

      if (!response.ok || !data.result) {
        setScanError(
          data.error ||
            t(
              'تعذر إتمام الفحص الآن. يرجى المحاولة مرة أخرى.',
              'Could not complete the scan right now. Please try again.'
            )
        );
        setIsScanning(false);
        return;
      }

      setAiResult(data.result);
      if (data.result.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(data.result.expiryDate)) {
        setPassportExpiry(data.result.expiryDate);
      }

      // Automatically sync extracted passport number & details to active traveler profile
      const active = getActiveTraveler();
      if (active) {
        const autoUpdates: Record<string, string> = {};
        if (data.result.passportNumber && data.result.passportNumber.trim()) {
          autoUpdates.passportNumber = data.result.passportNumber.trim().toUpperCase();
        }
        if (data.result.fullName && data.result.fullName.trim()) {
          autoUpdates.passportFullName = data.result.fullName.trim();
          const split = splitPassportName(data.result.fullName);
          if (split.firstName) autoUpdates.firstName = split.firstName;
          if (split.lastName) autoUpdates.lastName = split.lastName;
        }
        if (data.result.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(data.result.expiryDate)) {
          autoUpdates.passportExpiryDate = data.result.expiryDate;
        }
        if (data.result.nationality && data.result.nationality.trim()) {
          autoUpdates.nationality = data.result.nationality.trim();
        }
        if (Object.keys(autoUpdates).length > 0) {
          updateTravelerProfileDetails(active.phone, autoUpdates);
        }
      }
    } catch {
      setStaticFallbackNote(
        t(
          'تعذر الاتصال بخادم الفحص الذكي حالياً. يمكنك استخدام حاسبة الصلاحية وقائمة المتطلبات المعتمدة أدناه أو إرسال الصورة مباشرة عبر واتساب للمراجعة الفورية.',
          'Unable to reach the AI verification server right now. You can use the Validity Calculator and checklist below, or send your document directly on WhatsApp.'
        )
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveScanToWallet = async () => {
    const active = getActiveTraveler();
    if (!active) {
      onOpenTravelerProfile();
      return;
    }

    if (aiResult) {
      const split = aiResult.fullName ? splitPassportName(aiResult.fullName) : null;
      updateTravelerProfileDetails(active.phone, {
        ...(split?.firstName ? { firstName: split.firstName } : {}),
        ...(split?.lastName ? { lastName: split.lastName } : {}),
        passportFullName: aiResult.fullName || active.passportFullName,
        passportNumber: aiResult.passportNumber || active.passportNumber,
        passportExpiryDate: aiResult.expiryDate || active.passportExpiryDate,
        nationality: aiResult.nationality || active.nationality,
        preferredVisaType: selectedVisaLabel,
      });
    }

    if (compressedPayload) {
      await uploadAndAddDocumentToTraveler(active.phone, {
        label: aiResult?.documentType || `${t('مستند', 'Document')} ${selectedVisaLabel}`,
        docType: 'passport',
        fileName: compressedPayload.fileName,
        dataUrl: compressedPayload.dataUrl,
      });
    }

    setSavedToWalletFeedback(
      t(
        'تم حفظ ورفع بيانات المستند والصورة سحابياً في محفظة المسافر بنجاح.',
        'Document details and scan uploaded & saved to your Traveler Wallet.'
      )
    );
  };

  const handleSendScanToWhatsApp = () => {
    const details = aiResult
      ? lang === 'en'
        ? `\n• Name: ${aiResult.fullName || 'N/A'}\n• Passport No: ${
            aiResult.passportNumber || 'N/A'
          }\n• Expiry Date: ${aiResult.expiryDate || 'N/A'}\n• Status: ${
            aiResult.hasSixMonthsValidity ? 'Valid 6+ Months' : 'Needs Review'
          }`
        : `\n• الاسم: ${aiResult.fullName || 'غير محدد'}\n• رقم الجواز: ${
            aiResult.passportNumber || 'غير محدد'
          }\n• تاريخ الانتهاء: ${aiResult.expiryDate || 'غير محدد'}\n• حالة الصلاحية: ${
            aiResult.hasSixMonthsValidity ? 'صالح أكثر من 6 أشهر' : 'يحتاج مراجعة'
          }`
      : '';

    const msg =
      lang === 'en'
        ? `Hello Masarik Tourism, I checked my travel documents via the portal:
• Service Type: ${selectedVisaLabel}${details}
I would like to proceed with reviewing my documents and completing the application.`
        : `السلام عليكم، قمت بفحص مستنداتي عبر منصة مسارك:
• نوع المعاملة: ${selectedVisaLabel}${details}
أرغب في استكمال الإجراءات ومراجعة المستندات معكم.`;
    openWhatsApp(msg);
  };

  const activeChecklist =
    STATIC_CHECKLIST_BY_ID[selectedVisaId]?.[lang] ||
    STATIC_CHECKLIST_BY_ID.saudi_visit[lang];

  return (
    <section
      id="traveler-smart-tools"
      className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24"
      aria-labelledby="smart-tools-heading"
    >
      {/* Tool Header + Segmented Switch */}
      <div className="bg-gradient-to-l from-[#0F2438] to-[#163B65] text-white p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b-2 border-[#C6A052]">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#E5C887] mb-1">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              {t('أدوات المسافر الذكية • متاحة مجاناً للجميع', 'Smart Traveler Tools • Free for All Visitors')}
            </span>
          </div>
          <h2 id="smart-tools-heading" className="text-lg sm:text-xl font-black text-white">
            {t('حاسبة صلاحية الجواز والفحص الذكي للأوراق', 'Passport Validity Calculator & AI Document Check')}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {t(
              'تأكد من استيفاء شرط الـ 6 أشهر قبل حجز الطيران أو موعد تساهيل، وافحص جوازك بالذكاء الاصطناعي فوراً',
              'Verify the 6-month passport rule before booking flights or Tasheer, and pre-check documents with AI'
            )}
          </p>
        </div>

        {/* Segmented Control */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white/10 p-1 rounded-xl border border-white/15 self-start lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTool('calculator')}
            className={`min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTool === 'calculator'
                ? 'bg-[#C6A052] text-[#0A1926] shadow-xs'
                : 'text-white hover:bg-white/10'
            }`}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span>{t('حاسبة الصلاحية', 'Validity Calculator')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('ai-scan')}
            className={`min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTool === 'ai-scan'
                ? 'bg-[#C6A052] text-[#0A1926] shadow-xs'
                : 'text-white hover:bg-white/10'
            }`}
          >
            <ScanLine className="w-4 h-4 shrink-0" />
            <span>{t('فحص الجواز بالذكاء الاصطناعي', 'AI Passport Pre-Check')}</span>
          </button>
        </div>
      </div>

      {/* Tool 1: Passport & Visa Validity Calculator */}
      {activeTool === 'calculator' && (
        <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Passport 6-Month Rule */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#0F2438]">
                  {t('حاسبة صلاحية الجواز (قاعدة 6 أشهر)', 'Passport Validity Checker (6-Month Rule)')}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {t(
                    'تُطبق على تأشيرات السعودية وتساهيل ومعظم الرحلات الدولية',
                    'Required for Saudi visas, VFS Tasheer & most international flights'
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('تاريخ السفر المتوقع', 'Planned Travel Date')}
                </label>
                <input
                  type="date"
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('تاريخ انتهاء جواز السفر', 'Passport Expiry Date')}
                </label>
                <input
                  type="date"
                  value={passportExpiry}
                  onChange={(e) => setPassportExpiry(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                />
              </div>
            </div>

            {passportStatus === 'idle' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-500 text-center">
                {t(
                  'أدخل تاريخ انتهاء جواز السفر لعرض النتيجة الدقيقة وعدد الأيام المتبقية.',
                  'Enter your passport expiry date to see remaining days and travel eligibility.'
                )}
              </div>
            ) : (
              <div
                className={`rounded-xl p-4 border space-y-2 ${
                  passportStatus === 'valid_6m'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : passportStatus === 'warning_under_6m'
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-red-50 border-red-200 text-red-950'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                  {passportStatus === 'valid_6m' && (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {t(
                          'جواز السفر مقبول للسفر (مستوفٍ لشرط 6 أشهر)',
                          'Passport Eligible for Travel (Meets 6-Month Rule)'
                        )}
                      </span>
                    </>
                  )}
                  {passportStatus === 'warning_under_6m' && (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        {t(
                          'تنبيه: الصلاحية أقل من 6 أشهر عند موعد السفر',
                          'Warning: Validity Under 6 Months on Travel Date'
                        )}
                      </span>
                    </>
                  )}
                  {passportStatus === 'expired' && (
                    <>
                      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>
                        {t(
                          'الجواز منتهي الصلاحية في تاريخ السفر المحدد',
                          'Passport Expired on Selected Travel Date'
                        )}
                      </span>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs tabular-nums">
                  <div className="bg-white/80 rounded-lg px-3 py-2">
                    <span className="text-[11px] text-slate-500 block">
                      {t('الأيام المتبقية عند السفر', 'Remaining Days on Travel')}
                    </span>
                    <span className="font-black text-[#0F2438]">
                      {Math.max(0, remainingFromTravelDays || 0)} {t('يوماً', 'days')} (
                      {Math.max(0, Math.floor((remainingFromTravelDays || 0) / 30))}{' '}
                      {t('شهر تقريباً', 'mos approx.')})
                    </span>
                  </div>
                  <div className="bg-white/80 rounded-lg px-3 py-2">
                    <span className="text-[11px] text-slate-500 block">
                      {t('آخر موعد مسموح للسفر', 'Last Eligible Travel Date')}
                    </span>
                    <span className="font-black text-[#0F2438]">{lastEligibleTravelDate || '-'}</span>
                  </div>
                </div>

                {passportStatus !== 'valid_6m' && (
                  <p className="text-[11px] leading-relaxed pt-1">
                    {t(
                      'يُنصح بتجديد جواز السفر قبل التقديم على التأشيرة أو حجز موعد تساهيل لتفادي الرفض بالمطار أو المنصة.',
                      'We recommend renewing your passport before applying for a visa or booking Tasheer to avoid airport or embassy rejection.'
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Visa Stay & Exit Deadline Calculator */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0284C7] text-white flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#0F2438]">
                  {t('حاسبة مدة الإقامة وموعد المغادرة', 'Visa Stay & Exit Deadline Calculator')}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {t(
                    'احسب آخر يوم إقامة نظامي لتفادي غرامات التأخير في التأشيرات',
                    'Calculate your final legal departure day to avoid overstay penalties'
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('تاريخ الدخول الفعلي / المتوقع', 'Actual / Expected Entry Date')}
                </label>
                <input
                  type="date"
                  value={visaEntryDate}
                  onChange={(e) => setVisaEntryDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('مدة الإقامة المصرّح بها (بالأيام)', 'Permitted Stay Duration (Days)')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={730}
                    value={visaDurationDays}
                    onChange={(e) => setVisaDurationDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  />
                </div>
              </div>
            </div>

            {/* Quick Duration Presets */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: t('14 يوماً', '14 Days'), days: 14 },
                { label: t('30 يوماً', '30 Days'), days: 30 },
                { label: t('60 يوماً', '60 Days'), days: 60 },
                { label: t('90 يوماً (زيارة)', '90 Days (Visit)'), days: 90 },
                { label: t('365 يوماً', '365 Days'), days: 365 },
              ].map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => setVisaDurationDays(preset.days)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer tabular-nums ${
                    visaDurationDays === preset.days
                      ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438]'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {visaExitDeadline && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 tabular-nums">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">
                    {t('آخر موعد نظامي للمغادرة / التمديد:', 'Legal Exit / Extension Deadline:')}
                  </span>
                  <span className="text-sm sm:text-base font-black text-[#0F2438]">
                    {visaExitDeadline}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <span className="text-slate-500">
                    {t('المتبقي من تاريخ اليوم:', 'Remaining From Today:')}
                  </span>
                  <span
                    className={`font-bold ${
                      (visaRemainingFromToday ?? 0) > 14
                        ? 'text-emerald-700'
                        : (visaRemainingFromToday ?? 0) > 0
                        ? 'text-amber-700'
                        : 'text-red-700'
                    }`}
                  >
                    {(visaRemainingFromToday ?? 0) > 0
                      ? t(`متبقي ${visaRemainingFromToday} يوماً`, `${visaRemainingFromToday} days remaining`)
                      : t('انتهت مدة الإقامة المحددة', 'Stay duration ended')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool 2: AI Document Pre-Check */}
      {activeTool === 'ai-scan' && (
        <div className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Upload & Options Column */}
            <div className="lg:col-span-5 space-y-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('اختر نوع التأشيرة / المعاملة للفحص', 'Select Visa / Service Type to Check')}
                </label>
                <select
                  value={selectedVisaId}
                  onChange={(e) => setSelectedVisaId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                >
                  {VISA_TYPES_LIST.map((vt) => (
                    <option key={vt.id} value={vt.id}>
                      {lang === 'en' ? vt.en : vt.ar}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelected}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-300 hover:border-[#0284C7] bg-white rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer"
                >
                  {previewDataUrl ? (
                    <img
                      src={previewDataUrl}
                      alt={t('معاينة الجواز أو المستند', 'Passport or Document Preview')}
                      loading="lazy"
                      decoding="async"
                      className="max-h-44 rounded-xl object-contain border border-slate-200"
                    />
                  ) : (
                    <>
                      <div className="w-11 h-11 rounded-full bg-[#0284C7]/10 text-[#0284C7] flex items-center justify-center">
                        <Upload className="w-5 h-5" />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-[#0F2438]">
                        {t('اضغط لرفع صورة الجواز أو المستند', 'Tap to Upload Passport or Document Photo')}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {t(
                          'يتم ضغط الصورة ومعالجتها بأمان لاستخراج الاسم ورقم الجواز وتاريخ الانتهاء',
                          'Safely extracts name, passport number, and expiry date'
                        )}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleRunAiScan}
                  disabled={!compressedPayload || isScanning}
                  className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-50 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('جاري الفحص الذكي...', 'Analyzing Document...')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{t('فحص المستند بالذكاء الاصطناعي', 'Run AI Pre-Check')}</span>
                    </>
                  )}
                </button>

                {previewDataUrl && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[44px] px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-[#0F2438] rounded-xl cursor-pointer whitespace-nowrap"
                  >
                    {t('تغيير الصورة', 'Change Photo')}
                  </button>
                )}
              </div>

              {scanError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{scanError}</span>
                </div>
              )}
            </div>

            {/* Results & Checklist Column */}
            <div className="lg:col-span-7 space-y-4">
              {aiResult ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <span className="text-[11px] font-bold text-[#0284C7] block">
                        {t('نتيجة الفحص بالذكاء الاصطناعي', 'AI Pre-Check Result')}
                      </span>
                      <h3 className="text-base font-black text-[#0F2438]">
                        {aiResult.documentType || t('مستند مسافر', 'Traveler Document')}
                      </h3>
                    </div>

                    <div
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                        aiResult.hasSixMonthsValidity
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : aiResult.validityStatus === 'expired'
                          ? 'bg-red-50 border-red-200 text-red-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      {aiResult.hasSixMonthsValidity ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <span>
                        {aiResult.hasSixMonthsValidity
                          ? t(
                              `صالح (+6 أشهر · ${aiResult.remainingDays} يوماً)`,
                              `Valid (+6 Months · ${aiResult.remainingDays} days)`
                            )
                          : aiResult.validityStatus === 'expired'
                          ? t('الجواز منتهي الصلاحية', 'Passport Expired')
                          : t('يحتاج مراجعة أو صلاحية أقل من 6 أشهر', 'Needs Review / Under 6 Months')}
                      </span>
                    </div>
                  </div>

                  {/* Extracted Fields Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="bg-white border border-slate-200 rounded-xl p-3">
                      <span className="text-[11px] text-slate-400 block">
                        {t('الاسم المستخرج', 'Extracted Full Name')}
                      </span>
                      <span className="font-bold text-[#0F2438]">
                        {aiResult.fullName || t('غير واضح بالصورة', 'Not clearly visible')}
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-3 tabular-nums">
                      <span className="text-[11px] text-slate-400 block">
                        {t('رقم الجواز / الوثيقة', 'Passport / Document No.')}
                      </span>
                      <span className="font-bold text-[#0F2438]">
                        {aiResult.passportNumber || t('غير واضح بالصورة', 'Not clearly visible')}
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-3">
                      <span className="text-[11px] text-slate-400 block">
                        {t('الجنسية', 'Nationality')}
                      </span>
                      <span className="font-bold text-[#0F2438]">
                        {aiResult.nationality || t('غير محددة', 'Unspecified')}
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-3 tabular-nums">
                      <span className="text-[11px] text-slate-400 block">
                        {t('تاريخ الانتهاء', 'Expiry Date')}
                      </span>
                      <span className="font-bold text-[#0F2438]">
                        {aiResult.expiryDate || t('غير مقروء', 'Unreadable')}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed">
                    <span className="font-bold text-[#0F2438] block mb-1">
                      {t('التقييم والملاحظات:', 'Assessment & Notes:')}
                    </span>
                    <p>{aiResult.summaryAr}</p>
                    {aiResult.confidenceNote && (
                      <p className="text-[11px] text-slate-500 mt-1.5">{aiResult.confidenceNote}</p>
                    )}
                  </div>

                  {aiResult.missingRequirements && aiResult.missingRequirements.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                      <span className="text-xs font-bold text-[#0F2438] block">
                        {t(
                          `المتطلبات والأوراق المطلوبة لـ (${selectedVisaLabel}):`,
                          `Required Documents for (${selectedVisaLabel}):`
                        )}
                      </span>
                      <ul className="space-y-1.5">
                        {aiResult.missingRequirements.map((req, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-slate-600 flex items-start gap-2"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#0284C7] shrink-0 mt-0.5" />
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveScanToWallet}
                      className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                    >
                      <BookmarkPlus className="w-4 h-4 text-[#E5C887]" />
                      <span>{t('حفظ في محفظة المسافر', 'Save to Traveler Wallet')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSendScanToWhatsApp}
                      className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                    >
                      <WhatsAppIcon className="w-4 h-4" variant="white" />
                      <span>{t('إرسال النتيجة لواتساب مسارك', 'Send Result via WhatsApp')}</span>
                    </button>
                  </div>

                  {savedToWalletFeedback && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 text-center">
                      {savedToWalletFeedback}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  {staticFallbackNote && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                      {staticFallbackNote}
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-bold text-[#0F2438] mb-1">
                      {t(
                        `قائمة التحقق السريعة للمعاملة المختارة (${selectedVisaLabel})`,
                        `Quick Checklist for (${selectedVisaLabel})`
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mb-3">
                      {t(
                        'ارفع صورة الجواز ثم اضغط "فحص المستند بالذكاء الاصطناعي" لاستخراج البيانات تلقائياً، أو راجع المتطلبات الأساسية أدناه:',
                        'Upload your passport photo and run AI Pre-Check to auto-extract details, or review core requirements below:'
                      )}
                    </p>
                    <ul className="space-y-2">
                      {activeChecklist.map((item, idx) => (
                        <li
                          key={idx}
                          className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 flex items-start gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    {compressedPayload && (
                      <button
                        type="button"
                        onClick={handleSaveScanToWallet}
                        className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                      >
                        <BookmarkPlus className="w-4 h-4 text-[#E5C887]" />
                        <span>{t('حفظ الصورة في محفظة المسافر', 'Save Scan to Traveler Wallet')}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSendScanToWhatsApp}
                      className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                    >
                      <WhatsAppIcon className="w-4 h-4" variant="white" />
                      <span>{t('أرسل الأوراق للمراجعة عبر واتساب', 'Send Documents via WhatsApp')}</span>
                    </button>
                  </div>

                  {savedToWalletFeedback && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 text-center">
                      {savedToWalletFeedback}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

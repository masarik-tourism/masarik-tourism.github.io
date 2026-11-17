import React, { useRef, useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  KeyRound,
  LogOut,
  Upload,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Save,
  ScanLine,
  Loader2,
  Sparkles,
  Camera,
  RotateCcw,
  Eye,
  X,
  ArrowRight,
  ArrowLeft,
  FolderOpen,
  ClipboardList,
} from 'lucide-react';
import { PassportAiCheckResult, TravelerDocument, TravelerProfile } from '../types/travel';
import {
  TravelerProfileDraft,
  VISA_ORDER_STATUSES,
  buildClientWhatsAppRequestMessage,
  commitTravelerProfileDraftCloud,
  compressImageToDataUrl,
  formatPhoneForDisplay,
  getTravelerDisplayNames,
  initiateTravelerOtpLoginCloud,
  normalizeArabicDigits,
  normalizePhone,
  setActiveTravelerPhone,
  splitPassportName,
  verifyLoginOtpCloud,
} from '../utils/travelerStore';
import { imageUrlToBase64 } from '../utils/firebaseStorageHelper';
import { translateOrderStatus } from '../data/travelData';
import { openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';

export type TravelerSubTab = 'account' | 'orders' | 'documents';

interface TravelerWorkspaceScreenProps {
  activeTraveler: TravelerProfile | null;
  subTab: TravelerSubTab;
  onChangeSubTab: (tab: TravelerSubTab) => void;
  draft: TravelerProfileDraft;
  onUpdateDraft: (updater: (prev: TravelerProfileDraft) => TravelerProfileDraft) => void;
  onResetDraft: () => void;
  pendingOtpPhone: string | null;
  onSetPendingOtpPhone: (phone: string | null) => void;
  magicLinkFeedback?: string | null;
  onClearMagicLinkFeedback?: () => void;
  onNavigateToAiScanner?: () => void;
  onNavigateToServices?: () => void;
  onGoHome?: () => void;
}

export const TravelerWorkspaceScreen: React.FC<TravelerWorkspaceScreenProps> = ({
  activeTraveler,
  subTab,
  onChangeSubTab,
  draft,
  onUpdateDraft,
  onResetDraft,
  pendingOtpPhone,
  onSetPendingOtpPhone,
  magicLinkFeedback,
  onClearMagicLinkFeedback,
  onNavigateToAiScanner,
  onNavigateToServices,
  onGoHome,
}) => {
  const { lang, isAr, dir, t } = useLanguage();
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  // Logged-out Step 1 inputs (Split First + Last Name + WhatsApp)
  const [loginFirstName, setLoginFirstName] = useState('');
  const [loginLastName, setLoginLastName] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [authError, setAuthError] = useState('');
  const [isInitiatingOtp, setIsInitiatingOtp] = useState(false);

  // Logged-out Step 2 OTP unlock
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Wallet & Account Form controls
  const [docLabel, setDocLabel] = useState(t('صورة جواز السفر', 'Passport Copy'));
  const [docType, setDocType] = useState<TravelerDocument['docType']>('passport');
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isExtractingPassport, setIsExtractingPassport] = useState(false);
  const [passportExtractFeedback, setPassportExtractFeedback] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);
  const [previewLightbox, setPreviewLightbox] = useState<{ label: string; dataUrl: string } | null>(
    null
  );

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const accountPassportInputRef = useRef<HTMLInputElement>(null);
  const walletFileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: Initiate fresh 6-digit OTP in Firestore without displaying it
  const handleInitiateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setOtpError('');
    onClearMagicLinkFeedback?.();

    const cleanFirst = loginFirstName.trim();
    const cleanLast = loginLastName.trim();
    const normalized = normalizePhone(loginPhone);

    if (!cleanFirst || !cleanLast || normalized.length < 8) {
      setAuthError(
        t(
          'يرجى إدخال الاسم الأول والاسم الأخير (حسب الجواز) ورقم واتساب صحيح.',
          'Please enter your First Name, Last Name (as on passport), and a valid WhatsApp number.'
        )
      );
      return;
    }

    setIsInitiatingOtp(true);
    try {
      const res = await initiateTravelerOtpLoginCloud(cleanFirst, cleanLast, loginPhone);
      if (!res.ok || !res.phone) {
        setAuthError(res.error || t('تعذر بدء تسجيل الدخول.', 'Could not start login.'));
        return;
      }
      onSetPendingOtpPhone(res.phone);
      setOtpInput('');
    } finally {
      setIsInitiatingOtp(false);
    }
  };

  // Step 2: Request Login OTP cleanly via WhatsApp (zero-leak / anti-spoofing exact message)
  const handleRequestWhatsAppOtp = () => {
    openWhatsApp(buildClientWhatsAppRequestMessage(lang));
  };

  // Step 2: Submit 6-digit OTP to unlock session
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingOtpPhone) return;
    setOtpError('');

    const cleanOtp = normalizeArabicDigits(otpInput).replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setOtpError(
        t('يرجى إدخال كود الدخول المكون من 6 أرقام.', 'Please enter the 6-digit login code.')
      );
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const res = await verifyLoginOtpCloud(pendingOtpPhone, cleanOtp, lang);
      if (!res.ok) {
        setOtpError(res.error || t('كود الدخول غير صحيح.', 'Invalid login code.'));
        return;
      }
      setOtpInput('');
      onSetPendingOtpPhone(null);
      onChangeSubTab('account');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleLogout = () => {
    setActiveTravelerPhone(null);
    onSetPendingOtpPhone(null);
    onResetDraft();
    setOtpInput('');
    setAuthError('');
    setOtpError('');
    setSaveFeedback(null);
    setPassportExtractFeedback(null);
    onGoHome?.();
  };

  // AI OCR Extraction updating lifted draft immediately (and preserving across navigation)
  const runAutoPassportExtractionIntoDraft = async (base64: string, mimeType: string) => {
    setIsExtractingPassport(true);
    setPassportExtractFeedback(null);
    try {
      const response = await fetch('/api/passport-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          visaType: draft.preferredVisaType,
          lang,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        setPassportExtractFeedback({
          type: 'info',
          text: t(
            'تم إرفاق صورة الجواز في المسودة. يمكنك مراجعة أو كتابة رقم الجواز والاسم يدوياً ثم الضغط على "حفظ البيانات".',
            'Passport scan staged in draft. You can type or adjust passport details above and click Save Data.'
          ),
        });
        return;
      }

      const data = (await response.json()) as { result?: PassportAiCheckResult };
      const extracted = data.result;
      if (!extracted) return;

      const cleanPassportNo = (extracted.passportNumber || '').trim().toUpperCase();
      const extractedFullName = (extracted.fullName || '').trim();
      const nameParts = extractedFullName ? splitPassportName(extractedFullName) : null;

      onUpdateDraft((prev) => ({
        ...prev,
        ...(cleanPassportNo ? { passportNumber: cleanPassportNo } : {}),
        ...(extractedFullName ? { passportFullName: extractedFullName } : {}),
        ...(nameParts?.firstName ? { firstName: nameParts.firstName } : {}),
        ...(nameParts?.lastName ? { lastName: nameParts.lastName } : {}),
        ...(extracted.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(extracted.expiryDate)
          ? { passportExpiryDate: extracted.expiryDate }
          : {}),
        ...(extracted.nationality && extracted.nationality.trim()
          ? { nationality: extracted.nationality.trim() }
          : {}),
        isDirty: true,
      }));

      if (cleanPassportNo || extractedFullName) {
        setPassportExtractFeedback({
          type: 'success',
          text: t(
            `تم قراءة بيانات الجواز وتحديث المسودة تلقائياً (${cleanPassportNo || extractedFullName}). اضغط "حفظ البيانات" للاعتماد النهائي.`,
            `Passport details auto-extracted into draft (${cleanPassportNo || extractedFullName}). Click Save Data to commit.`
          ),
        });
      } else {
        setPassportExtractFeedback({
          type: 'info',
          text: t(
            'تم إرفاق صورة الجواز، ولم يظهر رقم الجواز بوضوح كافٍ. يرجى كتابته يدوياً أو رفع صورة أوضح.',
            'Passport image attached, but passport number was not clearly legible. Please enter it manually or upload a clearer photo.'
          ),
        });
      }
    } catch {
      setPassportExtractFeedback({
        type: 'info',
        text: t(
          'تم إرفاق صورة الجواز في المسودة. يرجى كتابة رقم الجواز يدوياً ثم الضغط على "حفظ البيانات".',
          'Passport image staged in draft. Please enter your passport number manually and click Save Data.'
        ),
      });
    } finally {
      setIsExtractingPassport(false);
    }
  };

  const handleStageAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveFeedback(null);
    try {
      const compressed = await compressImageToDataUrl(file, 520, 0.8);
      onUpdateDraft((prev) => ({
        ...prev,
        pendingAvatarPreviewUrl: compressed.dataUrl,
        isDirty: true,
      }));
    } catch {
      setSaveFeedback({
        type: 'error',
        text: t(
          'تعذر معالجة الصورة الشخصية. يرجى اختيار صورة بصيغة JPG أو PNG.',
          'Could not process personal photo. Please select a valid JPG or PNG file.'
        ),
      });
    }
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleStagePassportPhotoFromAccount = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveFeedback(null);
    try {
      const compressed = await compressImageToDataUrl(file, 1100, 0.76);
      const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      onUpdateDraft((prev) => ({
        ...prev,
        pendingDocuments: [
          {
            id: docId,
            label: t('صورة جواز السفر', 'Passport Copy'),
            docType: 'passport',
            fileName: file.name || 'passport.jpg',
            dataUrl: compressed.dataUrl,
          },
          ...prev.pendingDocuments,
        ],
        isDirty: true,
      }));
      void runAutoPassportExtractionIntoDraft(compressed.base64, compressed.mimeType);
    } catch {
      setSaveFeedback({
        type: 'error',
        text: t(
          'تعذر قراءة صورة جواز السفر. يرجى المحاولة بصورة أوضح.',
          'Could not read passport photo. Please try a valid image.'
        ),
      });
    }
    if (accountPassportInputRef.current) accountPassportInputRef.current.value = '';
  };

  const handleStageWalletDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveFeedback(null);
    try {
      const compressed = await compressImageToDataUrl(file, 1100, 0.76);
      const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      onUpdateDraft((prev) => ({
        ...prev,
        pendingDocuments: [
          {
            id: docId,
            label: docLabel.trim() || t('مستند مسافر', 'Traveler Document'),
            docType,
            fileName: file.name || 'document.jpg',
            dataUrl: compressed.dataUrl,
          },
          ...prev.pendingDocuments,
        ],
        isDirty: true,
      }));

      if (docType === 'passport') {
        void runAutoPassportExtractionIntoDraft(compressed.base64, compressed.mimeType);
      }
    } catch {
      setSaveFeedback({
        type: 'error',
        text: t(
          'تعذر ضغط الصورة المختارة.',
          'Could not compress selected image.'
        ),
      });
    }
    if (walletFileInputRef.current) walletFileInputRef.current.value = '';
  };

  const handleRemoveDocument = (docId: string, isPendingStaged: boolean) => {
    setSaveFeedback(null);
    onUpdateDraft((prev) => {
      if (isPendingStaged) {
        return {
          ...prev,
          pendingDocuments: prev.pendingDocuments.filter((d) => d.id !== docId),
          isDirty: true,
        };
      }
      return {
        ...prev,
        removedDocIds: prev.removedDocIds.includes(docId)
          ? prev.removedDocIds
          : [...prev.removedDocIds, docId],
        isDirty: true,
      };
    });
  };

  // Compute merged document list reflecting uncommitted draft additions & removals
  const committedKeptDocs = (activeTraveler?.documents || []).filter(
    (d) => !draft.removedDocIds.includes(d.id)
  );
  const combinedDocuments = [
    ...draft.pendingDocuments.map((d) => ({ ...d, isStaged: true })),
    ...committedKeptDocs.map((d) => ({ ...d, isStaged: false })),
  ];

  const effectiveAvatarUrl = draft.pendingAvatarPreviewUrl || activeTraveler?.avatarUrl || '';
  const hasPassportScan = combinedDocuments.some((d) => d.docType === 'passport');
  const latestPassportScan = combinedDocuments.find((d) => d.docType === 'passport');

  const handleCommitSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeTraveler) return;
    setSaveFeedback(null);

    const missingFields: string[] = [];
    if (!draft.firstName.trim()) missingFields.push(t('الاسم الأول', 'First Name'));
    if (!draft.lastName.trim()) missingFields.push(t('الاسم الأخير', 'Last Name'));
    if (!draft.passportNumber.trim()) missingFields.push(t('رقم جواز السفر', 'Passport Number'));
    if (!hasPassportScan) missingFields.push(t('صورة جواز السفر', 'Passport Photo'));
    if (!effectiveAvatarUrl) missingFields.push(t('الصورة الشخصية', 'Personal Photo'));

    if (missingFields.length > 0) {
      setSaveFeedback({
        type: 'error',
        text: t(
          `يرجى استكمال الحقول الإلزامية قبل الحفظ: ${missingFields.join('، ')}.`,
          `Please complete required fields before saving: ${missingFields.join(', ')}.`
        ),
      });
      if (subTab !== 'account') {
        onChangeSubTab('account');
      }
      return;
    }

    setIsSavingAll(true);
    try {
      await commitTravelerProfileDraftCloud(activeTraveler.phone, draft);
      onResetDraft();
      setSaveFeedback({
        type: 'success',
        text: t(
          'تم حفظ جميع بياناتك وصورك بنجاح ومزامنتها سحابياً.',
          'All profile details and photos have been saved and synced.'
        ),
      });
      setTimeout(() => setSaveFeedback(null), 4000);
    } catch {
      setSaveFeedback({
        type: 'error',
        text: t(
          'حدث خطأ أثناء الحفظ السحابي. يرجى المحاولة مرة أخرى.',
          'An error occurred while saving to cloud. Please try again.'
        ),
      });
    } finally {
      setIsSavingAll(false);
    }
  };

  // Clean emoji-free WhatsApp follow-up message
  const handleSendWalletSummaryWhatsApp = () => {
    if (!activeTraveler) return;
    const names = getTravelerDisplayNames(activeTraveler);
    const displayName =
      `${draft.firstName || names.firstName} ${draft.lastName || names.lastName}`.trim() ||
      activeTraveler.name;
    const msg =
      lang === 'en'
        ? `Hello Masarik Tourism, I am contacting you regarding my Traveler Profile:
• Name: ${displayName}
• WhatsApp: ${formatPhoneForDisplay(activeTraveler.phone)}
• Passport No: ${draft.passportNumber || activeTraveler.passportNumber || 'Not set'}
• Expiry Date: ${draft.passportExpiryDate || activeTraveler.passportExpiryDate || 'Not set'}
• Documents Saved: ${combinedDocuments.length}
• Current Status: ${translateOrderStatus(activeTraveler.orderStatus, 'en')}
Please advise on the next steps for my application.`
        : `السلام عليكم، أتواصل من حسابي في ملف المسافر بمنصة مسارك للإنجاز السياحي:
• الاسم: ${displayName}
• رقم الواتساب: ${formatPhoneForDisplay(activeTraveler.phone)}
• رقم الجواز: ${draft.passportNumber || activeTraveler.passportNumber || 'غير مسجل'}
• انتهاء الجواز: ${draft.passportExpiryDate || activeTraveler.passportExpiryDate || 'غير مسجل'}
• المستندات بالمحفظة: ${combinedDocuments.length}
• الحالة الحالية: ${activeTraveler.orderStatus}
أرجو متابعة طلبي وإفادتي بالخطوات القادمة.`;
    openWhatsApp(msg);
  };

  // ==================== LOGGED-OUT FULL-PAGE LOGIN & ZERO-LEAK OTP VIEW ====================
  if (!activeTraveler) {
    return (
      <div className="min-h-[75vh] bg-[#FAF9F6] pb-24 md:pb-16 pt-6 px-3 sm:px-4" dir={dir}>
        <div className="max-w-lg mx-auto space-y-4">
          {magicLinkFeedback && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-950 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{magicLinkFeedback}</span>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Clean Navy/Gold Header */}
            <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] text-white p-5 sm:p-6 border-b-2 border-[#C6A052]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#C6A052]/20 border border-[#C6A052]/60 text-[#E5C887] flex items-center justify-center shrink-0">
                    {pendingOtpPhone ? (
                      <KeyRound className="w-5 h-5" />
                    ) : (
                      <UserCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-base sm:text-lg font-black text-white">
                      {pendingOtpPhone
                        ? t('إدخال كود الدخول عبر واتساب', 'Enter WhatsApp Login Code')
                        : t('دخول أو إنشاء ملف المسافر', 'Traveler Profile Sign In')}
                    </h1>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {pendingOtpPhone
                        ? t(
                            'تحقق من هويتك بكود الدخول المرسل لرقمك لفتح الحساب',
                            'Verify your login code to unlock your Traveler Profile'
                          )
                        : t(
                            'بوابة المسافر الموثقة لرفع الجواز ومتابعة حالة التأشيرة',
                            'Verified portal for passport wallet and live visa tracking'
                          )}
                    </p>
                  </div>
                </div>

                {onGoHome && (
                  <button
                    type="button"
                    onClick={onGoHome}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <BackArrow className="w-3.5 h-3.5" />
                    <span>{t('الرئيسية', 'Home')}</span>
                  </button>
                )}
              </div>
            </div>

            {!pendingOtpPhone ? (
              /* STEP 1: Split First + Last Name + WhatsApp */
              <form onSubmit={handleInitiateLogin} className="p-5 sm:p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 leading-relaxed">
                  {t(
                    'لضمان أمان بياناتك، يتم إصدار كود دخول جديد في كل جلسة. أدخل الاسم الأول والأخير مطابقين لجواز السفر ورقم الواتساب للمتابعة.',
                    'For your account security, a fresh login code is issued for each session. Enter your first and last name matching your passport and your WhatsApp number.'
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الأول (حسب الجواز)', 'First Name (as on passport)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={loginFirstName}
                      onChange={(e) => setLoginFirstName(e.target.value)}
                      placeholder={t('مثال: أحمد', 'e.g. Ahmed')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الأخير (حسب الجواز)', 'Last Name (as on passport)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={loginLastName}
                      onChange={(e) => setLoginLastName(e.target.value)}
                      placeholder={t('مثال: محمد علي', 'e.g. Mohamed Ali')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                    {t('رقم الواتساب', 'WhatsApp Number')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  />
                </div>

                {authError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isInitiatingOtp}
                  className="w-full min-h-[46px] py-3 px-4 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
                >
                  {isInitiatingOtp && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t('متابعة وإصدار كود الدخول', 'Continue & Issue Login Code')}</span>
                </button>
              </form>
            ) : (
              /* STEP 2: Strict Zero-Leak OTP Verification */
              <div className="p-5 sm:p-6 space-y-5">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-center">
                  <span className="text-xs font-bold text-slate-500 block">
                    {t('رقم الواتساب المسجل للدخول', 'Registered WhatsApp Number')}
                  </span>
                  <span className="text-base font-black text-[#0F2438] tabular-nums block" dir="ltr">
                    {formatPhoneForDisplay(pendingOtpPhone)}
                  </span>
                  <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                    {t(
                      'اضغط على الزر الأخضر أدناه لطلب كود الدخول عبر واتساب، ثم أدخل الكود المكون من 6 أرقام لفتح ملف المسافر.',
                      'Tap the green button below to request your login code via WhatsApp, then enter the 6-digit code to unlock your account.'
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRequestWhatsAppOtp}
                  className="w-full min-h-[46px] py-3 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  <WhatsAppIcon className="w-4.5 h-4.5 shrink-0" variant="white" />
                  <span>{t('طلب كود الدخول عبر واتساب', 'Request Login Code via WhatsApp')}</span>
                </button>

                <form onSubmit={handleVerifyOtpSubmit} className="space-y-3 pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-[#0F2438]">
                    {t('أدخل كود الدخول المكون من 6 أرقام', 'Enter 6-Digit Login Code')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    placeholder="______"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-center text-lg font-black tracking-[0.4em] text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C6A052]"
                  />

                  {otpError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                      {otpError}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="submit"
                      disabled={isVerifyingOtp}
                      className="flex-1 min-h-[46px] py-2.5 px-4 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      {isVerifyingOtp && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>{t('تأكيد ودخول الحساب', 'Verify & Enter Account')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onSetPendingOtpPhone(null);
                        setOtpInput('');
                        setOtpError('');
                      }}
                      className="min-h-[46px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      {t('تغيير الرقم', 'Change Number')}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== LOGGED-IN FULL-PAGE TRAVELER WORKSPACE ====================
  const names = getTravelerDisplayNames(activeTraveler);
  const headerDisplayName =
    `${draft.firstName || names.firstName} ${draft.lastName || names.lastName}`.trim() ||
    activeTraveler.name;
  const currentStatusIdx = Math.max(0, VISA_ORDER_STATUSES.indexOf(activeTraveler.orderStatus));

  return (
    <div className="min-h-[80vh] bg-[#FAF9F6] pb-24 md:pb-16 pt-5 px-3 sm:px-4" dir={dir}>
      <div className="max-w-5xl mx-auto space-y-5">
        {magicLinkFeedback && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{magicLinkFeedback}</span>
            </div>
            {onClearMagicLinkFeedback && (
              <button
                type="button"
                onClick={onClearMagicLinkFeedback}
                className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
                aria-label={t('إغلاق', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Traveler Profile Summary Header Card */}
        <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] text-white rounded-3xl p-4 sm:p-6 border border-[#C6A052]/60 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              {effectiveAvatarUrl ? (
                <img
                  src={effectiveAvatarUrl}
                  alt={headerDisplayName}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-[#C6A052] bg-white shadow-sm"
                />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/10 border-2 border-[#C6A052]/70 text-[#E5C887] flex items-center justify-center">
                  <UserCheck className="w-7 h-7" />
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  onChangeSubTab('account');
                  setTimeout(() => avatarInputRef.current?.click(), 80);
                }}
                className="absolute -bottom-1 -end-1 w-6 h-6 rounded-full bg-[#C6A052] text-[#0A1926] flex items-center justify-center border border-white shadow-xs cursor-pointer"
                title={t('تغيير الصورة الشخصية', 'Change Personal Photo')}
                aria-label={t('تغيير الصورة الشخصية', 'Change Personal Photo')}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-xl font-black text-white truncate">
                  {headerDisplayName}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-[11px] font-bold text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('حساب موثق', 'Verified')}</span>
                </span>
                {draft.isDirty && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/60 text-[11px] font-bold text-amber-200">
                    {t('تعديلات غير محفوظة', 'Unsaved Draft')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 tabular-nums" dir="ltr">
                {formatPhoneForDisplay(activeTraveler.phone)} · +
                {activeTraveler.phoneNormalized || activeTraveler.phone}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSendWalletSummaryWhatsApp}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
            >
              <WhatsAppIcon className="w-4 h-4" variant="white" />
              <span>{t('متابعة عبر واتساب', 'Follow Up on WhatsApp')}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-red-600/90 text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('خروج', 'Sign Out')}</span>
            </button>
          </div>
        </div>

        {/* Workspace Internal Section Switcher */}
        <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => onChangeSubTab('account')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              subTab === 'account'
                ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-4 h-4 shrink-0" />
            <span>{t('بيانات الحساب', 'Account Info')}</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeSubTab('orders')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              subTab === 'orders'
                ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span>{t('طلباتي وحالة التأشيرة', 'My Orders')}</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeSubTab('documents')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              subTab === 'documents'
                ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>
              {t(
                `محفظة المستندات (${combinedDocuments.length})`,
                `Documents (${combinedDocuments.length})`
              )}
            </span>
          </button>
        </div>

        {saveFeedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center gap-2 ${
              saveFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {saveFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{saveFeedback.text}</span>
          </div>
        )}

        {/* SUB-TAB 1: ACCOUNT INFO & MANDATORY PASSPORT / AVATAR */}
        {subTab === 'account' && (
          <form onSubmit={handleCommitSaveAll} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Mandatory Personal Photo Card */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div>
                  <h2 className="text-sm font-black text-[#0F2438]">
                    {t('الصورة الشخصية', 'Personal Profile Photo')}{' '}
                    <span className="text-red-500">*</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t(
                      'تظهر بجانب اسمك في الهيدر وملفك لدى إدارة مسارك',
                      'Displayed next to your name in the header and admin file'
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-3 py-2">
                  {effectiveAvatarUrl ? (
                    <img
                      src={effectiveAvatarUrl}
                      alt={headerDisplayName}
                      className="w-28 h-28 rounded-full object-cover border-4 border-[#C6A052] shadow-sm bg-slate-100"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 gap-1">
                      <Camera className="w-7 h-7" />
                      <span className="text-[11px] font-bold">{t('بدون صورة', 'No Photo')}</span>
                    </div>
                  )}

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleStageAvatar}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {effectiveAvatarUrl
                        ? t('تغيير الصورة الشخصية', 'Change Personal Photo')
                        : t('رفع الصورة الشخصية (إلزامي)', 'Upload Personal Photo (Required)')}
                    </span>
                  </button>
                </div>

                {/* Mandatory Passport Photo Quick-Upload Box */}
                <div className="pt-4 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-black text-[#0F2438]">
                      {t('صورة جواز السفر', 'Passport Photo')}{' '}
                      <span className="text-red-500">*</span>
                    </h3>
                    {hasPassportScan ? (
                      <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {t('مرفقة', 'Attached')}
                      </span>
                    ) : (
                      <span className="text-[10.5px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        {t('مطلوبة', 'Required')}
                      </span>
                    )}
                  </div>

                  <input
                    ref={accountPassportInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleStagePassportPhotoFromAccount}
                    className="hidden"
                  />

                  {latestPassportScan && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center gap-2.5">
                      <img
                        src={latestPassportScan.dataUrl}
                        alt={latestPassportScan.label}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-[#0F2438] block truncate">
                          {latestPassportScan.label}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate">
                          {latestPassportScan.fileName}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewLightbox({
                            label: latestPassportScan.label,
                            dataUrl: latestPassportScan.dataUrl,
                          })
                        }
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#0F2438] hover:bg-slate-200 cursor-pointer"
                        title={t('معاينة', 'Inspect')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => accountPassportInputRef.current?.click()}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {hasPassportScan
                        ? t('رفع / تحديث صورة الجواز (OCR)', 'Update Passport Scan (OCR)')
                        : t('رفع صورة جواز السفر الآن (إلزامي)', 'Upload Passport Photo (Required)')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Account & Passport Details Form */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                      {t('البيانات الأساسية وبيانات جواز السفر', 'Account & Mandatory Passport Details')}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {t(
                        'تتحدث البيانات تلقائياً عند رفع صورة الجواز أو يمكنك تعديلها يدوياً في أي وقت',
                        'Fields auto-populate when uploading your passport scan or can be edited anytime'
                      )}
                    </p>
                  </div>

                  {onNavigateToAiScanner && (
                    <button
                      type="button"
                      onClick={onNavigateToAiScanner}
                      className="text-xs font-bold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      <span>{t('فتح فاحص الجواز الشامل', 'Open Full AI Scanner')}</span>
                    </button>
                  )}
                </div>

                {isExtractingPassport && (
                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-[#0284C7] animate-spin shrink-0" />
                    <span>
                      {t(
                        'جاري قراءة الاسم ورقم جواز السفر وتاريخ الانتهاء تلقائياً بالذكاء الاصطناعي...',
                        'Extracting first name, last name, passport number & expiry via AI...'
                      )}
                    </span>
                  </div>
                )}

                {passportExtractFeedback && !isExtractingPassport && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                      passportExtractFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>{passportExtractFeedback.text}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الأول (حسب الجواز)', 'First Name (as on passport)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={draft.firstName}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          firstName: e.target.value,
                          isDirty: true,
                        }))
                      }
                      placeholder={t('الاسم الأول', 'First Name')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الأخير (حسب الجواز)', 'Last Name (as on passport)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={draft.lastName}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          lastName: e.target.value,
                          isDirty: true,
                        }))
                      }
                      placeholder={t('الاسم الأخير / اللقب', 'Last Name / Surname')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('رقم جواز السفر', 'Passport Number')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={draft.passportNumber}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          passportNumber: e.target.value.toUpperCase(),
                          isDirty: true,
                        }))
                      }
                      placeholder="A12345678"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums uppercase focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الكامل بالإنجليزية في الجواز', 'Full Passport Name (Latin)')}
                    </label>
                    <input
                      type="text"
                      value={draft.passportFullName}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          passportFullName: e.target.value,
                          isDirty: true,
                        }))
                      }
                      placeholder="AHMED MOHAMED ALI"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('تاريخ انتهاء جواز السفر', 'Passport Expiry Date')}
                    </label>
                    <input
                      type="date"
                      value={draft.passportExpiryDate}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          passportExpiryDate: e.target.value,
                          isDirty: true,
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('الجنسية', 'Nationality')}
                    </label>
                    <input
                      type="text"
                      value={draft.nationality}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          nationality: e.target.value,
                          isDirty: true,
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('نوع التأشيرة / الخدمة المفضلة', 'Preferred Visa / Service')}
                    </label>
                    <input
                      type="text"
                      value={draft.preferredVisaType}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          preferredVisaType: e.target.value,
                          isDirty: true,
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>
                </div>

                {/* Action Bar: Save Data / Cancel Draft */}
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={isSavingAll}
                    className="min-h-[44px] px-5 py-2.5 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    {isSavingAll ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>
                      {isSavingAll
                        ? t('جاري الحفظ والمزامنة...', 'Saving & Syncing...')
                        : t('حفظ البيانات', 'Save Data')}
                    </span>
                  </button>

                  {draft.isDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        onResetDraft();
                        setSaveFeedback(null);
                      }}
                      className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{t('إلغاء التعديلات غير المحفوظة', 'Discard Draft Changes')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        )}

        {/* SUB-TAB 2: MY ORDERS & VISA TRACKER */}
        {subTab === 'orders' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#0284C7]/10 text-[#0284C7] flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                      {t('متابعة حالة المعاملة والتأشيرة', 'Visa & Application Status Tracker')}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {draft.preferredVisaType ||
                        activeTraveler.preferredVisaType ||
                        t('تأشيرة زيارة / تساهيل السعودية', 'Saudi Visit Visa / VFS Tasheer')}
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#0F2438] text-[#E5C887] text-xs font-black">
                  {translateOrderStatus(activeTraveler.orderStatus, lang)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {VISA_ORDER_STATUSES.map((st, idx) => {
                  const done = idx <= currentStatusIdx;
                  const current = idx === currentStatusIdx;
                  return (
                    <div
                      key={st}
                      className={`p-3.5 rounded-2xl border text-center transition ${
                        current
                          ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438] shadow-sm'
                          : done
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}
                    >
                      <span className="text-xs font-black block tabular-nums mb-1">0{idx + 1}</span>
                      <span className="text-xs font-bold leading-snug block">
                        {translateOrderStatus(st, lang)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {activeTraveler.adminNotes ? (
                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-xs sm:text-sm text-[#0F2438]">
                  <span className="font-black block mb-1">
                    {t('ملاحظة وتحديث من إدارة مسارك:', 'Update & Note from Masarik Team:')}
                  </span>
                  <p className="leading-relaxed text-slate-700">{activeTraveler.adminNotes}</p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500">
                  {t(
                    'لا توجد ملاحظات إضافية مسجلة حالياً. سيتم إشعارك فور تحديد موعد تساهيل أو صدور تحديث جديد.',
                    'No additional notes posted yet. Updates appear here automatically once reviewed by our team.'
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSendWalletSummaryWhatsApp}
                  className="min-h-[44px] px-5 py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer"
                >
                  <WhatsAppIcon className="w-4.5 h-4.5" variant="white" />
                  <span>{t('استفسار عن حالة طلبي عبر واتساب', 'Inquire About Order via WhatsApp')}</span>
                </button>

                {onNavigateToServices && (
                  <button
                    type="button"
                    onClick={onNavigateToServices}
                    className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#0F2438] rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer"
                  >
                    {t('تصفح الخدمات وحجز خدمة جديدة', 'Browse & Request New Service')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 3: DOCUMENT WALLET WITH PERSISTENT DRAFTING */}
        {subTab === 'documents' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                  {t(
                    `محفظة المستندات والصور (${combinedDocuments.length})`,
                    `Traveler Document Wallet (${combinedDocuments.length})`
                  )}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t(
                    'تبقى المستندات المرفقة محفوظة مؤقتاً أثناء تنقلك بين الأقسام حتى تضغط على "حفظ البيانات"',
                    'Attached documents stay preserved across tab navigation until you click Save Data'
                  )}
                </p>
              </div>
            </div>

            {/* Attach New Document Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
              <select
                value={docType}
                onChange={(e) => {
                  const val = e.target.value as TravelerDocument['docType'];
                  setDocType(val);
                  if (val === 'passport') setDocLabel(t('صورة جواز السفر', 'Passport Copy'));
                  else if (val === 'photo')
                    setDocLabel(t('صورة شخصية بخلفية بيضاء', 'White-Background Photo'));
                  else if (val === 'visa')
                    setDocLabel(t('نسخة التأشيرة / باركود تساهيل', 'Visa / Tasheer Barcode'));
                  else if (val === 'contract')
                    setDocLabel(t('عقد عمل / مستند موثق', 'Attested Contract / Certificate'));
                }}
                className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
              >
                <option value="passport">{t('جواز سفر', 'Passport')}</option>
                <option value="photo">{t('صورة شخصية', 'Personal Photo')}</option>
                <option value="visa">{t('تأشيرة / تساهيل', 'Visa / Tasheer')}</option>
                <option value="contract">{t('عقد / شهادة', 'Contract / Certificate')}</option>
                <option value="other">{t('مستند آخر', 'Other Document')}</option>
              </select>

              <input
                type="text"
                value={docLabel}
                onChange={(e) => setDocLabel(e.target.value)}
                placeholder={t('تسمية المستند', 'Document Label')}
                className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
              />

              <input
                ref={walletFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleStageWalletDoc}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => walletFileInputRef.current?.click()}
                className="min-h-[42px] px-4 py-2 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>{t('إرفاق صورة للمحفظة', 'Attach Document')}</span>
              </button>
            </div>

            {isExtractingPassport && (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-[#0284C7] animate-spin shrink-0" />
                <span>
                  {t(
                    'جاري قراءة رقم الجواز والاسم تلقائياً بالذكاء الاصطناعي...',
                    'Auto-extracting passport number & name via AI...'
                  )}
                </span>
              </div>
            )}

            {passportExtractFeedback && !isExtractingPassport && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  passportExtractFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{passportExtractFeedback.text}</span>
              </div>
            )}

            {/* Document Cards Grid */}
            {combinedDocuments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {combinedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className={`rounded-2xl p-3 border flex flex-col justify-between gap-3 ${
                      doc.isStaged
                        ? 'bg-amber-50/50 border-amber-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={doc.dataUrl}
                        alt={doc.label}
                        className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0 bg-white cursor-pointer"
                        onClick={() => setPreviewLightbox({ label: doc.label, dataUrl: doc.dataUrl })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-[#0F2438] truncate">
                            {doc.label}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {doc.fileName}
                        </span>
                        {doc.isStaged && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-[10px] font-bold text-amber-900">
                            {t('بانتظار الحفظ', 'Pending Save')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewLightbox({ label: doc.label, dataUrl: doc.dataUrl })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-[#0F2438] flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{t('عرض', 'View')}</span>
                        </button>

                        {doc.docType === 'passport' && doc.dataUrl && (
                          <button
                            type="button"
                            disabled={isExtractingPassport}
                            onClick={async () => {
                              try {
                                const b64 = await imageUrlToBase64(doc.dataUrl);
                                void runAutoPassportExtractionIntoDraft(b64, 'image/jpeg');
                              } catch {
                                // Ignore unreadable image
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 hover:bg-sky-100 text-[11px] font-bold text-[#0284C7] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{t('قراءة OCR', 'Extract OCR')}</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveDocument(doc.id, doc.isStaged)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title={t('حذف المستند', 'Delete Document')}
                        aria-label={t('حذف المستند', 'Delete Document')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <FileText className="w-6 h-6 text-slate-400" />
                <span>
                  {t('لا توجد مستندات مرفوعة حالياً في محفظتك.', 'No documents in your wallet yet.')}
                </span>
              </div>
            )}

            {/* Explicit Save / Cancel Bar when Draft has changes */}
            {draft.isDirty && (
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={isSavingAll}
                  onClick={() => void handleCommitSaveAll()}
                  className="min-h-[44px] px-5 py-2.5 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer shadow-xs"
                >
                  {isSavingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>
                    {isSavingAll
                      ? t('جاري رفع وحفظ المستندات...', 'Uploading & Saving...')
                      : t('حفظ البيانات والمستندات', 'Save Data & Documents')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onResetDraft();
                    setSaveFeedback(null);
                  }}
                  className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{t('إلغاء التعديلات', 'Cancel Changes')}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document Lightbox Preview Modal */}
      {previewLightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewLightbox(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
            dir={dir}
          >
            <div className="bg-[#0F2438] text-white px-4 py-3 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-black truncate">{previewLightbox.label}</span>
              <button
                type="button"
                onClick={() => setPreviewLightbox(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                aria-label={t('إغلاق', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewLightbox.dataUrl}
                alt={previewLightbox.label}
                className="max-h-[68vh] w-auto object-contain rounded-xl shadow-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

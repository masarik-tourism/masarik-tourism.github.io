import React, { useEffect, useRef, useState } from 'react';
import {
  X,
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
} from 'lucide-react';
import { TravelerDocument, TravelerProfile } from '../types/travel';
import {
  VISA_ORDER_STATUSES,
  TRAVELERS_UPDATED_EVENT,
  addDocumentToTraveler,
  buildClientWhatsAppRequestMessage,
  compressImageToDataUrl,
  formatPhoneForDisplay,
  getActiveTraveler,
  normalizePhone,
  registerOrLoginTraveler,
  removeDocumentFromTraveler,
  setActiveTravelerPhone,
  updateTravelerProfileDetails,
  verifyManualOtp,
} from '../utils/travelerStore';
import { translateOrderStatus } from '../data/travelData';
import { openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface TravelerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  magicLinkFeedback?: string | null;
  onNavigateToAiScanner?: () => void;
}

export const TravelerProfileModal: React.FC<TravelerProfileModalProps> = ({
  isOpen,
  onClose,
  magicLinkFeedback,
  onNavigateToAiScanner,
}) => {
  const { lang, dir, t } = useLanguage();
  const [activeTraveler, setActiveTraveler] = useState<TravelerProfile | null>(() =>
    getActiveTraveler()
  );

  // Outer Simple Login Inputs (ONLY Name + WhatsApp)
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Internal Verification Modal state (inside Traveler Profile)
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifySuccessMsg, setVerifySuccessMsg] = useState('');

  // Wallet / Profile detail inputs
  const [passportFullName, setPassportFullName] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [passportExpiryDate, setPassportExpiryDate] = useState('');
  const [nationality, setNationality] = useState(t('مصري', 'Egyptian'));
  const [preferredVisaType, setPreferredVisaType] = useState(
    t('تأشيرة زيارة / تساهيل السعودية', 'Saudi Visit Visa / VFS Tasheer')
  );
  const [docLabel, setDocLabel] = useState(t('صورة جواز السفر', 'Passport Copy'));
  const [docType, setDocType] = useState<TravelerDocument['docType']>('passport');
  const [profileSavedMsg, setProfileSavedMsg] = useState('');
  const walletFileInputRef = useRef<HTMLInputElement>(null);

  const syncFromStore = () => {
    const current = getActiveTraveler();
    setActiveTraveler(current);
    if (current) {
      setPassportFullName(current.passportFullName || '');
      setPassportNumber(current.passportNumber || '');
      setPassportExpiryDate(current.passportExpiryDate || '');
      setNationality(current.nationality || (lang === 'en' ? 'Egyptian' : 'مصري'));
      setPreferredVisaType(
        current.preferredVisaType ||
          (lang === 'en' ? 'Saudi Visit Visa / VFS Tasheer' : 'تأشيرة زيارة / تساهيل السعودية')
      );
    }
  };

  useEffect(() => {
    if (isOpen) {
      syncFromStore();
      setAuthError('');
      setVerifyError('');
      setVerifySuccessMsg('');
      setProfileSavedMsg('');
    }
  }, [isOpen, lang]);

  useEffect(() => {
    const onUpdate = () => syncFromStore();
    window.addEventListener(TRAVELERS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(TRAVELERS_UPDATED_EVENT, onUpdate);
  }, []);

  if (!isOpen) return null;

  // Clean Outer Login / Create Account (NO OTP asked outside)
  const handleOuterLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const normalized = normalizePhone(phoneInput);
    if (!nameInput.trim() || normalized.length < 8) {
      setAuthError(
        t(
          'يرجى إدخال الاسم الكامل ورقم واتساب صحيح.',
          'Please enter your full name and a valid WhatsApp number.'
        )
      );
      return;
    }

    registerOrLoginTraveler(nameInput, phoneInput);
    syncFromStore();
    setVerifyModalOpen(false);
    setVerifyError('');
    setVerifySuccessMsg('');
  };

  // Inside Profile: Open WhatsApp to get 6-digit code or direct activation link
  const handleRequestWhatsAppActivation = () => {
    if (!activeTraveler) return;
    const msg = buildClientWhatsAppRequestMessage(
      activeTraveler.name,
      activeTraveler.phone,
      activeTraveler.otp,
      lang
    );
    openWhatsApp(msg);
  };

  // Inside Profile Verification Modal: Submit 6-digit OTP
  const handleVerifyOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTraveler) return;
    setVerifyError('');
    setVerifySuccessMsg('');

    const res = verifyManualOtp(activeTraveler.phone, otpInput, lang);
    if (!res.ok || !res.profile) {
      setVerifyError(
        res.error || t('تعذر التحقق من الكود.', 'Could not verify the code.')
      );
      return;
    }

    setOtpInput('');
    syncFromStore();
    setVerifyModalOpen(false);
    setVerifySuccessMsg(
      t(
        'تم توثيق حسابك بنجاح! مرحباً بك في ملف المسافر.',
        'Your account is now verified ✓ Welcome to your Traveler Profile.'
      )
    );
  };

  const handleLogout = () => {
    setActiveTravelerPhone(null);
    setVerifyModalOpen(false);
    setOtpInput('');
    setVerifyError('');
    setVerifySuccessMsg('');
    setAuthError('');
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTraveler) return;
    updateTravelerProfileDetails(activeTraveler.phone, {
      passportFullName: passportFullName.trim(),
      passportNumber: passportNumber.trim().toUpperCase(),
      passportExpiryDate,
      nationality: nationality.trim(),
      preferredVisaType: preferredVisaType.trim(),
    });
    setProfileSavedMsg(
      t(
        'تم حفظ بيانات الجواز في محفظة المسافر بنجاح.',
        'Passport details saved to your Traveler Wallet.'
      )
    );
    setTimeout(() => setProfileSavedMsg(''), 3000);
  };

  const handleUploadWalletDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTraveler) return;
    try {
      const compressed = await compressImageToDataUrl(file, 1000, 0.72);
      addDocumentToTraveler(activeTraveler.phone, {
        label: docLabel.trim() || t('مستند مسافر', 'Traveler Document'),
        docType,
        fileName: file.name || 'document.jpg',
        dataUrl: compressed.dataUrl,
      });
      setProfileSavedMsg(
        t(
          'تم حفظ صورة المستند في محفظة المسافر.',
          'Document image saved to your Traveler Wallet.'
        )
      );
      setTimeout(() => setProfileSavedMsg(''), 3000);
    } catch {
      setProfileSavedMsg(
        t(
          'تعذر ضغط الصورة، يرجى اختيار صورة بصيغة JPG أو PNG.',
          'Could not process image. Please select a valid JPG or PNG file.'
        )
      );
    }
    if (walletFileInputRef.current) {
      walletFileInputRef.current.value = '';
    }
  };

  const handleSendWalletSummaryWhatsApp = () => {
    if (!activeTraveler) return;
    const msg =
      lang === 'en'
        ? `Hello Masarik Tourism, I am contacting you from my Traveler Profile (${
            activeTraveler.verified ? 'Verified ✓' : 'Pending Verification'
          }):
👤 *Name:* ${activeTraveler.name}
📱 *WhatsApp:* ${formatPhoneForDisplay(activeTraveler.phone)}
🛂 *Passport No:* ${passportNumber || activeTraveler.passportNumber || 'Not set'}
📅 *Passport Expiry:* ${passportExpiryDate || activeTraveler.passportExpiryDate || 'Not set'}
🗂️ *Wallet Documents:* ${activeTraveler.documents?.length || 0}
📌 *Current Status:* ${translateOrderStatus(activeTraveler.orderStatus, 'en')}
I would like to proceed with my application. Thank you.`
        : `السلام عليكم، أتواصل من حسابي في *ملف المسافر* بمنصة مسارك (${
            activeTraveler.verified ? 'حساب موثق ✓' : 'غير موثق'
          }):
👤 *الاسم:* ${activeTraveler.name}
📱 *رقم الواتساب:* ${formatPhoneForDisplay(activeTraveler.phone)}
🛂 *رقم الجواز المحفوظ:* ${passportNumber || activeTraveler.passportNumber || 'غير مسجل'}
📅 *انتهاء الجواز:* ${passportExpiryDate || activeTraveler.passportExpiryDate || 'غير مسجل'}
🗂️ *عدد المستندات بالمحفظة:* ${activeTraveler.documents?.length || 0}
📌 *الحالة الحالية بالمنصة:* ${activeTraveler.orderStatus}
أرغب في استكمال إجراءاتي. شكراً لكم.`;
    openWhatsApp(msg);
  };

  const currentStatusIdx = activeTraveler
    ? Math.max(0, VISA_ORDER_STATUSES.indexOf(activeTraveler.orderStatus))
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden text-start relative"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        {/* Header */}
        <div className="bg-[#0F2438] text-white px-5 py-4 flex items-center justify-between gap-3 border-b-2 border-[#C6A052] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-[#E5C887] flex items-center justify-center shrink-0">
              {activeTraveler?.verified ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              ) : (
                <UserCheck className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-white">
                  {activeTraveler ? activeTraveler.name : t('حسابي / ملف المسافر', 'My Account / Traveler Profile')}
                </h3>

                {/* Verification Status Badge inside Traveler Profile Header */}
                {activeTraveler && (
                  activeTraveler.verified ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-[11px] font-bold text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('حساب موثق ✓', 'Verified Account ✓')}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyError('');
                        setVerifyModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/70 text-[11px] font-bold text-amber-200 transition cursor-pointer active:scale-95"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span>{t('غير موثق — اضغط للتوثيق', 'Unverified — Click to Verify')}</span>
                    </button>
                  )
                )}
              </div>
              <p className="text-xs text-slate-300 truncate mt-0.5">
                {activeTraveler
                  ? `${t('ملف المسافر', 'Traveler Profile')} · ${formatPhoneForDisplay(activeTraveler.phone)}`
                  : t(
                      'سجّل دخولك فوراً للوصول إلى محفظة مستنداتك ومتابعة التأشيرة',
                      'Sign in instantly to access your document wallet & visa tracker'
                    )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {magicLinkFeedback && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{magicLinkFeedback}</span>
            </div>
          )}

          {verifySuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{verifySuccessMsg}</span>
            </div>
          )}

          {/* VIEW 1: Clean Outer Login/Register Screen (ONLY Name + WhatsApp + 1 Button) */}
          {!activeTraveler ? (
            <form onSubmit={handleOuterLoginSubmit} className="space-y-4 max-w-md mx-auto py-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 leading-relaxed">
                {t(
                  'أدخل اسمك الكامل ورقم الواتساب للدخول مباشرة إلى ملف المسافر وحفظ مستنداتك ومتابعة حالة التأشيرة.',
                  'Enter your full name and WhatsApp number to enter your Traveler Profile immediately, save documents, and track your visa status.'
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('الاسم الكامل', 'Full Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={t('مثال: أحمد محمد علي', 'e.g. Ahmed Mohamed Ali')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                  {t('رقم الواتساب', 'WhatsApp Number')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
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
                className="w-full min-h-[46px] py-3 px-4 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shadow-xs"
              >
                {t('دخول / إنشاء حساب', 'Login / Create Account')}
              </button>
            </form>
          ) : (
            /* VIEW 2: Logged-In Traveler Profile & Wallet */
            <div className="space-y-5">
              {/* Order Status Tracker */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#0284C7]" />
                    <h4 className="text-xs sm:text-sm font-black text-[#0F2438]">
                      {t('متابعة حالة المعاملة والتأشيرة', 'Visa & Application Status Tracker')}
                    </h4>
                  </div>
                  <span className="text-xs font-black text-[#0F2438]">
                    {translateOrderStatus(activeTraveler.orderStatus, lang)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {VISA_ORDER_STATUSES.map((st, idx) => {
                    const done = idx <= currentStatusIdx;
                    const current = idx === currentStatusIdx;
                    return (
                      <div
                        key={st}
                        className={`p-2.5 rounded-xl border text-center transition ${
                          current
                            ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438]'
                            : done
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            : 'bg-white text-slate-400 border-slate-200'
                        }`}
                      >
                        <span className="text-[10px] font-bold block tabular-nums mb-0.5">
                          0{idx + 1}
                        </span>
                        <span className="text-[11px] font-bold leading-snug block">
                          {translateOrderStatus(st, lang)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {activeTraveler.adminNotes && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
                    <span className="font-bold text-[#0F2438]">
                      {t('ملاحظة الإدارة: ', 'Admin Note: ')}
                    </span>
                    <span>{activeTraveler.adminNotes}</span>
                  </div>
                )}
              </div>

              {/* Saved Traveler Passport Details */}
              <form
                onSubmit={handleSaveDetails}
                className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs sm:text-sm font-black text-[#0F2438]">
                    {t('بيانات الجواز المحفوظة (محفظة المسافر)', 'Saved Passport Details (Traveler Wallet)')}
                  </h4>
                  {onNavigateToAiScanner && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigateToAiScanner();
                      }}
                      className="text-[11px] font-bold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      <span>
                        {t('تعبئة تلقائية بفحص الجواز بالذكاء الاصطناعي', 'Auto-fill with AI Passport Check')}
                      </span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('الاسم مطابقاً لجواز السفر', 'Full Name as on Passport')}
                    </label>
                    <input
                      type="text"
                      value={passportFullName}
                      onChange={(e) => setPassportFullName(e.target.value)}
                      placeholder="AHMED MOHAMED ALI"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('رقم جواز السفر', 'Passport Number')}
                    </label>
                    <input
                      type="text"
                      value={passportNumber}
                      onChange={(e) => setPassportNumber(e.target.value)}
                      placeholder="A12345678"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('تاريخ انتهاء الجواز', 'Passport Expiry Date')}
                    </label>
                    <input
                      type="date"
                      value={passportExpiryDate}
                      onChange={(e) => setPassportExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('الجنسية', 'Nationality')}
                    </label>
                    <input
                      type="text"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-[#E5C887]" />
                  <span>{t('حفظ بياناتي', 'Save My Details')}</span>
                </button>
              </form>

              {/* Wallet Uploaded Documents */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-[#0F2438]">
                      {t(
                        `المستندات والصور المحفوظة (${activeTraveler.documents?.length || 0})`,
                        `Saved Documents & Scans (${activeTraveler.documents?.length || 0})`
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {t(
                        'احتفظ بنسخ جوازاتك وأوراقك جاهزة لأي حجز قادم دون إعادة إرسالها كل مرة',
                        'Keep your passport and document scans ready for any future booking'
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={docType}
                    onChange={(e) => {
                      const val = e.target.value as TravelerDocument['docType'];
                      setDocType(val);
                      if (val === 'passport') setDocLabel(t('صورة جواز السفر', 'Passport Copy'));
                      else if (val === 'photo') setDocLabel(t('صورة شخصية بخلفية بيضاء', 'White-Background Photo'));
                      else if (val === 'visa') setDocLabel(t('نسخة التأشيرة / باركود تساهيل', 'Visa / Tasheer Barcode'));
                      else if (val === 'contract') setDocLabel(t('عقد عمل / مستند موثق', 'Attested Contract / Certificate'));
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
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
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
                  />

                  <input
                    ref={walletFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadWalletDoc}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => walletFileInputRef.current?.click()}
                    className="min-h-[38px] px-3 py-2 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t('إرفاق صورة للمحفظة', 'Attach Image to Wallet')}</span>
                  </button>
                </div>

                {profileSavedMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                    {profileSavedMsg}
                  </div>
                )}

                {activeTraveler.documents && activeTraveler.documents.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {activeTraveler.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center gap-3"
                      >
                        <img
                          src={doc.dataUrl}
                          alt={doc.label}
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-[#0F2438] block truncate">
                            {doc.label}
                          </span>
                          <span className="text-[11px] text-slate-400 block truncate">
                            {doc.fileName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDocumentFromTraveler(activeTraveler.phone, doc.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title={t('حذف المستند', 'Delete Document')}
                          aria-label={t('حذف المستند', 'Delete Document')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-dashed border-slate-300 rounded-xl p-4 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <span>
                      {t('لا توجد مستندات مرفوعة حالياً في محفظتك.', 'No documents uploaded to your wallet yet.')}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleSendWalletSummaryWhatsApp}
                  className="w-full sm:flex-1 min-h-[44px] px-4 py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <WhatsAppIcon className="w-4 h-4" variant="white" />
                  <span>{t('طلب خدمة باستخدام بيانات المحفظة', 'Request Service Using Wallet Data')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('تسجيل الخروج', 'Sign Out')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* INTERNAL VERIFICATION MODAL (Opened when clicking Unverified Badge inside Traveler Profile) */}
        {activeTraveler && !activeTraveler.verified && verifyModalOpen && (
          <div
            className="absolute inset-0 z-20 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setVerifyModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl overflow-hidden text-start"
              onClick={(e) => e.stopPropagation()}
              dir={dir}
            >
              <div className="bg-[#0F2438] text-white px-4 py-3.5 flex items-center justify-between border-b-2 border-[#C6A052]">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4.5 h-4.5 text-[#E5C887]" />
                  <h4 className="text-sm font-black">
                    {t('توثيق حساب ملف المسافر', 'Verify Traveler Account')}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setVerifyModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                  aria-label={t('إغلاق', 'Close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4">
                <form onSubmit={handleVerifyOtpSubmit} className="space-y-3">
                  <label className="block text-xs font-bold text-[#0F2438]">
                    {t('أدخل كود التفعيل المكون من 6 أرقام', 'Enter 6-Digit Activation Code (OTP)')}
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

                  {verifyError && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                      {verifyError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full min-h-[44px] py-2.5 px-4 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer"
                  >
                    {t('تفعيل الحساب', 'Verify Account')}
                  </button>
                </form>

                {/* Helper prompt + green WhatsApp CTA */}
                <div className="pt-3 border-t border-slate-200 space-y-2.5 text-center">
                  <p className="text-xs font-bold text-slate-600">
                    {t('لم تحصل على كود تفعيل؟', "Didn't receive an activation code?")}
                  </p>
                  <button
                    type="button"
                    onClick={handleRequestWhatsAppActivation}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs transition cursor-pointer leading-snug"
                  >
                    <WhatsAppIcon className="w-4.5 h-4.5 shrink-0" variant="white" />
                    <span>
                      {t(
                        'أرسل رسالة للحصول على كود أو رابط التفعيل عبر واتساب',
                        'Send WhatsApp message to get activation code or link'
                      )}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

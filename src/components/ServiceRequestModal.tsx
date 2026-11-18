import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Phone,
  CheckCircle2,
  ShieldCheck,
  Users,
  Check,
  FileCheck2,
  Upload,
  Camera,
  Trash2,
  Loader2,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { getDisplayableDriveImageUrl } from '../utils/firebaseStorageHelper';
import { getLocalizedTravelContent } from '../data/travelData';
import { dialPhoneNumber, openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';
import {
  TRAVELERS_UPDATED_EVENT,
  attachPreOrderFilesToTravelerCloud,
  compressImageToDataUrl,
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
  initialTravelerCount?: number;
  initialNotes?: string;
}

export const ServiceRequestModal: React.FC<ServiceRequestModalProps> = ({
  isOpen,
  onClose,
  initialServiceTitle,
  initialTravelerCount,
  initialNotes,
}) => {
  const { lang, dir, t } = useLanguage();
  const localized = getLocalizedTravelContent(lang);
  const [activeTraveler, setActiveTraveler] = useState<TravelerProfile | null>(() =>
    getActiveTraveler()
  );
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [passportExpiryDate, setPassportExpiryDate] = useState('');
  const [autoFillTargetId, setAutoFillTargetId] = useState<string>('owner');
  const [autoFillNotice, setAutoFillNotice] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);
  const [selectedService, setSelectedService] = useState(
    initialServiceTitle || localized.services[0].title
  );
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>(['owner']);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Pre-order document preparation & instant preview (works for guests & logged-in clients)
  const [prePassportPreview, setPrePassportPreview] = useState<string>('');
  const [prePersonalPhotoPreview, setPrePersonalPhotoPreview] = useState<string>('');
  const [preReceiptPreview, setPreReceiptPreview] = useState<string>('');
  const [isPreparingUpload, setIsPreparingUpload] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passportFileRef = useRef<HTMLInputElement | null>(null);
  const personalPhotoFileRef = useRef<HTMLInputElement | null>(null);
  const receiptFileRef = useRef<HTMLInputElement | null>(null);

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
    if (!isOpen) return;
    setAutoFillNotice(null);
    if (initialNotes) {
      setNotes(initialNotes);
    } else if (initialTravelerCount && initialTravelerCount > 1) {
      setNotes(
        lang === 'en'
          ? `Estimated travelers: ${initialTravelerCount} travelers`
          : `عدد المسافرين المشمولين بالطلب: ${initialTravelerCount} مسافرين`
      );
    }
    if (activeTraveler) {
      const names = getTravelerDisplayNames(activeTraveler);
      setFullName((prev) => prev.trim() || names.fullDisplayName);
      setPhone((prev) => prev.trim() || formatPhoneForDisplay(activeTraveler.phone));
      setSelectedTravelerIds((prev) => (prev.length > 0 ? prev : ['owner']));
    }
  }, [isOpen, activeTraveler, initialNotes, initialTravelerCount, lang]);

  if (!isOpen) return null;

  const currentServiceObj =
    localized.services.find((s) => s.title === selectedService) || localized.services[0];

  const toggleTravelerId = (id: string) => {
    setSelectedTravelerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectPreOrderImage = async (
    target: 'passport' | 'photo' | 'receipt',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsPreparingUpload(true);
    try {
      const compressed = await compressImageToDataUrl(
        file,
        target === 'photo' ? 720 : 1280,
        target === 'photo' ? 0.82 : 0.8
      );
      if (target === 'passport') {
        setPrePassportPreview(compressed.dataUrl);
      } else if (target === 'photo') {
        setPrePersonalPhotoPreview(compressed.dataUrl);
      } else {
        setPreReceiptPreview(compressed.dataUrl);
      }
    } catch {
      // Ignore invalid image files cleanly
    } finally {
      setIsPreparingUpload(false);
    }
  };

  const handleAutoFillSavedTraveler = () => {
    if (!activeTraveler) {
      setAutoFillNotice({
        type: 'info',
        text: t(
          'سجّل الدخول أولاً إلى (ملف المسافر) لحفظ بيانات جوازك وصوره واستدعائها بضغطة واحدة.',
          'Sign in to your Traveler Profile first to save and auto-fill passport details & photos in 1 click.'
        ),
      });
      return;
    }

    const formattedPhone = formatPhoneForDisplay(activeTraveler.phone);
    if (autoFillTargetId === 'owner') {
      const names = getTravelerDisplayNames(activeTraveler);
      const resolvedName =
        (activeTraveler.passportFullName || '').trim() || names.fullDisplayName;
      setFullName(resolvedName);
      setPhone(formattedPhone);
      setPassportNumber((activeTraveler.passportNumber || '').trim().toUpperCase());
      setPassportExpiryDate(activeTraveler.passportExpiryDate || '');
      setSelectedTravelerIds((prev) => (prev.includes('owner') ? prev : ['owner', ...prev]));

      const savedPassportDoc = (activeTraveler.documents || []).find(
        (d) => d.docType === 'passport' && (d.dataUrl || d.viewUrl)
      );
      if (savedPassportDoc) {
        setPrePassportPreview(
          getDisplayableDriveImageUrl(savedPassportDoc.dataUrl || savedPassportDoc.viewUrl || '')
        );
      }
      if (activeTraveler.avatarUrl) {
        setPrePersonalPhotoPreview(getDisplayableDriveImageUrl(activeTraveler.avatarUrl));
      }

      setAutoFillNotice({
        type: 'success',
        text: t(
          `تم استدعاء بيانات (${resolvedName}) ورقم الجواز وصور المستندات المحفوظة فوراً.`,
          `Auto-filled saved details, passport info, and documents for (${resolvedName}).`
        ),
      });
      return;
    }

    const member = (activeTraveler.familyMembers || []).find((m) => m.id === autoFillTargetId);
    if (!member) return;
    const memberFullName =
      (member.passportFullName || '').trim() || `${member.firstName} ${member.lastName}`.trim();
    setFullName(memberFullName);
    setPhone(formattedPhone);
    setPassportNumber((member.passportNumber || '').trim().toUpperCase());
    setPassportExpiryDate(member.passportExpiryDate || '');
    setSelectedTravelerIds((prev) =>
      prev.includes(member.id) ? prev : [...prev, member.id]
    );

    if (member.passportPhotoUrl) {
      setPrePassportPreview(getDisplayableDriveImageUrl(member.passportPhotoUrl));
    }
    if (member.personalPhotoUrl) {
      setPrePersonalPhotoPreview(getDisplayableDriveImageUrl(member.personalPhotoUrl));
    }

    setAutoFillNotice({
      type: 'success',
      text: t(
        `تم استدعاء بيانات المرافق (${memberFullName}) ورقم الجواز وصوره المحفوظة فوراً.`,
        `Auto-filled saved details, passport info, and photos for (${memberFullName}).`
      ),
    });
  };

  const handleSubmitWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    let updatedTraveler = activeTraveler;

    try {
      const hasNewLocalUploads =
        prePassportPreview.startsWith('data:') ||
        prePersonalPhotoPreview.startsWith('data:') ||
        preReceiptPreview.startsWith('data:');

      if (activeTraveler && hasNewLocalUploads) {
        const res = await attachPreOrderFilesToTravelerCloud(activeTraveler.phone, {
          passportDataUrl: prePassportPreview.startsWith('data:') ? prePassportPreview : undefined,
          avatarDataUrl: prePersonalPhotoPreview.startsWith('data:')
            ? prePersonalPhotoPreview
            : undefined,
          receiptDataUrl: preReceiptPreview.startsWith('data:') ? preReceiptPreview : undefined,
          serviceTitle: selectedService,
        });
        if (res) {
          updatedTraveler = res;
        }
      }

      const travelersBlock = updatedTraveler
        ? formatTravelersOrderSummary(updatedTraveler, selectedTravelerIds, lang)
        : '';

      const preOrderAttachedList: string[] = [];
      if (prePassportPreview) {
        preOrderAttachedList.push(
          prePassportPreview.startsWith('data:')
            ? lang === 'en'
              ? 'Passport photo prepared & ready'
              : 'صورة جواز السفر (مجهّزة للإرسال)'
            : lang === 'en'
            ? 'Saved Google Drive passport photo linked'
            : 'صورة جواز السفر المحفوظة في Google Drive مرفقة'
        );
      }
      if (prePersonalPhotoPreview) {
        preOrderAttachedList.push(
          prePersonalPhotoPreview.startsWith('data:')
            ? lang === 'en'
              ? 'Personal photo prepared & ready'
              : 'الصورة الشخصية (مجهّزة للإرسال)'
            : lang === 'en'
            ? 'Saved Google Drive personal photo linked'
            : 'الصورة الشخصية المحفوظة في Google Drive مرفقة'
        );
      }
      if (preReceiptPreview) {
        preOrderAttachedList.push(
          lang === 'en'
            ? 'Payment transfer receipt attached for instant booking confirmation'
            : 'صورة إيصال الدفع مرفقة لتأكيد الحجز فوراً'
        );
      }

      const passportDetailsBlock =
        passportNumber.trim() || passportExpiryDate.trim()
          ? lang === 'en'
            ? `${passportNumber.trim() ? `\n• Passport Number: ${passportNumber.trim().toUpperCase()}` : ''}${
                passportExpiryDate.trim() ? `\n• Passport Expiry: ${passportExpiryDate.trim()}` : ''
              }`
            : `${passportNumber.trim() ? `\n• رقم الجواز: ${passportNumber.trim().toUpperCase()}` : ''}${
                passportExpiryDate.trim() ? `\n• تاريخ انتهاء الجواز: ${passportExpiryDate.trim()}` : ''
              }`
          : '';

      const preOrderNote =
        preOrderAttachedList.length > 0
          ? lang === 'en'
            ? `\n• Pre-Order Documents Ready: ${preOrderAttachedList.join(', ')}`
            : `\n• المستندات المجهزة مسبقاً: ${preOrderAttachedList.join(' + ')}`
          : '';

      const message =
        lang === 'en'
          ? `Hello Masarik Tourism LLC,
I would like to request a service:
• Service: ${selectedService}
• Full Name: ${fullName.trim() || 'Client'}
• Phone / WhatsApp: ${phone.trim() || 'N/A'}${passportDetailsBlock}${preOrderNote}${
              travelersBlock ? `\n\nSelected Traveler(s) & Cloud Documents:\n${travelersBlock}` : ''
            }${notes.trim() ? `\n• Notes: ${notes.trim()}` : ''}
Please share requirements and next steps. Thank you.`
          : `السلام عليكم ورحمة الله وبركاته،
أرغب في طلب خدمة من منصة مسارك للإنجاز السياحي:
• الخدمة المطلوبة: ${selectedService}
• الاسم: ${fullName.trim() || 'عميل مسارك'}
• رقم الهاتف: ${phone.trim() || 'غير محدد'}${passportDetailsBlock}${preOrderNote}${
              travelersBlock ? `\n\nالمسافرون المشمولون بالطلب ومستنداتهم السحابية:\n${travelersBlock}` : ''
            }${notes.trim() ? `\n• تفاصيل إضافية: ${notes.trim()}` : ''}
يرجى تزويدي بالمتطلبات والتفاصيل وسرعة المتابعة. شكراً لكم.`;

      openWhatsApp(message);
      setPrePassportPreview('');
      setPrePersonalPhotoPreview('');
      setPreReceiptPreview('');
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 2500);
    } finally {
      setIsSubmitting(false);
    }
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

              {/* Required Documents for Selected Service */}
              {currentServiceObj?.requiredDocs && currentServiceObj.requiredDocs.length > 0 && (
                <div className="bg-[#FAF8F2] border border-[#E5C887] rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#0F2438]">
                    <FileCheck2 className="w-4 h-4 text-[#9E7B33] shrink-0" />
                    <span>
                      {t('المستندات المطلوبة لهذه الخدمة:', 'Required Documents for This Service:')}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {currentServiceObj.requiredDocs.map((req, idx) => (
                      <li key={idx} className="text-[11.5px] text-slate-700 flex items-start gap-1.5 leading-snug">
                        <span className="text-[#9E7B33] font-black shrink-0">•</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pre-Order Document Upload & Instant Preview (No Login Required) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-[#0F2438]">
                    {t(
                      'تجهيز ومعاينة المستندات قبل الطلب (اختياري)',
                      'Prepare & Preview Photos Before Ordering (Optional)'
                    )}
                  </span>
                  {isPreparingUpload && <Loader2 className="w-3.5 h-3.5 text-[#0284C7] animate-spin" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {activeTraveler
                    ? t(
                        'يمكنك إرفاق أو تحديث صورة الجواز والصورة الشخصية الآن ليتم حفظها سحابياً وإرفاق روابطها بطلبك تلقائياً.',
                        'Attach or update passport & personal photos now to sync to cloud and include links in your order.'
                      )
                    : t(
                        'تحقق من وضوح صورة الجواز والصورة الشخصية بالمعاينة الفورية الآن لتسريع التنفيذ عند إرسال الطلب.',
                        'Preview your passport and personal photo here right away for faster processing upon request.'
                      )}
                </p>

                <input
                  ref={passportFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleSelectPreOrderImage('passport', e)}
                />
                <input
                  ref={personalPhotoFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleSelectPreOrderImage('photo', e)}
                />
                <input
                  ref={receiptFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleSelectPreOrderImage('receipt', e)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Passport Preview / Upload */}
                  <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                    <span className="text-[11px] font-black text-[#0F2438] block">
                      {t('صورة جواز السفر', 'Passport Photo')}
                    </span>
                    {prePassportPreview ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={prePassportPreview}
                          alt={t('معاينة الجواز', 'Passport preview')}
                          className="w-12 h-12 rounded-lg object-cover border border-[#C6A052] shrink-0"
                        />
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => passportFileRef.current?.click()}
                            className="w-full py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[10.5px] font-bold cursor-pointer"
                          >
                            {t('تغيير', 'Replace')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrePassportPreview('')}
                            className="w-full py-1 px-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{t('إزالة', 'Remove')}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => passportFileRef.current?.click()}
                        className="w-full min-h-[44px] px-2.5 py-2 rounded-xl border border-dashed border-[#C6A052] bg-[#FAF8F2] hover:bg-[#F5EFE0] text-[#0F2438] text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#9E7B33]" />
                        <span>{t('رفع ومعاينة الجواز', 'Upload & Preview')}</span>
                      </button>
                    )}
                  </div>

                  {/* Personal Photo Preview / Upload */}
                  <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                    <span className="text-[11px] font-black text-[#0F2438] block">
                      {t('الصورة الشخصية', 'Personal Photo')}
                    </span>
                    {prePersonalPhotoPreview ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={prePersonalPhotoPreview}
                          alt={t('معاينة الصورة', 'Personal photo preview')}
                          className="w-12 h-12 rounded-full object-cover border border-[#C6A052] shrink-0"
                        />
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => personalPhotoFileRef.current?.click()}
                            className="w-full py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[10.5px] font-bold cursor-pointer"
                          >
                            {t('تغيير', 'Replace')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrePersonalPhotoPreview('')}
                            className="w-full py-1 px-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{t('إزالة', 'Remove')}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => personalPhotoFileRef.current?.click()}
                        className="w-full min-h-[44px] px-2.5 py-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-[#0F2438] text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-slate-600" />
                        <span>{t('رفع ومعاينة الصورة', 'Upload & Preview')}</span>
                      </button>
                    )}
                  </div>

                  {/* Payment Receipt Image Preview / Upload */}
                  <div className="sm:col-span-2 bg-white border border-emerald-200 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-[#0F2438] flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          {t(
                            'صورة إيصال الدفع (لتأكيد الحجز فوراً)',
                            'Payment Transfer Receipt (for Instant Confirmation)'
                          )}
                        </span>
                      </span>
                    </div>
                    {preReceiptPreview ? (
                      <div className="flex items-center gap-2.5">
                        <img
                          src={preReceiptPreview}
                          alt={t('معاينة إيصال الدفع', 'Payment receipt preview')}
                          className="w-12 h-12 rounded-lg object-cover border border-emerald-400 shrink-0"
                        />
                        <div className="flex items-center gap-1.5 flex-1">
                          <button
                            type="button"
                            onClick={() => receiptFileRef.current?.click()}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold cursor-pointer"
                          >
                            {t('تغيير الإيصال', 'Replace Receipt')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreReceiptPreview('')}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{t('إزالة', 'Remove')}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => receiptFileRef.current?.click()}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-dashed border-emerald-400 bg-emerald-50/70 hover:bg-emerald-50 text-emerald-950 text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          {t(
                            'إرفاق صورة إيصال التحويل المالي (إن وُجد)',
                            'Attach Transfer Receipt Photo (if transferred)'
                          )}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
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
                            src={getDisplayableDriveImageUrl(activeTraveler.avatarUrl)}
                            alt={ownerNames?.fullDisplayName}
                            loading="lazy"
                            decoding="async"
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
                                src={getDisplayableDriveImageUrl(member.personalPhotoUrl)}
                                alt={mName}
                                loading="lazy"
                                decoding="async"
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

              {/* Saved Traveler Auto-Fill Box */}
              <div className="bg-gradient-to-br from-[#0F2438] to-[#163B65] text-white rounded-2xl p-3.5 space-y-2.5 border border-[#C6A052]/60 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-black text-[#E5C887] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('بيانات المسافر المحفوظة', 'Saved Traveler Auto-Fill')}</span>
                    </span>
                    <p className="text-[11px] text-slate-200 mt-0.5 leading-snug">
                      {t(
                        'املأ الاسم ورقم الجواز والهاتف وصور المستندات في ثانية واحدة دون إعادة كتابة',
                        'Fill Name, Passport No., Expiry & saved Drive photos in 1 second'
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {activeTraveler && familyMembers.length > 0 && (
                    <select
                      value={autoFillTargetId}
                      onChange={(e) => setAutoFillTargetId(e.target.value)}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#E5C887]"
                    >
                      <option value="owner" className="text-[#0F2438]">
                        {ownerNames?.fullDisplayName} ({t('صاحب الحساب', 'Owner')})
                      </option>
                      {familyMembers.map((m) => (
                        <option key={m.id} value={m.id} className="text-[#0F2438]">
                          {m.firstName} {m.lastName} ({getRelationshipLabel(m.relationship, lang)})
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={handleAutoFillSavedTraveler}
                    className="flex-1 min-h-[44px] px-4 py-2 bg-[#C6A052] hover:bg-[#b58e3f] text-[#0F2438] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.99] cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>
                      {t('تعبئة تلقائية من بياناتي المحفوظة', 'Auto-Fill From Saved Profile')}
                    </span>
                  </button>
                </div>

                {autoFillNotice && (
                  <div
                    className={`rounded-xl px-3 py-2 text-[11px] font-bold ${
                      autoFillNotice.type === 'success'
                        ? 'bg-emerald-500/20 border border-emerald-300/40 text-emerald-100'
                        : 'bg-white/10 border border-white/20 text-amber-100'
                    }`}
                  >
                    {autoFillNotice.text}
                  </div>
                )}
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
                    inputMode="numeric"
                    required
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01000000000"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs md:text-sm text-[#0F2438] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                    {t('رقم جواز السفر (اختياري)', 'Passport Number (Optional)')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={passportNumber}
                    onChange={(e) => setPassportNumber(e.target.value.toUpperCase())}
                    placeholder="A12345678"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs md:text-sm text-[#0F2438] uppercase tabular-nums placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                    {t('تاريخ انتهاء الجواز (اختياري)', 'Passport Expiry Date (Optional)')}
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    value={passportExpiryDate}
                    onChange={(e) => setPassportExpiryDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs md:text-sm text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
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
                  disabled={isSubmitting}
                  className="w-full sm:flex-1 py-3 px-4 bg-[#25D366] hover:bg-[#128C7E] disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <WhatsAppIcon className="w-4.5 h-4.5" variant="white" />
                  )}
                  <span>
                    {isSubmitting
                      ? t('جاري التجهيز والإرسال...', 'Preparing & Sending...')
                      : t('إرسال الطلب عبر واتساب (مباشر)', 'Send Request via WhatsApp')}
                  </span>
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

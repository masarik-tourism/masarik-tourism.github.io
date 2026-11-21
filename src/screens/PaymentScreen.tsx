import React, { useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  Store,
  Info,
  Copy,
  Check,
  ExternalLink,
  Zap,
  CreditCard,
  Wrench,
  Smartphone,
  Upload,
  CheckCircle2,
  Loader2,
  Trash2,
  FileCheck2,
  Receipt,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { TravelRepository, getLocalizedTravelContent } from '../data/travelData';
import {
  CUSTOMER_SERVICE_WHATSAPP_NUMBER,
  buildWhatsAppSendUrl,
  openWhatsApp,
} from '../utils/communication';
import { useLanguage } from '../contexts/LanguageContext';
import {
  TRAVELERS_UPDATED_EVENT,
  buildOrderCodeFromPhone,
  compressImageToDataUrl,
  getActiveTraveler,
  uploadAndAddDocumentToTravelerCloud,
} from '../utils/travelerStore';
import {
  getDisplayableDriveImageUrl,
  uploadToGoogleDriveWebApp,
} from '../utils/firebaseStorageHelper';
import { TravelerDocument, TravelerProfile } from '../types/travel';

interface PaymentScreenProps {
  onNavigateToContact: () => void;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({ onNavigateToContact }) => {
  const { lang, t } = useLanguage();
  const localized = getLocalizedTravelContent(lang);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTraveler, setActiveTraveler] = useState<TravelerProfile | null>(() =>
    getActiveTraveler()
  );
  const [transferChannel, setTransferChannel] = useState<string>('إنستاباي (InstaPay)');
  const [transferReference, setTransferReference] = useState<string>('');
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('payment-receipt.jpg');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [uploadedReceiptDoc, setUploadedReceiptDoc] = useState<TravelerDocument | null>(null);
  const [guestDriveReceipt, setGuestDriveReceipt] = useState<{
    viewUrl: string;
    downloadUrl: string;
  } | null>(null);
  const [lastWhatsappConfirmUrl, setLastWhatsappConfirmUrl] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const receiptFileRef = useRef<HTMLInputElement | null>(null);
  const receiptSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => setActiveTraveler(getActiveTraveler());
    window.addEventListener(TRAVELERS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TRAVELERS_UPDATED_EVENT, sync);
  }, []);

  const handleCopyValue = async (key: string, value: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch {
      // Fallback ignored gracefully
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2400);
  };

  const handleJumpToReceiptUpload = (channelValue: string) => {
    setTransferChannel(channelValue);
    setReceiptError(null);
    setTimeout(() => {
      receiptSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const handleSelectReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setReceiptError(null);
    setUploadedReceiptDoc(null);
    setGuestDriveReceipt(null);
    setLastWhatsappConfirmUrl(null);

    try {
      const compressed = await compressImageToDataUrl(file, 1280, 0.82);
      setReceiptPreview(compressed.dataUrl);
      setReceiptFileName(file.name.replace(/\.[^.]+$/, '') + '.jpg');
    } catch {
      setReceiptError(
        t(
          'يرجى اختيار صورة صالحة لإيصال التحويل (JPG / PNG).',
          'Please select a valid receipt image file (JPG / PNG).'
        )
      );
    }
  };

  const ensureReceiptSavedToCloud = async (): Promise<string> => {
    if (!receiptPreview) return '';

    // Already uploaded to Google Drive in this session
    if (uploadedReceiptDoc?.viewUrl && uploadedReceiptDoc.viewUrl.startsWith('http')) {
      return uploadedReceiptDoc.viewUrl;
    }
    if (uploadedReceiptDoc?.dataUrl && uploadedReceiptDoc.dataUrl.startsWith('http')) {
      return uploadedReceiptDoc.dataUrl;
    }
    if (guestDriveReceipt?.viewUrl && guestDriveReceipt.viewUrl.startsWith('http')) {
      return guestDriveReceipt.viewUrl;
    }

    const refPart = transferReference.trim() ? ` (${transferReference.trim()})` : '';
    const label = `${t('إيصال دفع عبر', 'Payment Receipt via')} ${transferChannel}${refPart}`;

    if (activeTraveler) {
      const res = await uploadAndAddDocumentToTravelerCloud(activeTraveler.phone, {
        docType: 'receipt',
        label,
        dataUrl: receiptPreview,
        fileName: receiptFileName,
      });
      if (res) {
        setUploadedReceiptDoc(res.document);
        setActiveTraveler(res.profile);
        if (res.document.viewUrl?.startsWith('http')) return res.document.viewUrl;
        if (res.document.dataUrl?.startsWith('http')) return res.document.dataUrl;
        return '';
      }
      throw new Error('Could not save to order');
    }

    // Guest upload: still store safely on Google Drive Web App
    const safeGuestName = `Masarik_GuestReceipt_${Date.now()}_${receiptFileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const driveRes = await uploadToGoogleDriveWebApp({
      fileName: safeGuestName,
      mimeType: 'image/jpeg',
      base64: receiptPreview,
    });
    setGuestDriveReceipt({ viewUrl: driveRes.viewUrl, downloadUrl: driveRes.downloadUrl });
    return driveRes.viewUrl;
  };

  const handleAttachReceiptToOrder = async () => {
    if (!receiptPreview || isUploadingReceipt) return;
    setIsUploadingReceipt(true);
    setReceiptError(null);
    try {
      await ensureReceiptSavedToCloud();
    } catch {
      setReceiptError(
        t(
          'حدث خطأ أثناء رفع الإيصال إلى السحابة، يمكنك المحاولة مجدداً أو الإرسال عبر واتساب مباشرة.',
          'Cloud upload encountered an issue. Please try again or send directly via WhatsApp.'
        )
      );
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleNotifyReceiptWhatsApp = async () => {
    setReceiptError(null);
    let driveUrl =
      uploadedReceiptDoc?.viewUrl ||
      (uploadedReceiptDoc?.dataUrl?.startsWith('http') ? uploadedReceiptDoc.dataUrl : '') ||
      guestDriveReceipt?.viewUrl ||
      '';

    // Automatically save/upload receipt image to Google Drive + DB before opening WhatsApp
    if (receiptPreview && !driveUrl) {
      setIsUploadingReceipt(true);
      try {
        driveUrl = await ensureReceiptSavedToCloud();
      } catch {
        setReceiptError(
          t(
            'تعذر رفع نسخة الإيصال سحابياً في هذه اللحظة، سيتم فتح واتساب لإرسال الإيصال مباشرة.',
            'Could not upload receipt copy to cloud right now; opening WhatsApp so you can send it directly.'
          )
        );
      } finally {
        setIsUploadingReceipt(false);
      }
    }

    const orderCode = activeTraveler
      ? activeTraveler.orderCode || buildOrderCodeFromPhone(activeTraveler.phone)
      : null;
    const refText = transferReference.trim();

    const msg =
      lang === 'en'
        ? `Hello Masarik Tourism LLC,\nI completed a direct payment transfer and would like to confirm my booking immediately:\n• Channel: ${transferChannel}${
            orderCode ? `\n• Order Ref: ${orderCode}` : ''
          }${refText ? `\n• Transfer Ref: ${refText}` : ''}${
            driveUrl && driveUrl.startsWith('http')
              ? `\n• Receipt Link: ${driveUrl}`
              : '\n• Receipt: Attaching payment receipt image now.'
          }`
        : `السلام عليكم ورحمة الله وبركاته،\nتم إجراء تحويل مالي لسداد قيمة المعاملة وأرغب في تأكيد الحجز فوراً:\n• وسيلة الدفع: ${transferChannel}${
            orderCode ? `\n• كود الطلب: ${orderCode}` : ''
          }${refText ? `\n• رقم العملية / الملاحظة: ${refText}` : ''}${
            driveUrl && driveUrl.startsWith('http')
              ? `\n• رابط صورة الإيصال المرفقة بالطلب: ${driveUrl}`
              : '\n• صورة الإيصال: مرفقة بالمحادثة الآن.'
          }`;

    const waUrl = buildWhatsAppSendUrl(CUSTOMER_SERVICE_WHATSAPP_NUMBER, msg);
    setLastWhatsappConfirmUrl(waUrl);
    openWhatsApp(msg);
  };

  const instapayHandle = `${TravelRepository.INSTAPAY_ACCOUNT}@instapay`;
  const existingReceipts = (activeTraveler?.documents || []).filter(
    (d) => d.docType === 'receipt'
  );
  const isSavedReceiptReady = Boolean(uploadedReceiptDoc || guestDriveReceipt);

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24 md:pb-16 pt-5">
      <div className="max-w-4xl mx-auto px-4 space-y-5">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-xl md:text-2xl font-black text-[#0F2437]">
            {t('طرق الدفع المعتمدة وتأكيد الإيصال', 'Approved Payment Channels & Receipt Confirmation')}
          </h1>
          <p className="text-xs md:text-sm text-[#324D61] leading-relaxed">
            {t(
              'يتم السداد عبر التحويلات المباشرة وإرفاق صورة إيصال الدفع داخل الطلب لتأكيد الحجز فوراً.',
              'Payments are completed via direct transfers followed by attaching the payment receipt image inside your order to confirm your booking immediately.'
            )}
          </p>
        </div>

        {/* Payment Workflow Clarity Banner */}
        <div className="bg-[#0F2438] text-white border border-[#C6A052]/65 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C6A052] text-[#0A1926] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <span className="text-xs sm:text-sm font-black text-[#E5C887] block">
                {t('آلية السداد وتأكيد الحجز الفوري', 'Direct Transfer & Instant Confirmation Policy')}
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">
                {t(
                  'أتمم التحويل بضغطة واحدة عبر إنستاباي أو المحافظ الإلكترونية، ثم اضغط "رفع الإيصال" لإرفاق صورة الإيصال بالأسفل وتأكيد الحجز فوراً.',
                  'Complete your transfer via InstaPay or E-Wallets, then tap "Upload Receipt" to attach your receipt below and confirm immediately.'
                )}
              </p>
            </div>
          </div>
          {activeTraveler && (
            <span
              dir="ltr"
              className="px-3 py-1.5 rounded-xl bg-white/10 border border-[#C6A052]/50 text-[#E5C887] text-xs font-black tabular-nums shrink-0 self-start sm:self-center"
            >
              {activeTraveler.orderCode || buildOrderCodeFromPhone(activeTraveler.phone)}
            </span>
          )}
        </div>

        {/* 1. InstaPay Official Channel */}
        <div className="bg-gradient-to-br from-[#FAF8F2] via-white to-[#F6EFFC] border-2 border-[#7E22CE]/45 hover:border-[#7E22CE] rounded-2xl p-5 shadow-md space-y-4 transition-all">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#7E22CE]/15 text-[#7E22CE] border border-[#7E22CE]/30 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 fill-[#7E22CE]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm md:text-base font-black text-[#17344F]">
                    {t('إنستاباي (InstaPay)', 'InstaPay Instant Transfer')}
                  </h2>
                  <span className="bg-[#7E22CE] text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                    {t('الأسرع والموصى به', 'Fastest & Recommended')}
                  </span>
                </div>
                <span className="text-[11px] md:text-xs text-[#678093]">
                  {t(
                    'تحويل لحظي على مدار 24 ساعة عبر شبكة المدفوعات اللحظية IPN',
                    '24/7 Instant Transfers via Central Bank IPN'
                  )}
                </span>
              </div>
            </div>
          </div>

          <a
            href={TravelRepository.INSTAPAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-gradient-to-r from-[#7E22CE] via-[#6B21A8] to-[#581C87] hover:from-[#6B21A8] hover:to-[#4C1D95] text-white py-3.5 px-5 rounded-xl text-sm md:text-base font-black shadow-md hover:shadow-lg transition active:scale-[0.99] flex items-center justify-center gap-2 text-center"
          >
            <Zap className="w-5 h-5 fill-white" />
            <span>{t('الدفع المباشر عبر تطبيق إنستاباي الآن', 'Pay Directly via InstaPay App')}</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* InstaPay Payment Address (IPA) Box Only */}
          <div className="bg-white border border-[#E9D5FF] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-[#678093] block">
                {t('عنوان الدفع (IPA):', 'InstaPay Address (IPA):')}
              </span>
              <span dir="ltr" className="text-base font-black text-[#7E22CE] font-mono block mt-0.5 truncate">
                {instapayHandle}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopyValue('instapay_ipa', instapayHandle)}
              className="min-h-[42px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#F3E8FF] hover:bg-[#E9D5FF] text-[#6B21A8] border border-[#D8B4FE] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              {copiedKey === 'instapay_ipa' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700">{t('تم نسخ العنوان!', 'Address Copied!')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 shrink-0" />
                  <span>{t('نسخ العنوان بضغطة واحدة', '1-Click Copy Address')}</span>
                </>
              )}
            </button>
          </div>

          {/* Recipient Assurance Line */}
          <div className="bg-[#F3E8FF]/65 border border-[#D8B4FE] rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-xs font-bold text-[#4C1D95]">
            <CheckCircle2 className="w-4 h-4 text-[#7E22CE] shrink-0" />
            <span>
              {t(
                'الاسم الظاهر عند التحويل: محمد يوسف / شركة مسارك للإنجاز السياحي',
                'Recipient Name Shown on Transfer: Mohamed Youssef / Masarik Tourism L.L.C'
              )}
            </span>
          </div>

          {/* Quick Upload Receipt Trigger */}
          <button
            type="button"
            onClick={() => handleJumpToReceiptUpload('إنستاباي (InstaPay)')}
            className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#FAF8F2] hover:bg-[#F3E8FF]/60 text-[#0F2438] border border-[#C6A052]/65 hover:border-[#7E22CE]/60 text-xs font-black flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#7E22CE]" />
            <span>{t('رفع الإيصال', 'Upload Receipt')}</span>
          </button>
        </div>

        {/* 2. Electronic Wallets Card */}
        <div className="bg-white border border-[#E2DAC8] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 text-red-700 border border-red-200 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm md:text-base font-black text-[#17344F]">
                  {t(
                    'المحافظ الإلكترونية (فودافون كاش • أورنج • اتصالات)',
                    'Electronic Wallets (Vodafone / Orange / Etisalat Cash)'
                  )}
                </h2>
                <span className="text-[11px] md:text-xs text-[#678093]">
                  {t(
                    'تحويل فوري على رقم المحفظة الرسمي للشركة',
                    'Instant transfer to our official corporate mobile wallet'
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#FAF8F2] border border-[#E2DAC8] rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold text-[#678093] block">
                  {t('رقم المحفظة الإلكترونية المعتمد:', 'Official E-Wallet Transfer Number:')}
                </span>
                <span dir="ltr" className="text-lg font-black text-[#0F2438] tabular-nums tracking-wide block mt-0.5">
                  {TravelRepository.PHONE_NUMBER}
                </span>
              </div>
            </div>

            {/* Unified Horizontal Flex Row: Copy + WhatsApp Side-by-Side */}
            <div className="flex flex-row items-stretch gap-2.5 w-full">
              <button
                type="button"
                onClick={() => handleCopyValue('wallet_phone', TravelRepository.PHONE_NUMBER)}
                className="flex-1 min-w-0 min-h-[42px] px-2.5 sm:px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer text-center"
              >
                {copiedKey === 'wallet_phone' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">{t('تم نسخ الرقم!', 'Number Copied!')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('نسخ الرقم بضغطة واحدة', '1-Click Copy Number')}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  const text =
                    lang === 'en'
                      ? `Hello Masarik Tourism, I am sending an E-Wallet transfer to ${TravelRepository.PHONE_NUMBER} to confirm my booking.`
                      : `السلام عليكم، أرغب في التحويل عبر المحفظة الإلكترونية على الرقم ${TravelRepository.PHONE_NUMBER} وتأكيد الحجز.`;
                  openWhatsApp(text);
                }}
                className="flex-1 min-w-0 min-h-[42px] px-2.5 sm:px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer text-center"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">{t('تأكيد عبر واتساب', 'Confirm on WhatsApp')}</span>
              </button>
            </div>
          </div>

          {/* Recipient Assurance Line */}
          <div className="bg-emerald-50/75 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-xs font-bold text-[#0F2438]">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              {t(
                'الاسم الظاهر عند التحويل: محمد يوسف / شركة مسارك للإنجاز السياحي',
                'Recipient Name Shown on Transfer: Mohamed Youssef / Masarik Tourism L.L.C'
              )}
            </span>
          </div>

          {/* Quick Upload Receipt Trigger */}
          <button
            type="button"
            onClick={() => handleJumpToReceiptUpload('محفظة إلكترونية (كاش)')}
            className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#FAF8F2] hover:bg-[#F3ECE0] text-[#0F2438] border border-[#C6A052]/65 text-xs font-black flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#9E7B33]" />
            <span>{t('رفع الإيصال', 'Upload Receipt')}</span>
          </button>
        </div>

        {/* 3. Cash at Branch */}
        <div className="bg-white border border-[#E2DAC8] rounded-2xl p-5 shadow-sm space-y-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FAF8F2] text-[#9E7B33] border border-[#E5C887] flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-[#17344F]">
                {t('السداد نقداً في المقر الرسمي', 'Cash Payment at Our Office')}
              </h2>
              <span className="text-[11px] md:text-xs text-[#678093]">{localized.address}</span>
            </div>
          </div>

          <p className="text-xs md:text-sm text-[#324D61] leading-relaxed">
            {t(
              `شرّفنا في مقرنا الرسمي واستلم إيصالاً وعقداً موثقاً ومعتمداً بجميع المعاملات وخدمات التأشيرات والحجوزات الصادرة بسجل تجاري رقم ${TravelRepository.COMMERCIAL_RECORD} والرقم الموحد ${TravelRepository.UNIFIED_NUMBER}.`,
              `Visit our registered office to receive an official stamped receipt and service contract issued under Commercial Record No. ${TravelRepository.COMMERCIAL_RECORD} and Unified ID ${TravelRepository.UNIFIED_NUMBER}.`
            )}
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onNavigateToContact}
              className="flex-1 min-h-[42px] bg-transparent hover:bg-[#FAF8F2] text-[#17344F] border-2 border-[#17344F] py-2 px-4 rounded-xl text-xs font-black transition active:scale-[0.99] cursor-pointer"
            >
              {t('عرض عناوين ومواقع التواصل', 'View Office Address & Contact')}
            </button>

            <button
              type="button"
              onClick={() => handleJumpToReceiptUpload('سداد نقدي بالفرع')}
              className="sm:w-auto min-h-[42px] px-5 py-2 rounded-xl bg-[#FAF8F2] hover:bg-[#F3ECE0] text-[#0F2438] border border-[#C6A052]/65 text-xs font-black flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer shrink-0"
            >
              <Upload className="w-4 h-4 text-[#9E7B33]" />
              <span>{t('رفع الإيصال', 'Upload Receipt')}</span>
            </button>
          </div>
        </div>

        {/* 4. Online Payment Gateway Card (Under Maintenance & Upgrade) */}
        <div className="bg-white border-2 border-amber-300 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm md:text-base font-black text-[#17344F]">
                  {t(
                    'بوابة الدفع الإلكتروني (البطاقات البنكية والمحافظ الذكية)',
                    'Online Payment Gateway (Bank Cards & Smart Wallets)'
                  )}
                </h2>
                <span className="text-[11px] md:text-xs text-[#678093]">
                  {t('بطاقات فيزا / ماستركارد / ميزة والمحافظ الذكية', 'Visa / Mastercard / Meeza & Smart Wallets')}
                </span>
              </div>
            </div>

            <div className="bg-amber-100 border border-amber-400 text-amber-950 text-xs font-black px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs">
              <Wrench className="w-3.5 h-3.5 text-amber-700" />
              <span>{t('تحت الصيانة والتحديث حالياً', 'Under Maintenance & Upgrade')}</span>
            </div>
          </div>

          <p className="text-xs md:text-sm text-[#324D61] leading-relaxed">
            {t(
              'نعمل حالياً على تحديث بوابة الدفع الإلكتروني بالبطاقات البنكية لخدمتكم بأعلى معايير الأمان. يمكنكم السداد الفوري حالياً عبر إنستاباي أو المحافظ الإلكترونية بالأعلى وإرفاق صورة الإيصال بالأسفل.',
              'We are upgrading our direct bank-card payment gateway. Meanwhile, please complete instant transfers via InstaPay or E-Wallets above and attach your receipt below.'
            )}
          </p>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-slate-200 text-slate-500 border border-slate-300 text-xs sm:text-sm font-black flex items-center justify-center gap-2 cursor-not-allowed opacity-85"
          >
            <Lock className="w-4 h-4" />
            <span>{t('الدفع الإلكتروني المباشر (قريباً)', 'Direct Online Payment (Coming Soon)')}</span>
          </button>
        </div>

        {/* Financial Guarantee Summary */}
        <div className="bg-[#F7F4EB] border border-[#E2DAC8] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-[#0F2437] font-bold text-xs md:text-sm">
            <Info className="w-4 h-4 text-[#17344F]" />
            <span>{t('سياسة السداد والضمان المالي', 'Payment Policy & Financial Guarantee')}</span>
          </div>
          <ul className="text-[11px] md:text-xs text-[#324D61] space-y-1 ps-4 list-disc">
            <li>
              {t(
                `جميع الرسوم موثقة بفواتير رسمية ومعتمدة بسجل تجاري رقم ${TravelRepository.COMMERCIAL_RECORD}.`,
                `All fees are documented with official receipts under CR No. ${TravelRepository.COMMERCIAL_RECORD}.`
              )}
            </li>
            <li>
              {t('البريد الرسمي للمتابعة المالية:', 'Official Billing Email:')} {TravelRepository.OFFICIAL_EMAIL}
            </li>
            <li>
              {t('للاستفسارات والتحصيلات المالية والواتساب:', 'WhatsApp & Billing Inquiries:')}{' '}
              <span dir="ltr" className="tabular-nums font-bold">
                {TravelRepository.PHONE_NUMBER}
              </span>
            </li>
          </ul>
        </div>

        {/* 5. FINAL CARD AT BOTTOM: Interactive Attach Payment Receipt Inside Order */}
        <div
          ref={receiptSectionRef}
          id="attach-payment-receipt"
          className="scroll-mt-24 bg-white border-2 border-[#C6A052] rounded-2xl p-5 shadow-md space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#FAF8F2] border border-[#E5C887] text-[#9E7B33] flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm md:text-base font-black text-[#0F2438]">
                  {t('إرفاق صورة إيصال الدفع داخل الطلب', 'Attach Payment Receipt Image Inside Order')}
                </h2>
                <p className="text-[11px] md:text-xs text-[#678093]">
                  {t(
                    'ارفع صورة إيصال التحويل لحفظها سحابياً وتأكيد حجزك فوراً عبر الواتساب',
                    'Upload a screenshot of your transfer receipt to archive it securely on cloud storage and confirm immediately on WhatsApp'
                  )}
                </p>
              </div>
            </div>
          </div>

          <input
            ref={receiptFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleSelectReceiptFile(e)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-[#0F2438] mb-1">
                {t('وسيلة التحويل المستخدمة', 'Transfer Method Used')}
              </label>
              <select
                value={transferChannel}
                onChange={(e) => setTransferChannel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-[#0F2438] font-bold"
              >
                <option value="إنستاباي (InstaPay)">{t('إنستاباي (InstaPay)', 'InstaPay')}</option>
                <option value="محفظة إلكترونية (كاش)">{t('محفظة إلكترونية (كاش)', 'E-Wallet Cash')}</option>
                <option value="سداد نقدي بالفرع">{t('سداد نقدي بالمقر الرسمي', 'Cash at Office')}</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-[#0F2438] mb-1">
                {t('رقم العملية أو اسم المحوّل (اختياري)', 'Reference No. / Sender Name (Optional)')}
              </label>
              <input
                type="text"
                value={transferReference}
                onChange={(e) => setTransferReference(e.target.value)}
                placeholder={t('مثال: تحويل 3500 ج.م - مرجع 94821', 'e.g. Transfer ref 94821')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
              />
            </div>
          </div>

          {!receiptPreview ? (
            <button
              type="button"
              onClick={() => receiptFileRef.current?.click()}
              className="w-full min-h-[58px] px-4 py-4 rounded-xl border-2 border-dashed border-[#C6A052] bg-[#FAF8F2] hover:bg-[#F5EFE0] text-[#0F2438] text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#9E7B33]" />
              <span>{t('اختيار صورة إيصال الدفع (لقطة شاشة / صورة)', 'Choose Payment Receipt Image')}</span>
            </button>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={receiptPreview}
                  alt={t('معاينة إيصال الدفع', 'Payment receipt preview')}
                  className="w-16 h-16 rounded-lg object-cover border border-[#C6A052] shrink-0 bg-white"
                />
                <div className="min-w-0">
                  <span className="text-xs font-black text-[#0F2438] block truncate">
                    {receiptFileName}
                  </span>
                  <span className="text-[11px] text-slate-500 block">{transferChannel}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => receiptFileRef.current?.click()}
                  className="px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-[#0F2438] text-xs font-bold cursor-pointer"
                >
                  {t('تغيير الصورة', 'Change')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReceiptPreview('');
                    setUploadedReceiptDoc(null);
                    setGuestDriveReceipt(null);
                    setLastWhatsappConfirmUrl(null);
                    setReceiptError(null);
                  }}
                  className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('إزالة', 'Remove')}</span>
                </button>
              </div>
            </div>
          )}

          {receiptError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800">
              {receiptError}
            </div>
          )}

          {isSavedReceiptReady && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="block font-black">
                    {uploadedReceiptDoc
                      ? t(
                          'تم حفظ وإرفاق إيصال الدفع في ملف طلبك وعلى Google Drive بنجاح!',
                          'Payment receipt archived on Google Drive & attached to your order!'
                        )
                      : t(
                          'تم حفظ نسخة من صورة الإيصال على Google Drive بنجاح!',
                          'Payment receipt archived on Google Drive successfully!'
                        )}
                  </span>
                  <span className="block text-[11px] text-emerald-800">
                    {t(
                      'اضغط على زر واتساب لتأكيد السداد ومراجعة الإيصال وتأكيد الحجز فوراً.',
                      'Confirm via WhatsApp so our team verifies your receipt and finalizes your booking right away.'
                    )}
                  </span>
                </div>
              </div>

              {lastWhatsappConfirmUrl && (
                <a
                  href={lastWhatsappConfirmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white text-[11px] font-black transition"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{t('فتح محادثة التأكيد في واتساب مباشرة', 'Open WhatsApp Confirmation Chat')}</span>
                </a>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            {receiptPreview && !isSavedReceiptReady && (
              <button
                type="button"
                disabled={isUploadingReceipt}
                onClick={() => void handleAttachReceiptToOrder()}
                className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isUploadingReceipt ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileCheck2 className="w-4 h-4" />
                )}
                <span>
                  {isUploadingReceipt
                    ? t('جاري رفع وحفظ الإيصال...', 'Archiving Receipt...')
                    : activeTraveler
                    ? t('حفظ وإرفاق الإيصال داخل طلبي الآن', 'Save & Attach Receipt to My Order')
                    : t('حفظ نسخة الإيصال سحابياً الآن', 'Archive Receipt Copy Now')}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={isUploadingReceipt}
              onClick={() => void handleNotifyReceiptWhatsApp()}
              className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#25D366] hover:bg-[#128C7E] disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            >
              {isUploadingReceipt ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              <span>
                {isUploadingReceipt
                  ? t('جاري حفظ الإيصال وتحضير التأكيد...', 'Saving Receipt & Preparing Confirmation...')
                  : isSavedReceiptReady
                  ? t('إرسال إشعار السداد وتأكيد الحجز (واتساب)', 'Send Payment Confirmation (WhatsApp)')
                  : receiptPreview
                  ? t('حفظ الإيصال وإرسال التأكيد عبر واتساب', 'Save Receipt & Confirm via WhatsApp')
                  : t('إرسال صورة إيصال الدفع عبر واتساب لتأكيد الحجز', 'Send Receipt on WhatsApp to Confirm')}
              </span>
            </button>
          </div>

          {existingReceipts.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="text-[11px] font-black text-[#0F2438] block">
                {t(
                  `إيصالات الدفع المرفقة بطلبك (${existingReceipts.length}):`,
                  `Receipts Attached to Your Order (${existingReceipts.length}):`
                )}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {existingReceipts.slice(0, 4).map((rcp) => (
                  <div
                    key={rcp.id}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5"
                  >
                    <img
                      src={getDisplayableDriveImageUrl(rcp.dataUrl)}
                      alt={rcp.label}
                      loading="lazy"
                      decoding="async"
                      className="w-11 h-11 rounded-lg object-cover border border-slate-300 shrink-0 bg-white"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-black text-[#0F2438] block truncate">
                        {rcp.label}
                      </span>
                      <span className="text-[10px] text-slate-500 block tabular-nums">
                        {rcp.uploadedAt?.slice(0, 10)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


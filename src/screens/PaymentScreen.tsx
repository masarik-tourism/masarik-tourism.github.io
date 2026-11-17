import React, { useState } from 'react';
import {
  CreditCard,
  MessageCircle,
  Store,
  CheckCircle,
  X,
  Info,
  ShieldCheck,
  Send,
  Copy,
  Check,
  ExternalLink,
  Wrench,
  AlertTriangle,
  Zap,
  Building2,
} from 'lucide-react';
import { TravelRepository, getLocalizedTravelContent } from '../data/travelData';
import { openWhatsApp } from '../utils/communication';
import { useLanguage } from '../contexts/LanguageContext';

interface PaymentScreenProps {
  onNavigateToContact: () => void;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({ onNavigateToContact }) => {
  const { lang, dir, t } = useLanguage();
  const localized = getLocalizedTravelContent(lang);
  const [showPaymobModal, setShowPaymobModal] = useState(false);
  const [payAmount, setPayAmount] = useState('1500');
  const [paySuccess, setPaySuccess] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(TravelRepository.INSTAPAY_URL);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = TravelRepository.INSTAPAY_URL;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleStartPayment = () => {
    const randomId = `MS-${Math.floor(100000 + Math.random() * 900000)}`;
    setTransactionId(randomId);
    setPaySuccess(true);
  };

  const handleResetModal = () => {
    setShowPaymobModal(false);
    setPaySuccess(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24 md:pb-16 pt-5">
      <div className="max-w-4xl mx-auto px-4 space-y-5">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-[#0F2437]">
            {t('طرق السداد الآمنة', 'Secure Payment Methods')}
          </h1>
          <p className="text-xs md:text-sm text-[#324D61] mt-1">
            {t(
              'نوفر لك خيارات دفع متعددة وموثقة لضمان سرعة إنجاز معاملتك',
              'Verified and instant payment options for faster service completion'
            )}
          </p>
        </div>

        {/* 1. InstaPay Card */}
        <div className="bg-gradient-to-br from-[#FAF8F2] via-white to-[#F6EFFC] border-2 border-[#7E22CE]/50 hover:border-[#7E22CE] rounded-2xl p-5 shadow-md space-y-4 transition-all">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#7E22CE]/15 text-[#7E22CE] border border-[#7E22CE]/30 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 fill-[#7E22CE]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm md:text-base font-black text-[#17344F]">
                    {t('الدفع المباشر عبر إنستاباي (InstaPay)', 'Direct Payment via InstaPay')}
                  </h2>
                  <span className="bg-[#7E22CE] text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                    {t('الخيار الأسرع والموصى به', 'Fastest & Recommended')}
                  </span>
                </div>
                <span className="text-[11px] md:text-xs text-[#678093]">
                  {t(
                    'شبكة المدفوعات اللحظية IPN • معتمد من البنك المركزي المصري',
                    'Instant Payment Network (IPN) • Regulated by the Central Bank of Egypt'
                  )}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs md:text-sm text-[#324D61] leading-relaxed">
            {t(
              'التحويل عبر الرابط هو الخيار الأفضل والأسرع، بمجرد الضغط على الرابط بالأسفل يتم تحويلك فوراً لتطبيق إنستاباي لإتمام الدفع بضغطة واحدة.',
              'Paying via our official link is the fastest way. Tap the button below to launch the InstaPay app and complete payment in one step.'
            )}
          </p>

          <a
            href={TravelRepository.INSTAPAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-gradient-to-r from-[#7E22CE] via-[#6B21A8] to-[#581C87] hover:from-[#6B21A8] hover:to-[#4C1D95] text-white py-3.5 px-5 rounded-xl text-sm md:text-base font-black shadow-lg hover:shadow-xl transition active:scale-[0.99] flex items-center justify-center gap-2.5 text-center group"
          >
            <Zap className="w-5 h-5 fill-white group-hover:scale-110 transition-transform" />
            <span>{t('اضغط هنا للتحويل المباشر عبر إنستاباي الآن', 'Tap Here for Direct InstaPay Transfer')}</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Direct Link Display & Copy Box */}
          <div className="bg-white border-2 border-[#E9D5FF] rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-xs">
            <div className="flex flex-col text-start w-full sm:w-auto overflow-hidden">
              <span className="text-[11px] font-bold text-[#678093]">
                {t('رابط الدفع الكامل المباشر:', 'Official Direct Payment Link:')}
              </span>
              <a
                href={TravelRepository.INSTAPAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="font-mono text-xs md:text-sm font-bold text-[#7E22CE] hover:underline truncate mt-0.5"
              >
                {TravelRepository.INSTAPAY_URL}
              </a>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                onClick={handleCopyLink}
                className="flex-1 sm:flex-none bg-[#F3E8FF] hover:bg-[#E9D5FF] text-[#6B21A8] border border-[#D8B4FE] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">{t('تم نسخ الرابط!', 'Copied!')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t('نسخ الرابط', 'Copy Link')}</span>
                  </>
                )}
              </button>

              <a
                href={TravelRepository.INSTAPAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#7E22CE] hover:bg-[#6B21A8] text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <span>{t('فتح', 'Open')}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Transfer via Phone Number via WhatsApp */}
          <div className="bg-[#FAF8F2] border border-[#E2DAC8] rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-start">
            <div>
              <h4 className="text-xs md:text-sm font-black text-[#17344F]">
                {t('تفضل التحويل عن طريق رقم التليفون؟', 'Prefer transferring via mobile number?')}
              </h4>
              <p className="text-[11px] md:text-xs text-[#678093] mt-0.5">
                {t(
                  'تواصل معنا عبر واتساب لتزويدك برقم الهاتف الخاص بحساب إنستاباي للتحويل فوراً.',
                  'Message us on WhatsApp to receive the linked InstaPay mobile number.'
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
              <button
                onClick={() => {
                  const text =
                    lang === 'en'
                      ? 'Hello Masarik Tourism, please share your InstaPay phone number for transfer.'
                      : 'السلام عليكم، أود الحصول على رقم التليفون المربوط بإنستاباي للتحويل من خلاله.';
                  openWhatsApp(text);
                }}
                className="bg-[#17344F] hover:bg-[#0F2437] text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                <span>{t('طلب رقم إنستاباي', 'Request Number')}</span>
              </button>

              <button
                onClick={() => {
                  const text =
                    lang === 'en'
                      ? 'Hello Masarik Tourism, I completed my InstaPay transfer and am attaching the payment receipt.'
                      : 'السلام عليكم، قمت بالتحويل عبر إنستاباي، وأرفق لكم إشعار السداد لتأكيد حجز المعاملة.';
                  openWhatsApp(text);
                }}
                className="bg-[#25D366] hover:bg-[#128C7E] text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{t('إرسال إشعار السداد', 'Send Receipt')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Paymob Card (Under Maintenance) */}
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm md:text-base font-bold text-[#17344F]">
                  {t('الدفع الإلكتروني (Paymob)', 'Online Card Gateway (Paymob)')}
                </h2>
                <span className="text-[11px] md:text-xs text-[#678093]">
                  {t('بطاقات فيزا / ماستركارد ومحافظ كاش', 'Visa / Mastercard & Mobile Wallets')}
                </span>
              </div>
            </div>

            <div className="bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
              <Wrench className="w-3.5 h-3.5 text-amber-700 animate-spin" />
              <span>{t('الخدمة تحت الصيانة حالياً', 'Under Maintenance')}</span>
            </div>
          </div>

          <p className="text-xs md:text-sm text-[#324D61] leading-relaxed">
            {t(
              'سداد فوري مشفر وموثق لرسوم منصة إنجاز، مواعيد تساهيل، وتذاكر الطيران مع استلام إيصال إلكتروني فوري.',
              'Encrypted online payment for Enjaz fees, Tasheer appointments, and flight bookings with instant receipt.'
            )}
          </p>

          <div className="bg-[#FFFBEB] border border-amber-200 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {t(
                'تنبيه للمتعاملين: تخضع بوابة Paymob حالياً لأعمال الترقية والتحديث الدوري. يمكنك السداد الفوري عبر إنستاباي بالأعلى أو إرسال بيانات المعاملة عبر الواتساب لإنجاز السداد فوراً.',
                'Notice: Paymob is currently undergoing scheduled maintenance. You can pay instantly via InstaPay above or message us on WhatsApp for immediate assistance.'
              )}
            </p>
          </div>

          <div className="pt-1">
            <button
              onClick={() => {
                const text =
                  lang === 'en'
                    ? 'Hello Masarik Tourism, I want to arrange payment for my service while Paymob is under maintenance.'
                    : 'السلام عليكم، أود إرسال بيانات المعاملة لمتابعة السداد والإنجاز نظراً لأن الدفع الإلكتروني يخضع للصيانة.';
                openWhatsApp(text);
              }}
              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-3 px-4 rounded-xl text-xs md:text-sm font-black shadow-md hover:shadow-lg transition active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{t('إرسال بيانات المعاملة عبر واتساب الآن', 'Send Payment Details via WhatsApp')}</span>
            </button>
          </div>
        </div>

        {/* 3. Bank Transfer Card */}
        <div className="bg-white border border-[#E2DAC8] rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF4F6] text-[#2A7688] flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-[#17344F]">
                {t('التحويل البنكي المباشر', 'Direct Bank Transfer')}
              </h2>
              <span className="text-[11px] md:text-xs text-[#678093]">
                {t('البنك الأهلي المصري • بنك مصر', 'National Bank of Egypt (NBE) • Banque Misr')}
              </span>
            </div>
          </div>

          <p className="text-xs md:text-sm text-[#324D61] leading-relaxed">
            {t(
              'تواصل عبر الواتساب للحصول على رقم الحساب البنكي الرسمي وتفاصيل التحويل الداخلي والدولي لتأكيد الحجز فوراً.',
              'Contact us via WhatsApp to obtain our official bank account details for local and international transfers.'
            )}
          </p>

          <button
            onClick={() => {
              const text =
                lang === 'en'
                  ? 'Hello Masarik Tourism, please share your official bank account details (NBE / Banque Misr) for payment.'
                  : 'السلام عليكم، أود الحصول على بيانات الحسابات البنكية الرسمية (البنك الأهلي / بنك مصر) لسداد المعاملة.';
              openWhatsApp(text);
            }}
            className="w-full bg-[#17344F] hover:bg-[#0F2437] text-white py-2.5 px-4 rounded-xl text-xs md:text-sm font-bold shadow-sm transition active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{t('طلب الحسابات البنكية عبر واتساب', 'Request Bank Account Details')}</span>
          </button>
        </div>

        {/* 4. Cash at Branch */}
        <div className="bg-white border border-[#E2DAC8] rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FAF8F2] text-[#9E7B33] border border-[#E5C887] flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-[#17344F]">
                {t('السداد نقداً في الفروع', 'Cash Payment at Our Office')}
              </h2>
              <span className="text-[11px] md:text-xs text-[#678093]">
                {localized.address}
              </span>
            </div>
          </div>

          <p className="text-xs md:text-sm text-[#324D61] leading-relaxed">
            {t(
              `شرّفنا في مقرنا الرسمي واستلم إيصالاً وعقداً موثقاً ومعتمداً بجميع المعاملات وخدمات التأشيرات والحجوزات الصادرة بسجل تجاري رقم ${TravelRepository.COMMERCIAL_RECORD} والرقم الموحد ${TravelRepository.UNIFIED_NUMBER}.`,
              `Visit our registered office to receive an official stamped receipt and service contract issued under Commercial Record No. ${TravelRepository.COMMERCIAL_RECORD} and Unified ID ${TravelRepository.UNIFIED_NUMBER}.`
            )}
          </p>

          <button
            onClick={onNavigateToContact}
            className="w-full bg-transparent hover:bg-[#FAF8F2] text-[#17344F] border-2 border-[#17344F] py-2.5 px-4 rounded-xl text-xs md:text-sm font-bold transition active:scale-[0.99] cursor-pointer"
          >
            {t('عرض عناوين ومواقع الفروع', 'View Office Address & Contact')}
          </button>
        </div>

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
              {t('رابط إنستاباي المباشر:', 'Direct InstaPay Link:')} {TravelRepository.INSTAPAY_URL}
            </li>
            <li>
              {t('البريد الرسمي للمتابعة المالية:', 'Official Billing Email:')} {TravelRepository.OFFICIAL_EMAIL}
            </li>
            <li>
              {t('للاستفسارات والتحصيلات المالية والواتساب:', 'WhatsApp & Billing Inquiries:')} {TravelRepository.PHONE_NUMBER}
            </li>
          </ul>
        </div>
      </div>

      {showPaymobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E2DAC8] relative text-start"
            dir={dir}
          >
            <button
              onClick={handleResetModal}
              className="absolute top-4 end-4 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {!paySuccess ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 text-[#17344F]">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#2A7688]" />
                    <h3 className="text-base font-bold text-[#0F2437]">
                      {t('سداد المعاملة عبر Paymob', 'Pay via Paymob')}
                    </h3>
                  </div>
                  <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {t('تحت الصيانة', 'Maintenance')}
                  </span>
                </div>

                <div className="bg-[#FFFBEB] border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    {t(
                      'تخضع البوابة للصيانة حالياً؛ يمكنك السداد عبر إنستاباي أو إرسال بيانات المعاملة عبر واتساب مباشرة.',
                      'Gateway is under maintenance; please pay via InstaPay or WhatsApp.'
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#324D61] mb-1">
                    {t('المبلغ المراد سداده (ج.م):', 'Amount (EGP):')}
                  </label>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2DAC8] focus:border-[#2A7688] focus:ring-1 focus:ring-[#2A7688] outline-none text-sm font-bold bg-[#FAF8F2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#324D61] mb-1.5">
                    {t('اختر وسيلة الدفع:', 'Select Method:')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'card', label: t('فيزا / ماستركارد', 'Visa / Master') },
                      { id: 'wallet', label: t('محافظ كاش', 'Mobile Wallet') },
                      { id: 'instapay', label: t('إنستاباي / ميزة', 'InstaPay / Meeza') },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMethod(m.id)}
                        className={`p-2 rounded-xl text-center text-xs font-bold border transition cursor-pointer ${
                          selectedMethod === m.id
                            ? 'bg-[#EAF4F6] text-[#2A7688] border-[#2A7688]'
                            : 'bg-white text-[#678093] border-[#E2DAC8]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[#FAF8F2] border border-[#E2DAC8] rounded-xl p-3 text-[11px] text-[#678093] space-y-1">
                  <div className="flex items-center gap-1 font-bold text-[#17344F]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#2A7688]" />
                    <span>{t('عملية آمنة ومشفرة 100%', '100% Encrypted Transaction')}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleStartPayment}
                    className="flex-1 bg-[#2A7688] hover:bg-[#1f5967] text-white py-2.5 rounded-xl text-xs font-bold shadow transition cursor-pointer"
                  >
                    {t('تأكيد السداد', 'Confirm Payment')}
                  </button>
                  <button
                    onClick={handleResetModal}
                    className="px-4 py-2.5 rounded-xl border border-[#E2DAC8] text-xs font-bold text-[#678093] hover:bg-gray-50 transition cursor-pointer"
                  >
                    {t('إلغاء', 'Cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-green-700">
                    {t('تمت عملية السداد بنجاح!', 'Payment Completed!')}
                  </h3>
                  <p className="text-xs text-[#324D61] mt-1">
                    {t('تم سداد مبلغ', 'Paid')} <span className="font-bold text-[#0F2437]">{payAmount} EGP</span>
                  </p>
                </div>

                <div className="bg-[#FAF8F2] border border-[#E2DAC8] rounded-xl p-3 text-start space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#678093]">{t('رقم المعاملة:', 'Transaction ID:')}</span>
                    <span className="font-mono font-bold text-[#17344F]">{transactionId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#678093]">{t('نسخة الإيصال إلى:', 'Receipt Sent To:')}</span>
                    <span className="font-bold text-[#2A7688] text-[11px] truncate max-w-[180px]">
                      {TravelRepository.OFFICIAL_EMAIL}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => {
                      const msg =
                        lang === 'en'
                          ? `Hello, I paid ${payAmount} EGP via Paymob (Ref: ${transactionId}). Please confirm.`
                          : `السلام عليكم، قمت بسداد مبلغ ${payAmount} ج.م عبر Paymob برقم معاملة: ${transactionId}. برجاء تأكيد المعاملة.`;
                      openWhatsApp(msg);
                      handleResetModal();
                    }}
                    className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-2.5 rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{t('إرسال تفاصيل الإيصال للواتساب', 'Send Receipt via WhatsApp')}</span>
                  </button>
                  <button
                    onClick={handleResetModal}
                    className="w-full py-2 rounded-xl text-xs font-bold text-[#678093] hover:text-[#17344F] transition cursor-pointer"
                  >
                    {t('إغلاق', 'Close')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

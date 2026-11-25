import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Lock,
  LogIn,
  FileText,
  CalendarCheck2,
} from 'lucide-react';
import { PublicOrderStatusSummary } from '../types/travel';
import {
  VISA_ORDER_STATUSES,
  getOrderStatusStageIndex,
  lookupPublicOrderStatusCloud,
  normalizeArabicDigits,
} from '../utils/travelerStore';
import { translateOrderStatus } from '../data/travelData';
import { useLanguage } from '../contexts/LanguageContext';

interface QuickOrderLookupCardProps {
  onOpenTravelerProfile: () => void;
}

export const QuickOrderLookupCard: React.FC<QuickOrderLookupCardProps> = ({
  onOpenTravelerProfile,
}) => {
  const { lang, t } = useLanguage();
  const [queryInput, setQueryInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [lookupResult, setLookupResult] = useState<PublicOrderStatusSummary | null>(null);
  const [inputError, setInputError] = useState('');

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeArabicDigits(queryInput).trim();
    if (cleaned.length < 4) {
      setInputError(
        t(
          'يرجى إدخال رقم الطلب (مثل MSK-5002428) أو رقم الواتساب المسجل.',
          'Please enter your Order No. (e.g. MSK-5002428) or registered phone number.'
        )
      );
      return;
    }

    setInputError('');
    setIsSearching(true);
    try {
      const res = await lookupPublicOrderStatusCloud(cleaned);
      setSearchedOnce(true);
      setLookupResult(res.found && res.statusSummary ? res.statusSummary : null);
    } finally {
      setIsSearching(false);
    }
  };

  const hasActiveLookupOrder = Boolean(
    lookupResult && lookupResult.orderStatus && lookupResult.orderStatus !== 'none'
  );
  const isCompleted =
    hasActiveLookupOrder &&
    lookupResult &&
    (lookupResult.orderStatus === 'تم تنفيذ الطلب' || lookupResult.orderStatus === 'مكتمل');
  const activeStageIdx = lookupResult ? getOrderStatusStageIndex(lookupResult.orderStatus) : -1;

  return (
    <section
      aria-labelledby="quick-order-lookup-heading"
      className="bg-white border-2 border-[#C6A052]/65 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0 shadow-xs">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="quick-order-lookup-heading"
              className="text-sm sm:text-base font-black text-[#0F2438]"
            >
              {t('الاستعلام السريع عن حالة الطلب', 'Quick Order Status Lookup')}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5 leading-relaxed">
              {t(
                'أدخل رقم الطلب (مثال: MSK-5002428) أو رقم الهاتف لمعرفة مرحلة طلبك الحالية دون كشف أي بيانات شخصية.',
                'Enter your Order Number (e.g. MSK-5002428) or Phone Number to check your current stage securely.'
              )}
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10.5px] font-bold text-slate-600 self-start sm:self-center shrink-0">
          <Lock className="w-3 h-3 text-[#0284C7]" />
          <span>{t('خصوصية محمية 100%', '100% Privacy Protected')}</span>
        </span>
      </div>

      <form onSubmit={handleLookupSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => {
              setQueryInput(e.target.value);
              if (inputError) setInputError('');
            }}
            placeholder={t(
              'رقم الطلب (MSK-...) أو رقم الواتساب (مثال: 01012345678)',
              'Order Code (MSK-...) or Phone Number (e.g. 01012345678)'
            )}
            className="w-full min-h-[46px] ps-10 pe-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs sm:text-sm font-bold text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C6A052]"
          />
        </div>

        <button
          type="submit"
          disabled={isSearching}
          className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer shrink-0 shadow-xs"
        >
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span>{isSearching ? t('جاري الاستعلام...', 'Checking...') : t('استعلام عن الحالة', 'Check Status')}</span>
        </button>
      </form>

      {inputError && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{inputError}</span>
        </div>
      )}

      {searchedOnce && !isSearching && !lookupResult && !inputError && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-black text-[#0F2438] block">
              {t('لم يتم العثور على طلب مطابق لهذا الرقم', 'No matching order found for this number')}
            </span>
            <p className="text-[11px] leading-relaxed">
              {t(
                'تأكد من إدخال رقم الطلب أو رقم الواتساب بشكل صحيح، أو سجل دخولك إلى حسابك لمتابعة طلباتك.',
                'Please double-check your Order Code or WhatsApp number, or sign in to your client account.'
              )}
            </p>
          </div>
        </div>
      )}

      {lookupResult && !hasActiveLookupOrder && (
        <div className="rounded-2xl p-4 sm:p-5 border border-slate-200 bg-slate-50 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-sm font-black text-[#0F2438] tabular-nums" dir="ltr">
              {lookupResult.orderCode}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600">
              {t('لا توجد طلبات مسجلة في محفظتك بعد — اختر خدمة للبدء', 'No orders recorded in your wallet yet — Choose a service to start')}
            </span>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onOpenTravelerProfile}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-[#0F2438] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{t('دخول حساب المسافر', 'Open Client Account')}</span>
            </button>
          </div>
        </div>
      )}

      {lookupResult && hasActiveLookupOrder && (
        <div
          className={`rounded-2xl p-4 sm:p-5 border space-y-4 ${
            isCompleted
              ? 'bg-emerald-50/70 border-emerald-300'
              : 'bg-[#FAF8F2] border-[#E5C887]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-slate-500 block">
                {t('مرجع الطلب:', 'Order Reference:')}
              </span>
              <span className="text-sm sm:text-base font-black text-[#0F2438] tabular-nums" dir="ltr">
                {lookupResult.orderCode}
              </span>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black shadow-xs ${
                isCompleted
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#0F2438] text-[#E5C887]'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 shrink-0" />
              )}
              <span>
                {isCompleted
                  ? t(
                      'تم تنفيذ الطلب - سجل دخولك لتحميل المستند',
                      'Order Completed — Sign in to Download Document'
                    )
                  : translateOrderStatus(lookupResult.orderStatus, lang)}
              </span>
            </div>
          </div>

          {/* 4-Stage Visual Mini Timeline (Strictly General Status, Zero PII) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {VISA_ORDER_STATUSES.map((st, idx) => {
              const done = idx < activeStageIdx;
              const current = idx === activeStageIdx;
              const StageIcon =
                idx === 0
                  ? FileText
                  : idx === 1
                  ? Clock
                  : idx === 2
                  ? CalendarCheck2
                  : FileCheck2;

              return (
                <div
                  key={st}
                  className={`rounded-xl p-2.5 border text-center flex flex-col items-center gap-1 ${
                    current
                      ? isCompleted
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-[#0F2438] text-white border-[#C6A052]'
                      : done
                      ? 'bg-emerald-100/80 text-emerald-950 border-emerald-300'
                      : 'bg-white/80 text-slate-400 border-slate-200'
                  }`}
                >
                  <StageIcon className="w-4 h-4 shrink-0" />
                  <span className="text-[10.5px] font-black leading-tight">
                    {translateOrderStatus(st, lang)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200/80">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {isCompleted || lookupResult.hasIssuedDocuments
                  ? t(
                      'تم تنفيذ الطلب — لتحميل مستنداتك الرسمية وحماية خصوصيتك يرجى تسجيل الدخول لحسابك.',
                      'Order completed! Please sign in securely to view and download your official documents.'
                    )
                  : t(
                      'حالة الطلب متاحة للعرض العام فقط؛ الدخول لحسابك يتيح متابعة التفاصيل والمستندات.',
                      'Public tracking shows general stage only; sign in to view full details and documents.'
                    )}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenTravelerProfile}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs ${
                isCompleted || lookupResult.hasIssuedDocuments
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-white hover:bg-slate-100 border border-slate-300 text-[#0F2438]'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>
                {isCompleted || lookupResult.hasIssuedDocuments
                  ? t('سجل دخولك لتحميل المستند', 'Sign In to Download Document')
                  : t('دخول حساب المسافر', 'Open Client Account')}
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

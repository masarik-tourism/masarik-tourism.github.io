import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  FolderOpen,
  Loader2,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { B2cVisaType, TravelerProfile } from '../types/travel';
import {
  buildB2cExitReminderWhatsAppMessage,
  calculateExpectedExitDate,
  evaluateB2cExitCountdown,
  formatB2cVisaTypeLabel,
  getTodayIsoDate,
  isB2cUrgentOrWarning,
} from '../utils/b2cVisaHelpers';
import {
  buildOrderCodeFromPhone,
  digitsOnly,
  formatPhoneForDisplay,
  getTravelerDisplayNames,
  markB2cVisaExitedCloud,
  normalizePhone,
  upsertB2cVisaTravelerCloud,
} from '../utils/travelerStore';
import { buildWhatsAppSendUrl, openWhatsApp } from '../utils/communication';
import { useLanguage } from '../contexts/LanguageContext';

interface B2cVisasPanelProps {
  travelers: TravelerProfile[];
  canManageClients: boolean;
  onRefreshTravelers: () => void;
  onOpenClientFolder: (phone: string) => void;
  onCopyValue: (key: string, val: string) => void;
  copiedKey: string | null;
}

const QUICK_STAY_DAYS = [15, 30, 80, 90] as const;

export const B2cVisasPanel: React.FC<B2cVisasPanelProps> = ({
  travelers,
  canManageClients,
  onRefreshTravelers,
  onOpenClientFolder,
  onCopyValue,
  copiedKey,
}) => {
  const { lang, t } = useLanguage();

  const [formMode, setFormMode] = useState<'new' | 'link'>('new');
  const [selectedExistingPhone, setSelectedExistingPhone] = useState('');
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [passportInput, setPassportInput] = useState('');
  const [visaType, setVisaType] = useState<B2cVisaType>('umrah_b2c');
  const [entryDate, setEntryDate] = useState<string>(() => getTodayIsoDate());
  const [stayDays, setStayDays] = useState<number>(30);
  const [customDaysInput, setCustomDaysInput] = useState<string>('30');
  const [notesInput, setNotesInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [listFilter, setListFilter] = useState<'active' | 'alerts' | 'exited'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [togglingExitPhone, setTogglingExitPhone] = useState<string | null>(null);

  const livePreviewExitDate = useMemo(
    () => calculateExpectedExitDate(entryDate, stayDays),
    [entryDate, stayDays]
  );

  const livePreviewEval = useMemo(
    () =>
      evaluateB2cExitCountdown({
        visaType,
        entryDate,
        stayDays,
        expectedExitDate: livePreviewExitDate,
        status: 'active',
      }),
    [visaType, entryDate, stayDays, livePreviewExitDate]
  );

  const linkableClients = useMemo(() => {
    const q = linkSearchQuery.trim().toLowerCase();
    return travelers
      .filter((tr) => {
        if (!q) return true;
        const code = (tr.orderCode || buildOrderCodeFromPhone(tr.phone)).toLowerCase();
        return (
          getTravelerDisplayNames(tr).fullDisplayName.toLowerCase().includes(q) ||
          tr.phone.includes(q) ||
          formatPhoneForDisplay(tr.phone).includes(q) ||
          (tr.passportNumber || '').toLowerCase().includes(q) ||
          code.includes(q)
        );
      })
      .slice(0, 40);
  }, [travelers, linkSearchQuery]);

  const handleSelectExistingClient = (phone: string) => {
    setSelectedExistingPhone(phone);
    const matched = travelers.find((tr) => tr.phone === phone);
    if (!matched) return;
    setNameInput(getTravelerDisplayNames(matched).fullDisplayName);
    setPhoneInput(matched.phone);
    setPassportInput((matched.passportNumber || '').toUpperCase());
    if (matched.b2cVisa) {
      setVisaType(matched.b2cVisa.visaType);
      setEntryDate(matched.b2cVisa.entryDate || getTodayIsoDate());
      setStayDays(matched.b2cVisa.stayDays || 30);
      setCustomDaysInput(String(matched.b2cVisa.stayDays || 30));
      setNotesInput(matched.b2cVisa.notes || '');
    }
  };

  const handleEditB2cTraveler = (client: TravelerProfile) => {
    setFormMode('link');
    handleSelectExistingClient(client.phone);
    setFormFeedback(null);
  };

  const handleStayDaysPick = (days: number) => {
    const safe = Math.max(1, Math.min(365, Math.round(days)));
    setStayDays(safe);
    setCustomDaysInput(String(safe));
  };

  const handleSaveB2cEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageClients || isSaving) return;
    setFormFeedback(null);

    if (formMode === 'link' && !selectedExistingPhone) {
      setFormFeedback({
        ok: false,
        text: t('يرجى اختيار عميل حالي أولاً للربط.', 'Please select an existing client first.'),
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await upsertB2cVisaTravelerCloud({
        existingPhone: formMode === 'link' ? selectedExistingPhone : undefined,
        name: nameInput,
        phone: formMode === 'link' ? selectedExistingPhone : phoneInput,
        passportNumber: passportInput,
        visaType,
        entryDate,
        stayDays,
        notes: notesInput,
      });

      if (!res.ok) {
        setFormFeedback({
          ok: false,
          text: res.error || t('تعذر حفظ بيانات تأشيرة B2C.', 'Failed to save B2C visa entry.'),
        });
        return;
      }

      setFormFeedback({
        ok: true,
        text: t(
          `تم تسجيل متابعة تأشيرة ${formatB2cVisaTypeLabel(visaType, 'ar')} وحساب موعد الخروج (${livePreviewExitDate}) بنجاح ✅`,
          `${formatB2cVisaTypeLabel(visaType, 'en')} saved with expected exit ${livePreviewExitDate} ✅`
        ),
      });

      if (formMode === 'new') {
        setNameInput('');
        setPhoneInput('');
        setPassportInput('');
        setNotesInput('');
      }
      setSelectedExistingPhone('');
      onRefreshTravelers();
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleExitArchive = async (client: TravelerProfile, exited: boolean) => {
    if (!canManageClients || togglingExitPhone) return;
    setTogglingExitPhone(client.phone);
    try {
      await markB2cVisaExitedCloud(client.phone, exited);
      onRefreshTravelers();
    } finally {
      setTogglingExitPhone(null);
    }
  };

  const handleSendExitReminderWhatsApp = (client: TravelerProfile) => {
    if (!client.b2cVisa) return;
    const evalRes = evaluateB2cExitCountdown(client.b2cVisa);
    if (!evalRes) return;
    const displayName = getTravelerDisplayNames(client).fullDisplayName;
    const phoneDigits = client.phoneNormalized || normalizePhone(client.phone);
    const msg = buildB2cExitReminderWhatsAppMessage({
      clientName: displayName,
      passportNumber: client.passportNumber,
      visaType: client.b2cVisa.visaType,
      expectedExitDate: evalRes.expectedExitDate,
      remainingDays: evalRes.remainingDays,
      lang,
    });
    openWhatsApp(buildWhatsAppSendUrl(phoneDigits, msg));
  };

  const allB2cClients = useMemo(
    () => travelers.filter((tr) => Boolean(tr.b2cVisa)),
    [travelers]
  );

  const activeB2cClients = useMemo(
    () => allB2cClients.filter((tr) => tr.b2cVisa?.status !== 'exited'),
    [allB2cClients]
  );

  const exitedB2cClients = useMemo(
    () => allB2cClients.filter((tr) => tr.b2cVisa?.status === 'exited'),
    [allB2cClients]
  );

  const alertB2cClients = useMemo(
    () => activeB2cClients.filter((tr) => isB2cUrgentOrWarning(tr.b2cVisa)),
    [activeB2cClients]
  );

  const urgentRedCount = useMemo(
    () =>
      activeB2cClients.filter(
        (tr) => evaluateB2cExitCountdown(tr.b2cVisa)?.alertLevel === 'urgent'
      ).length,
    [activeB2cClients]
  );

  const warningAmberCount = useMemo(
    () =>
      activeB2cClients.filter(
        (tr) => evaluateB2cExitCountdown(tr.b2cVisa)?.alertLevel === 'warning'
      ).length,
    [activeB2cClients]
  );

  const safeGreenCount = activeB2cClients.length - urgentRedCount - warningAmberCount;

  const displayedB2cList = useMemo(() => {
    const base =
      listFilter === 'exited'
        ? exitedB2cClients
        : listFilter === 'alerts'
        ? alertB2cClients
        : activeB2cClients;

    const q = searchQuery.trim().toLowerCase();
    const filtered = base.filter((tr) => {
      if (!q) return true;
      const code = (tr.orderCode || buildOrderCodeFromPhone(tr.phone)).toLowerCase();
      return (
        getTravelerDisplayNames(tr).fullDisplayName.toLowerCase().includes(q) ||
        tr.phone.includes(q) ||
        formatPhoneForDisplay(tr.phone).includes(q) ||
        (tr.passportNumber || '').toLowerCase().includes(q) ||
        code.includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const remA = evaluateB2cExitCountdown(a.b2cVisa)?.remainingDays ?? 9999;
      const remB = evaluateB2cExitCountdown(b.b2cVisa)?.remainingDays ?? 9999;
      return remA - remB;
    });
  }, [listFilter, activeB2cClients, alertB2cClients, exitedB2cClients, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Top B2C Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center tabular-nums">
        <button
          type="button"
          onClick={() => setListFilter('active')}
          className={`rounded-xl p-3 border transition cursor-pointer ${
            listFilter === 'active'
              ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438] shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300 text-[#0F2438]'
          }`}
        >
          <span className="text-[11px] block font-bold opacity-85">
            {t('مسافرو B2C النشطون', 'Active B2C')}
          </span>
          <span className="text-xl font-black font-mono">{activeB2cClients.length}</span>
        </button>

        <div className="rounded-xl p-3 border bg-emerald-50/70 border-emerald-200 text-emerald-900">
          <span className="text-[11px] block font-bold">
            {t('داخل المدة الآمنة', 'Safe Window')}
          </span>
          <span className="text-xl font-black font-mono">{Math.max(0, safeGreenCount)}</span>
        </div>

        <button
          type="button"
          onClick={() => setListFilter('alerts')}
          className={`rounded-xl p-3 border transition cursor-pointer ${
            listFilter === 'alerts'
              ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
              : 'bg-amber-50/80 border-amber-300 text-amber-900 hover:bg-amber-100'
          }`}
        >
          <span className="text-[11px] block font-bold">
            {t('قرب الانتهاء (≤ 5 أيام)', 'Expiring ≤ 5d')}
          </span>
          <span className="text-xl font-black font-mono">{warningAmberCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setListFilter('alerts')}
          className={`rounded-xl p-3 border transition cursor-pointer ${
            urgentRedCount > 0
              ? 'bg-red-50 border-red-400 text-red-900 hover:bg-red-100'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          <span className="text-[11px] block font-bold">
            {t('تحذير عاجل / متجاوز', 'Urgent / Overdue')}
          </span>
          <span className="text-xl font-black font-mono">{urgentRedCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setListFilter('exited')}
          className={`col-span-2 sm:col-span-1 rounded-xl p-3 border transition cursor-pointer ${
            listFilter === 'exited'
              ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="text-[11px] block font-bold">
            {t('تم الخروج / المؤرشف', 'Exited Archive')}
          </span>
          <span className="text-xl font-black font-mono">{exitedB2cClients.length}</span>
        </button>
      </div>

      {/* Add New or Link Existing B2C Traveler Form */}
      <form
        onSubmit={handleSaveB2cEntry}
        className="bg-gradient-to-br from-[#FAF8F2] via-white to-slate-50 border-2 border-[#C6A052]/65 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0 text-base">
              🕋
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                {t(
                  'تسجيل ومتابعة تأشيرات B2C (العمرة والحرة)',
                  'Register & Track B2C Visas (Umrah & Free)'
                )}
              </h3>
              <p className="text-[11px] text-slate-600">
                {t(
                  'حساب تلقائي لأقصى موعد خروج ومتابعة العد التنازلي لتجنب أي غرامات تأخير',
                  'Auto-calculates maximum departure deadline and tracks exit countdown'
                )}
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-black">
            <button
              type="button"
              onClick={() => {
                setFormMode('new');
                setSelectedExistingPhone('');
                setFormFeedback(null);
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                formMode === 'new'
                  ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F2438]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t('عميل B2C جديد', 'New Client')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFormMode('link');
                setFormFeedback(null);
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                formMode === 'link'
                  ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F2438]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{t('ربط عميل حالي', 'Link Existing')}</span>
            </button>
          </div>
        </div>

        {formMode === 'link' && (
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={linkSearchQuery}
                  onChange={(e) => setLinkSearchQuery(e.target.value)}
                  placeholder={t(
                    'ابحث لتحديد عميل حالي (الاسم، الهاتف، الجواز)...',
                    'Filter existing clients by name, phone, passport...'
                  )}
                  className="w-full ps-8 pe-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-[#0F2438]"
                />
              </div>
              <select
                value={selectedExistingPhone}
                onChange={(e) => handleSelectExistingClient(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-[#0F2438] font-bold"
              >
                <option value="">
                  {t('-- اختر العميل الحالي لربطه --', '-- Select Existing Client --')}
                </option>
                {linkableClients.map((tr) => (
                  <option key={tr.phone} value={tr.phone}>
                    {getTravelerDisplayNames(tr).fullDisplayName} · {formatPhoneForDisplay(tr.phone)}
                    {tr.passportNumber ? ` (${tr.passportNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {t('اسم المعتمر / المسافر *', 'Traveler Full Name *')}
            </label>
            <input
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={t('الاسم بالكامل', 'Full name')}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {t('رقم الواتساب *', 'WhatsApp Phone *')}
            </label>
            <input
              type="tel"
              inputMode="numeric"
              required={formMode === 'new'}
              disabled={formMode === 'link' && Boolean(selectedExistingPhone)}
              dir="ltr"
              value={phoneInput}
              onChange={(e) => setPhoneInput(digitsOnly(e.target.value, 20))}
              placeholder="01XXXXXXXXX"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 text-[#0F2438] tabular-nums"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {t('رقم جواز السفر', 'Passport Number')}
            </label>
            <input
              type="text"
              dir="ltr"
              value={passportInput}
              onChange={(e) => setPassportInput(e.target.value.toUpperCase())}
              placeholder="A12345678"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] uppercase tabular-nums"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {t('نوع التأشيرة *', 'Visa Category *')}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setVisaType('umrah_b2c')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-black transition cursor-pointer ${
                  visaType === 'umrah_b2c'
                    ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-[#C6A052]'
                }`}
              >
                {t('🕋 عمرة B2C', '🕋 Umrah B2C')}
              </button>
              <button
                type="button"
                onClick={() => setVisaType('free_b2c')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-black transition cursor-pointer ${
                  visaType === 'free_b2c'
                    ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-[#C6A052]'
                }`}
              >
                {t('🌍 B2C حرة', '🌍 Free B2C')}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {t('تاريخ الدخول / السفر الفعلي *', 'Actual Entry Date *')}
            </label>
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">
              {t('مدة الإقامة المحددة (بالأيام) *', 'Allowed Stay Duration (Days) *')}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_STAY_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleStayDaysPick(d)}
                  className={`px-3 py-2 rounded-xl border text-xs font-black transition cursor-pointer tabular-nums ${
                    stayDays === d
                      ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-[#C6A052]'
                  }`}
                >
                  {d} {t('يوم', 'd')}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={365}
                value={customDaysInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomDaysInput(val);
                  const num = Math.round(Number(val));
                  if (Number.isFinite(num) && num >= 1 && num <= 365) {
                    setStayDays(num);
                  }
                }}
                placeholder={t('أيام مخصصة', 'Custom')}
                className="w-24 px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-black text-center tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {t('ملاحظة إضافية (اختياري)', 'Optional Notes')}
            </label>
            <input
              type="text"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder={t('مثال: رحلة جدة / المدينة', 'e.g. Flight / Hotel note')}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
            />
          </div>
        </div>

        {/* Auto-Calculated Expected Exit Deadline Preview + Submit */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#C6A052]/30">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#C6A052]/60 text-[#0F2438] font-black">
              <Calendar className="w-4 h-4 text-[#9E7B33]" />
              <span>{t('أقصى موعد متوقع للخروج:', 'Expected Max Exit Date:')}</span>
              <strong className="font-mono text-sm text-[#0284C7]" dir="ltr">
                {livePreviewExitDate || '---'}
              </strong>
            </span>
            {livePreviewEval && (
              <span
                className={`px-3 py-2 rounded-xl border text-xs font-black tabular-nums ${
                  livePreviewEval.alertLevel === 'urgent'
                    ? 'bg-red-50 border-red-300 text-red-800'
                    : livePreviewEval.alertLevel === 'warning'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {livePreviewEval.remainingDays < 0
                  ? t(
                      `تجاوز المدة بـ ${Math.abs(livePreviewEval.remainingDays)} يوم`,
                      `Overdue by ${Math.abs(livePreviewEval.remainingDays)}d`
                    )
                  : livePreviewEval.remainingDays === 0
                  ? t('موعد الخروج اليوم!', 'Exit Deadline Today!')
                  : t(
                      `متبقي ${livePreviewEval.remainingDays} يوم`,
                      `${livePreviewEval.remainingDays} days left`
                    )}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>
              {formMode === 'link'
                ? t('حفظ وربط متابعة B2C للعميل', 'Save & Link B2C Tracking')
                : t('إضافة وحساب موعد الخروج', 'Add & Track Exit Deadline')}
            </span>
          </button>
        </div>

        {formFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
              formFeedback.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {formFeedback.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{formFeedback.text}</span>
          </div>
        )}
      </form>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(
              'ابحث في مسافري B2C بالاسم، رقم الواتساب، أو رقم الجواز...',
              'Search B2C travelers by name, WhatsApp phone, or passport...'
            )}
            className="w-full ps-10 pe-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#C6A052]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-black">
          <button
            type="button"
            onClick={() => setListFilter('active')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              listFilter === 'active'
                ? 'bg-[#0F2438] text-[#E5C887]'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t(`النشطون (${activeB2cClients.length})`, `Active (${activeB2cClients.length})`)}
          </button>
          <button
            type="button"
            onClick={() => setListFilter('alerts')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
              listFilter === 'alerts'
                ? 'bg-red-700 text-white'
                : alertB2cClients.length > 0
                ? 'bg-red-50 border border-red-200 text-red-800 hover:bg-red-100'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              {t(`تنبيهات الخروج (${alertB2cClients.length})`, `Exit Alerts (${alertB2cClients.length})`)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setListFilter('exited')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              listFilter === 'exited'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t(`الأرشيف (${exitedB2cClients.length})`, `Archived (${exitedB2cClients.length})`)}
          </button>
        </div>
      </div>

      {/* B2C Traveler Countdown Grid */}
      {displayedB2cList.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs sm:text-sm text-slate-500">
          {t(
            'لا يوجد مسافرون مسجلون في هذه القائمة حالياً. يمكنك إضافة مسافر من النموذج أعلاه.',
            'No B2C travelers in this view yet. Add one using the form above.'
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {displayedB2cList.map((client) => {
            const b2c = client.b2cVisa!;
            const evalRes = evaluateB2cExitCountdown(b2c);
            const displayName = getTravelerDisplayNames(client).fullDisplayName;
            const formattedPhone = formatPhoneForDisplay(client.phone);
            const waCopyKey = `b2c-wa-${client.phone}`;
            const alertLevel = evalRes?.alertLevel || 'safe';

            const cardTheme =
              alertLevel === 'exited'
                ? 'bg-slate-50 border-slate-300 opacity-90'
                : alertLevel === 'urgent'
                ? 'bg-red-50/45 border-red-400 ring-1 ring-red-200'
                : alertLevel === 'warning'
                ? 'bg-amber-50/50 border-amber-400 ring-1 ring-amber-200'
                : 'bg-white border-emerald-300';

            const barFillColor =
              alertLevel === 'exited'
                ? 'bg-slate-400'
                : alertLevel === 'urgent'
                ? 'bg-red-600'
                : alertLevel === 'warning'
                ? 'bg-amber-500'
                : 'bg-emerald-500';

            const statusBadgeClass =
              alertLevel === 'exited'
                ? 'bg-slate-200 text-slate-700 border-slate-300'
                : alertLevel === 'urgent'
                ? 'bg-red-100 text-red-900 border-red-300'
                : alertLevel === 'warning'
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200';

            const statusBadgeLabel =
              alertLevel === 'exited'
                ? t('✅ تم الخروج / مؤرشف', '✅ Exited / Archived')
                : alertLevel === 'urgent'
                ? (evalRes?.remainingDays ?? 0) < 0
                  ? t(
                      `🚨 متجاوز للمدة بـ ${Math.abs(evalRes?.remainingDays ?? 0)} يوم`,
                      `🚨 Overdue ${Math.abs(evalRes?.remainingDays ?? 0)}d`
                    )
                  : evalRes?.remainingDays === 0
                  ? t('🚨 أقصى موعد للخروج اليوم!', '🚨 Deadline Today!')
                  : t('🚨 تحذير عاجل: متبقي يوم واحد', '🚨 Urgent: 1 Day Left')
                : alertLevel === 'warning'
                ? t(
                    `⚠️ قرب الانتهاء: متبقي ${evalRes?.remainingDays} أيام`,
                    `⚠️ Expiring Soon: ${evalRes?.remainingDays}d left`
                  )
                : t(
                    `🟢 آمن: متبقي ${evalRes?.remainingDays} يوم`,
                    `🟢 Safe: ${evalRes?.remainingDays}d left`
                  );

            return (
              <div
                key={client.phone}
                className={`border-2 rounded-2xl p-4 space-y-3 shadow-xs transition ${cardTheme}`}
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h4 className="text-sm sm:text-base font-black text-[#0F2438]">
                        {displayName}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10.5px] font-black border ${
                          b2c.visaType === 'umrah_b2c'
                            ? 'bg-[#0F2438] text-[#E5C887] border-[#C6A052]'
                            : 'bg-sky-50 text-sky-900 border-sky-200'
                        }`}
                      >
                        {b2c.visaType === 'umrah_b2c'
                          ? t('🕋 عمرة B2C', '🕋 Umrah B2C')
                          : t('🌍 B2C حرة', '🌍 Free B2C')}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2 tabular-nums">
                      <span className="inline-flex items-center gap-1 bg-white/80 border border-slate-200 rounded-lg px-2 py-0.5">
                        <span dir="ltr" className="font-bold text-[#0F2438]">
                          {formattedPhone}
                        </span>
                        <button
                          type="button"
                          onClick={() => onCopyValue(waCopyKey, formattedPhone)}
                          title={t('نسخ الرقم', 'Copy Phone')}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                        >
                          {copiedKey === waCopyKey ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </span>
                      <span>
                        {t('الجواز:', 'Passport:')}{' '}
                        <strong className="text-[#0F2438] uppercase">
                          {client.passportNumber || t('غير مسجل', 'Not set')}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-xl border text-[11px] font-black shrink-0 ${statusBadgeClass}`}
                  >
                    {statusBadgeLabel}
                  </span>
                </div>

                {/* Dates & Countdown Progress Bar */}
                <div className="bg-white/90 border border-slate-200/90 rounded-xl p-3 space-y-2 text-xs">
                  <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                    <div>
                      <span className="text-[10.5px] text-slate-500 block font-bold">
                        {t('تاريخ الدخول', 'Entry Date')}
                      </span>
                      <strong className="font-mono text-[#0F2438]" dir="ltr">
                        {b2c.entryDate}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-500 block font-bold">
                        {t('مدة الإقامة', 'Stay Days')}
                      </span>
                      <strong className="text-[#0F2438]">
                        {b2c.stayDays} {t('يوم', 'd')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-500 block font-bold">
                        {t('أقصى موعد خروج', 'Max Exit')}
                      </span>
                      <strong
                        className={`font-mono ${
                          alertLevel === 'urgent'
                            ? 'text-red-700'
                            : alertLevel === 'warning'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                        dir="ltr"
                      >
                        {evalRes?.expectedExitDate || b2c.expectedExitDate}
                      </strong>
                    </div>
                  </div>

                  {evalRes && (
                    <div className="space-y-1">
                      <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barFillColor}`}
                          style={{ width: `${Math.max(4, evalRes.progressPercent)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-600 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {t(
                              `منقضي ${evalRes.elapsedDays} من ${evalRes.stayDays} يوم`,
                              `${evalRes.elapsedDays} of ${evalRes.stayDays} days elapsed`
                            )}
                          </span>
                        </span>
                        <span>{evalRes.progressPercent}%</span>
                      </div>
                    </div>
                  )}

                  {b2c.notes && (
                    <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                      {b2c.notes}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendExitReminderWhatsApp(client)}
                    className="px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{t('📲 إرسال تذكير واتساب', '📲 WhatsApp Reminder')}</span>
                  </button>

                  {b2c.status !== 'exited' ? (
                    <button
                      type="button"
                      disabled={togglingExitPhone === client.phone}
                      onClick={() => void handleToggleExitArchive(client, true)}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('✅ تم الخروج / إغلاق الملف', '✅ Mark Exited')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={togglingExitPhone === client.phone}
                      onClick={() => void handleToggleExitArchive(client, false)}
                      className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t('↩️ إعادة فتح المتابعة', '↩️ Reopen Tracking')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleEditB2cTraveler(client)}
                    title={t('تعديل بيانات الإقامة', 'Edit Stay Details')}
                    className="px-2.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-[#0F2438] text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{t('تعديل', 'Edit')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenClientFolder(client.phone)}
                    className="ms-auto px-3 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{t('الملف', 'Folder')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

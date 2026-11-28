import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  MapPin,
  QrCode,
  Save,
  Send,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { AppointmentDetails, TravelerProfile } from '../types/travel';
import { useLanguage } from '../contexts/LanguageContext';
import { openWhatsApp } from '../utils/communication';
import { buildWhatsAppSendUrl, normalizeWhatsAppPhoneDigits } from '../utils/whatsappHelpers';
import { buildOrderCodeFromPhone, getTravelerDisplayNames } from '../utils/travelerStore';
import {
  APPOINTMENT_SERVICE_PRESETS,
  APPOINTMENT_TIME_SLOTS,
  AppointmentServicePreset,
  buildAppointment24hReminderWhatsAppMessage,
  buildCalendarMonthMatrix,
  evaluateAppointmentReminderStatus,
  formatReadableDateAr,
} from '../utils/appointmentCalendarHelpers';

interface AppointmentCalendarWidgetProps {
  client: TravelerProfile;
  allTravelers?: TravelerProfile[];
  onSaveAppointment: (updatedAppt: AppointmentDetails) => void;
  onOpenQrPassModal: () => void;
  canManageClients?: boolean;
}

export const AppointmentCalendarWidget: React.FC<AppointmentCalendarWidgetProps> = ({
  client,
  allTravelers = [],
  onSaveAppointment,
  onOpenQrPassModal,
  canManageClients = true,
}) => {
  const { lang, dir, t } = useLanguage();
  const existingAppt = client.appointmentDetails;

  const today = useMemo(() => new Date(), []);
  const initialDate = existingAppt?.appointmentDate
    ? new Date(existingAppt.appointmentDate)
    : today;
  const initialYear = Number.isFinite(initialDate.getFullYear())
    ? initialDate.getFullYear()
    : today.getFullYear();
  const initialMonth = Number.isFinite(initialDate.getMonth())
    ? initialDate.getMonth()
    : today.getMonth();

  const [calendarYear, setCalendarYear] = useState<number>(initialYear);
  const [calendarMonth, setCalendarMonth] = useState<number>(initialMonth); // 0-indexed

  // Form Draft States
  const [draftServiceType, setDraftServiceType] = useState<string>(
    existingAppt?.serviceType || client.preferredVisaType || 'موعد تساهيل (VFS Tasheer)'
  );
  const [draftDate, setDraftDate] = useState<string>(existingAppt?.appointmentDate || '');
  const [draftTime, setDraftTime] = useState<string>(existingAppt?.appointmentTime || '10:00');
  const [draftLocation, setDraftLocation] = useState<string>(existingAppt?.location || '');
  const [draftReference, setDraftReference] = useState<string>(existingAppt?.referenceNumber || '');
  const [draftNotes, setDraftNotes] = useState<string>(existingAppt?.notes || '');
  const [autoReminderEnabled, setAutoReminderEnabled] = useState<boolean>(
    existingAppt?.autoReminderEnabled !== false
  );
  const [reminderSentAt, setReminderSentAt] = useState<string | undefined>(
    existingAppt?.reminder24hSentAt
  );

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<
    'all' | 'tasheer' | 'gamca' | 'embassy'
  >('all');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  // Map scheduled appointments across all travelers by date for calendar dots
  const appointmentsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tr of allTravelers) {
      const d = tr.appointmentDetails?.appointmentDate?.trim();
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        map[d] = (map[d] || 0) + 1;
      }
    }
    return map;
  }, [allTravelers]);

  // Calendar month matrix
  const monthWeeks = useMemo(() => {
    return buildCalendarMonthMatrix(
      calendarYear,
      calendarMonth,
      draftDate,
      appointmentsByDate
    );
  }, [calendarYear, calendarMonth, draftDate, appointmentsByDate]);

  // Real-time evaluation of current appointment status
  const currentEvaluation = useMemo(() => {
    return evaluateAppointmentReminderStatus({
      serviceType: draftServiceType,
      appointmentDate: draftDate,
      appointmentTime: draftTime,
      location: draftLocation,
      referenceNumber: draftReference,
      notes: draftNotes,
      reminder24hSentAt: reminderSentAt,
      autoReminderEnabled,
    });
  }, [
    draftServiceType,
    draftDate,
    draftTime,
    draftLocation,
    draftReference,
    draftNotes,
    reminderSentAt,
    autoReminderEnabled,
  ]);

  const names = getTravelerDisplayNames(client);
  const clientDisplayName =
    client.passportFullName?.trim() || names.fullDisplayName || client.name;
  const orderCode = client.orderCode || buildOrderCodeFromPhone(client.phone);

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  };

  const handleTodayClick = () => {
    const now = new Date();
    setCalendarYear(now.getFullYear());
    setCalendarMonth(now.getMonth());
    const isoToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
    setDraftDate(isoToday);
  };

  const handleSelectPreset = (preset: AppointmentServicePreset) => {
    setDraftServiceType(preset.titleAr);
    if (!draftLocation || draftLocation === existingAppt?.location) {
      setDraftLocation(preset.defaultLocationAr);
    }
    if (!draftReference) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setDraftReference(`${preset.defaultRefPrefix}-${randomSuffix}`);
    }
    if (preset.checklistAr.length > 0) {
      setDraftNotes(preset.checklistAr.join(' • '));
    }
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canManageClients) return;

    const updatedAppt: AppointmentDetails = {
      serviceType: draftServiceType.trim() || 'موعد خدمة سياحية',
      appointmentDate: draftDate.trim(),
      appointmentTime: draftTime.trim(),
      location: draftLocation.trim() || undefined,
      referenceNumber: draftReference.trim().toUpperCase() || undefined,
      notes: draftNotes.trim() || undefined,
      reminder24hSentAt: reminderSentAt || undefined,
      autoReminderEnabled,
      updatedAt: new Date().toISOString(),
    };

    onSaveAppointment(updatedAppt);
    setSaveFeedback(t('تم حفظ وتحديث الموعد ومزامنته بنجاح ✓', 'Appointment saved & synced successfully ✓'));
    setTimeout(() => setSaveFeedback(null), 3000);
  };

  const handleSendWhatsApp24hReminder = () => {
    if (!draftDate.trim()) {
      alert(t('يرجى تحديد تاريخ الموعد أولاً', 'Please select appointment date first'));
      return;
    }
    const phoneDigits = client.phoneNormalized || normalizeWhatsAppPhoneDigits(client.phone);
    const msg = buildAppointment24hReminderWhatsAppMessage({
      clientName: clientDisplayName,
      orderCode,
      serviceType: draftServiceType,
      appointmentDate: draftDate,
      appointmentTime: draftTime,
      location: draftLocation,
      referenceNumber: draftReference,
      notes: draftNotes,
      lang: lang as 'ar' | 'en',
    });

    // Stamp reminder timestamp & persist
    const nowIso = new Date().toISOString();
    setReminderSentAt(nowIso);

    const updatedAppt: AppointmentDetails = {
      serviceType: draftServiceType.trim() || 'موعد خدمة سياحية',
      appointmentDate: draftDate.trim(),
      appointmentTime: draftTime.trim(),
      location: draftLocation.trim() || undefined,
      referenceNumber: draftReference.trim().toUpperCase() || undefined,
      notes: draftNotes.trim() || undefined,
      reminder24hSentAt: nowIso,
      autoReminderEnabled,
      updatedAt: nowIso,
    };
    onSaveAppointment(updatedAppt);

    openWhatsApp(buildWhatsAppSendUrl(phoneDigits, msg));
    setSaveFeedback(
      t(
        'تم تجهيز تذكير الواتساب وتسجيل المزامنة بنجاح ✅',
        '24h WhatsApp reminder synced & dispatched ✅'
      )
    );
    setTimeout(() => setSaveFeedback(null), 3500);
  };

  const monthNameAr = new Date(calendarYear, calendarMonth, 1).toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric',
  });
  const monthNameEn = new Date(calendarYear, calendarMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const filteredPresets = useMemo(() => {
    if (selectedCategoryFilter === 'all') return APPOINTMENT_SERVICE_PRESETS;
    return APPOINTMENT_SERVICE_PRESETS.filter((p) => p.category === selectedCategoryFilter);
  }, [selectedCategoryFilter]);

  return (
    <div className="space-y-4 text-xs">
      {/* Top Header Card & 24h Reminder Live Sync Banner */}
      <div className="bg-gradient-to-l from-[#0F2438] via-[#163B65] to-[#0F2438] border-2 border-[#C6A052] rounded-2xl p-4 sm:p-5 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C6A052] text-[#0A1926] flex items-center justify-center font-black shadow-xs shrink-0">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white">
                  {t('تقويم جدولة مواعيد تساهيل وجامكا', 'Tasheer & GAMCA Appointment Scheduler')}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-black border ${currentEvaluation.statusBadge.bgClass} ${currentEvaluation.statusBadge.colorClass} ${currentEvaluation.statusBadge.borderClass}`}
                >
                  {currentEvaluation.statusBadge.textAr}
                </span>
              </div>
              <p className="text-slate-300 text-xs mt-0.5">
                {t(
                  'جدولة مواعيد البصمة والفحص الطبي وإرسال تذكير واتساب تلقائي للعميل قبل الموعد بـ 24 ساعة.',
                  'Schedule biometrics and medical appointments with 24-hour prior WhatsApp reminders.'
                )}
              </p>
            </div>
          </div>

          {/* Quick Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenQrPassModal}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#E5C887] border border-[#C6A052]/40 text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{t('معاينة بطاقة QR Pass', 'Preview QR Pass')}</span>
            </button>
            <button
              type="button"
              onClick={handleSendWhatsApp24hReminder}
              disabled={!draftDate}
              className={`px-3 py-1.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                currentEvaluation.isDueForReminder
                  ? 'bg-[#25D366] hover:bg-[#128C7E] text-white ring-2 ring-white/30 animate-bounce'
                  : 'bg-[#25D366]/90 hover:bg-[#25D366] text-white'
              } disabled:opacity-50`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t('إرسال تذكير 24h واتساب 📲', 'Send 24h WhatsApp 📲')}</span>
            </button>
          </div>
        </div>

        {/* 24-Hour Reminder Sync Status Strip */}
        <div className="pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#C6A052]" />
              <span className="text-slate-300 font-bold">{t('حالة التوقيت:', 'Countdown:')}</span>
              <span className="font-black text-[#E5C887] font-mono tabular-nums">
                {currentEvaluation.hoursRemaining !== null
                  ? currentEvaluation.hoursRemaining > 0
                    ? t(
                        `باقي ${currentEvaluation.hoursRemaining} ساعة على الموعد`,
                        `${currentEvaluation.hoursRemaining} hours remaining`
                      )
                    : t('موعد منقضي / حان الآن', 'Due now / past')
                  : t('غير محدد بعد', 'Not set')}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  reminderSentAt ? 'text-emerald-400' : 'text-slate-400'
                }`}
              />
              <span className="text-slate-300 font-bold">{t('حالة تذكير الـ 24 ساعة:', '24h Sync:')}</span>
              <span
                className={`font-black ${
                  reminderSentAt ? 'text-emerald-300' : 'text-amber-200'
                }`}
              >
                {reminderSentAt
                  ? t('تمت المزامنة والإرسال بنجاح ✅', 'Synced & Sent ✅')
                  : currentEvaluation.isDueForReminder
                  ? t('مستحق الإرسال الآن (خلال 24h) ⏰', 'Due now for dispatch ⏰')
                  : t('مجدول تلقائياً قبل الموعد بـ 24 ساعة', 'Scheduled 24h prior')}
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-white/10 px-2.5 py-1 rounded-xl border border-white/10 select-none">
            <input
              type="checkbox"
              checked={autoReminderEnabled}
              onChange={(e) => setAutoReminderEnabled(e.target.checked)}
              className="accent-[#C6A052] w-3.5 h-3.5 rounded"
            />
            <span className="text-[11px] font-bold text-slate-200">
              {t('تفعيل المزامنة والتنبيه التلقائي للموعد', 'Auto-reminder sync enabled')}
            </span>
          </label>
        </div>
      </div>

      {saveFeedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-black text-center flex items-center justify-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* Main Grid: Left Column = Interactive Calendar, Right Column = Appointment Details Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (5 Cols): Interactive Month Calendar */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-[#0F2438]">
                {dir === 'rtl' ? monthNameAr : monthNameEn}
              </span>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                ({calendarYear})
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleTodayClick}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[10.5px] font-bold cursor-pointer transition"
              >
                {t('اليوم', 'Today')}
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label={t('الشهر السابق', 'Previous Month')}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label={t('الشهر التالي', 'Next Month')}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Headers (Standard Arab Week: Saturday to Friday) */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-[11px] text-slate-500 py-1">
            <span>{t('سبت', 'Sat')}</span>
            <span>{t('أحد', 'Sun')}</span>
            <span>{t('إثن', 'Mon')}</span>
            <span>{t('ثلا', 'Tue')}</span>
            <span>{t('أرب', 'Wed')}</span>
            <span>{t('خمي', 'Thu')}</span>
            <span className="text-red-500">{t('جمع', 'Fri')}</span>
          </div>

          {/* Month Day Cells */}
          <div className="space-y-1">
            {monthWeeks.map((week, wIdx) => (
              <div key={wIdx} className="grid grid-cols-7 gap-1">
                {week.map((cell) => {
                  const isSelected = cell.isoDate === draftDate;
                  const hasDot = cell.appointmentCount > 0;
                  return (
                    <button
                      key={cell.isoDate}
                      type="button"
                      onClick={() => setDraftDate(cell.isoDate)}
                      className={`relative min-h-[38px] sm:min-h-[42px] p-1 rounded-xl text-xs font-black flex flex-col items-center justify-center transition cursor-pointer select-none ${
                        isSelected
                          ? 'bg-[#C6A052] text-[#0A1926] shadow-sm ring-2 ring-[#0F2438]'
                          : cell.isToday
                          ? 'bg-[#0F2438]/5 text-[#0F2438] ring-1 ring-[#C6A052]'
                          : !cell.isCurrentMonth
                          ? 'text-slate-300 hover:bg-slate-50'
                          : cell.isPast
                          ? 'text-slate-400 hover:bg-slate-50'
                          : 'text-[#0F2438] hover:bg-[#FAF8F2]'
                      }`}
                    >
                      <span className="tabular-nums font-mono">{cell.dayNumber}</span>
                      {hasDot && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                            isSelected ? 'bg-[#0A1926]' : 'bg-[#C6A052]'
                          }`}
                          title={t(
                            `${cell.appointmentCount} موعد مسجل في هذا اليوم`,
                            `${cell.appointmentCount} appointment(s) scheduled on this day`
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[10.5px] text-slate-500 font-bold">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-[#C6A052]" />
              <span>{t('الموعد المحدد', 'Selected Date')}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded border border-[#C6A052] bg-[#0F2438]/5" />
              <span>{t('اليوم', 'Today')}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C6A052]" />
              <span>{t('مواعيد مسجلة', 'Booked Days')}</span>
            </span>
          </div>

          {/* Quick Date Display Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">
              {t('تاريخ الموعد المختار حالياً', 'Selected Appointment Date')}
            </span>
            <span className="text-sm font-black text-[#0F2438]">
              {draftDate ? formatReadableDateAr(draftDate) : t('لم يتم الاختيار بعد', 'Not selected yet')}
            </span>
          </div>
        </div>

        {/* Right Column (7 Cols): Appointment Details & Presets Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          {/* Preset Buttons Header */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-black text-[#0F2438] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C6A052]" />
                <span>{t('قوالب تساهيل وجامكا الجاهزة (1-Click Fill)', 'Tasheer & GAMCA Quick Presets')}</span>
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'all', labelAr: 'الكل' },
                    { id: 'tasheer', labelAr: 'تساهيل VFS' },
                    { id: 'gamca', labelAr: 'جامكا' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold transition cursor-pointer ${
                      selectedCategoryFilter === cat.id
                        ? 'bg-[#0F2438] text-[#E5C887]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.labelAr}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredPresets.slice(0, 4).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-[#C6A052] bg-slate-50 hover:bg-[#FAF8F2] text-start transition cursor-pointer flex flex-col justify-between gap-1 group"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-black text-[#0F2438] text-[11px] group-hover:text-[#9E7B33] truncate">
                      {preset.titleAr}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-white text-[9.5px] font-mono border border-slate-200 text-slate-500 shrink-0">
                      {preset.defaultRefPrefix}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 truncate">
                    {preset.defaultLocationAr}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-3 pt-2 border-t border-slate-100">
            {/* Service Type Input */}
            <div>
              <label className="block font-bold text-slate-600 mb-1">
                {t('نوع الموعد / الخدمة', 'Service / Appointment Type')}
              </label>
              <input
                type="text"
                value={draftServiceType}
                onChange={(e) => setDraftServiceType(e.target.value)}
                placeholder={t(
                  'مثال: موعد تساهيل (VFS Tasheer) — المنصورة / كشف طبي جامكا',
                  'e.g. VFS Tasheer Mansoura / GAMCA Medical'
                )}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-bold focus:border-[#0F2438] focus:outline-none"
              />
            </div>

            {/* Date and Time Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-600 mb-1">
                  {t('تاريخ الموعد المحدد (YYYY-MM-DD)', 'Appointment Date')}
                </label>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-mono font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">
                  {t('وقت الموعد المحدد', 'Appointment Time')}
                </label>
                <input
                  type="time"
                  value={draftTime}
                  onChange={(e) => setDraftTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-mono font-bold tabular-nums"
                />
              </div>
            </div>

            {/* Quick Time Slots Chips */}
            <div className="space-y-1">
              <span className="text-[10.5px] font-bold text-slate-500 block">
                {t('اختيار وقت سريع:', 'Quick Time Slots:')}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {APPOINTMENT_TIME_SLOTS.slice(0, 8).map((ts) => (
                  <button
                    key={ts}
                    type="button"
                    onClick={() => setDraftTime(ts)}
                    className={`px-2 py-1 rounded-lg text-[10.5px] font-mono font-bold transition cursor-pointer ${
                      draftTime === ts
                        ? 'bg-[#0F2438] text-[#E5C887]'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {ts}
                  </button>
                ))}
              </div>
            </div>

            {/* Center / Location and Reference */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-600 mb-1">
                  {t('المركز / الفرع / العنوان', 'Location / Center Branch')}
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute start-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={draftLocation}
                    onChange={(e) => setDraftLocation(e.target.value)}
                    placeholder={t('مثال: فرع تساهيل المنصورة / معمل جامكا', 'e.g. Tasheer Mansoura / GAMCA Lab')}
                    className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">
                  {t('رقم الحجز / المرجع (Reference No)', 'Booking Reference Number')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={draftReference}
                    onChange={(e) => setDraftReference(e.target.value.toUpperCase())}
                    placeholder="VFS-MN-9921 / GAMCA-771"
                    className="w-full ps-3 pe-8 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-mono font-bold text-xs uppercase"
                  />
                  {draftReference && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(draftReference);
                        setCopiedRef(true);
                        setTimeout(() => setCopiedRef(false), 2000);
                      }}
                      title={t('نسخ رقم المرجع', 'Copy Reference')}
                      className="absolute end-2 top-2 text-slate-400 hover:text-[#0F2438] cursor-pointer"
                    >
                      {copiedRef ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Notes & Client Checklist */}
            <div>
              <label className="block font-bold text-slate-600 mb-1">
                {t('تعليمات الحضور والأوراق المطلوبة (تُرسل في التذكير)', 'Client Instructions & Checklist')}
              </label>
              <textarea
                rows={2}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder={t(
                  'أصل جواز السفر صالح 6+ أشهر • 2 صور شخصية خلفية بيضاء • الصيام (في كشف جامكا) • إشعار الباركود',
                  'Passport valid 6+ months • 2 photos with white background • Fasting for GAMCA • Barcode pass'
                )}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] text-xs resize-none"
              />
            </div>

            {/* Action Bar */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  disabled={!canManageClients}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{t('حفظ ومزامنة الموعد', 'Save & Sync Appointment')}</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenQrPassModal}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-[#C6A052]" />
                  <span>{t('بطاقة الباركود', 'QR Pass')}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSendWhatsApp24hReminder}
                disabled={!draftDate}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{t('إرسال تذكير واتساب 24h 📲', 'Send 24h WhatsApp 📲')}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

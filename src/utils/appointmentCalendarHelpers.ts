import { AppointmentDetails, TravelerProfile } from '../types/travel';
import { buildOrderCodeFromPhone, getTravelerDisplayNames } from './travelerStore';

export interface AppointmentServicePreset {
  id: string;
  category: 'tasheer' | 'gamca' | 'embassy' | 'travel';
  categoryLabelAr: string;
  categoryLabelEn: string;
  titleAr: string;
  titleEn: string;
  defaultLocationAr: string;
  defaultLocationEn: string;
  defaultRefPrefix: string;
  checklistAr: string[];
}

export const APPOINTMENT_SERVICE_PRESETS: AppointmentServicePreset[] = [
  {
    id: 'vfs_mansoura',
    category: 'tasheer',
    categoryLabelAr: 'تساهيل (VFS Tasheer)',
    categoryLabelEn: 'VFS Tasheer',
    titleAr: 'موعد تساهيل (VFS Tasheer) — فرع المنصورة',
    titleEn: 'VFS Tasheer — Mansoura Branch',
    defaultLocationAr: 'فرع تساهيل المنصورة، حي الجامعة، شارع الجيش',
    defaultLocationEn: 'VFS Tasheer Mansoura, University District, El-Geish St',
    defaultRefPrefix: 'VFS-MN',
    checklistAr: [
      'أصل جواز السفر صالح لأكثر من 6 أشهر',
      'عدد 2 صورة شخصية بخلفية بيضاء مقاس 4x6',
      'إشعار حجز الموعد المطبوع متضمناً الباركود',
      'مستند التأشيرة أو طلب إنجاز مطبوع',
    ],
  },
  {
    id: 'vfs_cairo_sheraton',
    category: 'tasheer',
    categoryLabelAr: 'تساهيل (VFS Tasheer)',
    categoryLabelEn: 'VFS Tasheer',
    titleAr: 'موعد تساهيل (VFS Tasheer) — فرع القاهرة (شيراتون)',
    titleEn: 'VFS Tasheer — Cairo Sheraton Branch',
    defaultLocationAr: 'فرع تساهيل شيراتون، مساكن شيراتون، هليوبوليس، القاهرة',
    defaultLocationEn: 'VFS Tasheer Sheraton, Heliopolis, Cairo',
    defaultRefPrefix: 'VFS-CAI',
    checklistAr: [
      'أصل جواز السفر صالح لأكثر من 6 أشهر',
      'عدد 2 صورة شخصية بخلفية بيضاء مقاس 4x6',
      'إشعار حجز الموعد المطبوع متضمناً الباركود',
      'إيصال تسديد الرسوم البنكية (إن وجد)',
    ],
  },
  {
    id: 'vfs_alexandria',
    category: 'tasheer',
    categoryLabelAr: 'تساهيل (VFS Tasheer)',
    categoryLabelEn: 'VFS Tasheer',
    titleAr: 'موعد تساهيل (VFS Tasheer) — فرع الإسكندرية (سموحة)',
    titleEn: 'VFS Tasheer — Alexandria Smouha Branch',
    defaultLocationAr: 'فرع تساهيل سموحة، أبراج سموحة جرين سيتي، الإسكندرية',
    defaultLocationEn: 'VFS Tasheer Smouha, Green City Towers, Alexandria',
    defaultRefPrefix: 'VFS-ALX',
    checklistAr: [
      'أصل جواز السفر صالح لأكثر من 6 أشهر',
      'عدد 2 صورة شخصية بخلفية بيضاء حديثة',
      'إشعار حجز الموعد المطبوع',
      'كافة الأوراق الثبوتية الخاصة بطلب الزيارة/العمل',
    ],
  },
  {
    id: 'vfs_suez',
    category: 'tasheer',
    categoryLabelAr: 'تساهيل (VFS Tasheer)',
    categoryLabelEn: 'VFS Tasheer',
    titleAr: 'موعد تساهيل (VFS Tasheer) — فرع السويس',
    titleEn: 'VFS Tasheer — Suez Branch',
    defaultLocationAr: 'فرع تساهيل بورتوفيق، محافظة السويس',
    defaultLocationEn: 'VFS Tasheer Port Tawfiq, Suez',
    defaultRefPrefix: 'VFS-SUZ',
    checklistAr: [
      'أصل جواز السفر مع صورتين منه',
      'صور شخصية 4x6 خلفية بيضاء',
      'إشعار باركود الموعد',
    ],
  },
  {
    id: 'gamca_cairo',
    category: 'gamca',
    categoryLabelAr: 'فحص جامكا (GAMCA)',
    categoryLabelEn: 'GAMCA Medical',
    titleAr: 'كشف طبي جامكا (GAMCA) — المركز المعتمد بالقاهرة',
    titleEn: 'GAMCA Medical — Cairo Accredited Center',
    defaultLocationAr: 'المركز الطبي المعتمد لفحص الوافدين (جامكا)، الدقي / المهندسين',
    defaultLocationEn: 'GAMCA Accredited Center, Dokki / Mohandessin, Cairo',
    defaultRefPrefix: 'GAMCA-CAI',
    checklistAr: [
      'أصل جواز السفر ساري المفعول',
      'برنت حجز جامكا الأصلي المعتمد (Slip)',
      'عدد 4 صور شخصية حديثة بخلفية بيضاء',
      'الصيام من 8 إلى 10 ساعات قبل الفحص للتحاليل',
    ],
  },
  {
    id: 'gamca_alex',
    category: 'gamca',
    categoryLabelAr: 'فحص جامكا (GAMCA)',
    categoryLabelEn: 'GAMCA Medical',
    titleAr: 'كشف طبي جامكا (GAMCA) — المركز المعتمد بالإسكندرية',
    titleEn: 'GAMCA Medical — Alexandria Accredited Center',
    defaultLocationAr: 'المركز الطبي المعتمد لفحص الوافدين (جامكا)، محطة الرمل، الإسكندرية',
    defaultLocationEn: 'GAMCA Accredited Center, Raml Station, Alexandria',
    defaultRefPrefix: 'GAMCA-ALX',
    checklistAr: [
      'أصل جواز السفر ساري المفعول',
      'برنت حجز جامكا الأصلي المعتمد (Slip)',
      'عدد 4 صور شخصية حديثة بخلفية بيضاء',
      'الصيام لإجراء فحوصات الدم والبول والأشعة',
    ],
  },
  {
    id: 'gamca_general',
    category: 'gamca',
    categoryLabelAr: 'فحص جامكا (GAMCA)',
    categoryLabelEn: 'GAMCA Medical',
    titleAr: 'فحص وافدين جامكا (GAMCA) — الكشف الشامل وإصدار اللياقة',
    titleEn: 'GAMCA Comprehensive Expatriate Medical Examination',
    defaultLocationAr: 'المركز الطبي المعتمد المخصص في باركود جامكا الرسمي',
    defaultLocationEn: 'Designated GAMCA Medical Center on official slip',
    defaultRefPrefix: 'GAMCA-FIT',
    checklistAr: [
      'أصل الجواز + إشعار الحجز',
      'صور شخصية مقاس 4x6',
      'الالتزام بتعليمات الصيام والراحة قبل الفحص',
    ],
  },
  {
    id: 'embassy_biometrics',
    category: 'embassy',
    categoryLabelAr: 'سفارات وقنصليات',
    categoryLabelEn: 'Embassy & Consulates',
    titleAr: 'موعد البصمة والمقابلة بالقنصلية / السفارة',
    titleEn: 'Consulate Biometrics & Interview Appointment',
    defaultLocationAr: 'مقر القنصلية / السفارة المعتمدة بالقاهرة أو الإسكندرية',
    defaultLocationEn: 'Accredited Embassy / Consulate Office',
    defaultRefPrefix: 'EMB-APPT',
    checklistAr: [
      'أصل جواز السفر وبطاقة الرقم القومي',
      'كشف الحساب البنكي المعتمد (إن تطلب)',
      'صور شخصية مطابقة للمواصفات',
      'إشعار تأكيد الموعد بالسفارة',
    ],
  },
  {
    id: 'travel_flight',
    category: 'travel',
    categoryLabelAr: 'طيران وفنادق',
    categoryLabelEn: 'Flights & Hotels',
    titleAr: 'موعد تأكيد تذاكر الطيران والحجز الفندقي',
    titleEn: 'Flight Tickets & Hotel Confirmation',
    defaultLocationAr: 'مطار الإقلاع / مكتب المتابعة المركزي',
    defaultLocationEn: 'Departure Airport / Central Operations',
    defaultRefPrefix: 'MSK-TRV',
    checklistAr: [
      'جواز السفر وتأشيرة الدخول المطبوعة',
      'تذكرة الطيران الإلكترونية',
      'وثيقة التأمين الطبي والسياحي',
    ],
  },
];

export const APPOINTMENT_TIME_SLOTS: string[] = [
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
];

export interface AppointmentReminderEvaluation {
  hasAppointment: boolean;
  isPast: boolean;
  isWithin24h: boolean;
  isDueForReminder: boolean;
  isAlreadyReminded: boolean;
  hoursRemaining: number | null;
  daysRemaining: number | null;
  appointmentEpochMs: number | null;
  formattedDateAr: string;
  formattedTimeAr: string;
  statusBadge: {
    textAr: string;
    textEn: string;
    colorClass: string;
    borderClass: string;
    bgClass: string;
  };
}

export function parseAppointmentEpochMs(
  dateStr?: string,
  timeStr?: string
): number | null {
  const cleanDate = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return null;

  const cleanTime = String(timeStr || '').trim();
  const timeMatch = cleanTime.match(/^(\d{1,2}):(\d{2})$/);
  const hours = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 10;
  const minutes = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;

  const [y, m, d] = cleanDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d, hours, minutes, 0, 0);
  const epoch = dt.getTime();
  return Number.isFinite(epoch) ? epoch : null;
}

export function formatReadableTimeAr(rawTime?: string): string {
  const trimmed = String(rawTime || '').trim();
  if (!trimmed) return 'حسب التوقيت المعتمد';
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return trimmed;
  const h24 = Number(match[1]);
  const mins = match[2];
  if (!Number.isFinite(h24) || h24 < 0 || h24 > 23) return trimmed;
  const isPm = h24 >= 12;
  const h12 = h24 % 12 || 12;
  return `${h12}:${mins} ${isPm ? 'مساءً' : 'صباحاً'}`;
}

export function formatReadableDateAr(isoDate?: string): string {
  const trimmed = String(isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed || 'تاريخ غير محدد';
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  try {
    return dt.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return trimmed;
  }
}

export function evaluateAppointmentReminderStatus(
  appointment?: AppointmentDetails,
  nowMs = Date.now()
): AppointmentReminderEvaluation {
  if (!appointment?.appointmentDate?.trim()) {
    return {
      hasAppointment: false,
      isPast: false,
      isWithin24h: false,
      isDueForReminder: false,
      isAlreadyReminded: false,
      hoursRemaining: null,
      daysRemaining: null,
      appointmentEpochMs: null,
      formattedDateAr: '',
      formattedTimeAr: '',
      statusBadge: {
        textAr: 'لا يوجد موعد مجدول',
        textEn: 'No Appointment',
        colorClass: 'text-slate-600',
        borderClass: 'border-slate-200',
        bgClass: 'bg-slate-100',
      },
    };
  }

  const epoch = parseAppointmentEpochMs(
    appointment.appointmentDate,
    appointment.appointmentTime
  );
  if (epoch === null) {
    return {
      hasAppointment: true,
      isPast: false,
      isWithin24h: false,
      isDueForReminder: false,
      isAlreadyReminded: false,
      hoursRemaining: null,
      daysRemaining: null,
      appointmentEpochMs: null,
      formattedDateAr: appointment.appointmentDate,
      formattedTimeAr: appointment.appointmentTime || '',
      statusBadge: {
        textAr: 'تاريخ الموعد بحاجة لمراجعة',
        textEn: 'Invalid Date',
        colorClass: 'text-amber-800',
        borderClass: 'border-amber-300',
        bgClass: 'bg-amber-50',
      },
    };
  }

  const diffMs = epoch - nowMs;
  const hoursRemaining = Math.round((diffMs / 3_600_000) * 10) / 10;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / 86_400_000));
  const isPast = diffMs < -2 * 3_600_000;
  const isAlreadyReminded = Boolean(appointment.reminder24hSentAt?.trim());
  const isWithin24h = diffMs >= 0 && diffMs <= 24 * 3_600_000;
  const isDueForReminder =
    diffMs > 0 &&
    diffMs <= 30 * 3_600_000 &&
    !isAlreadyReminded &&
    appointment.autoReminderEnabled !== false;

  let statusBadge = {
    textAr: 'موعد مجدول مستقبلاً',
    textEn: 'Upcoming Appointment',
    colorClass: 'text-sky-900',
    borderClass: 'border-sky-300',
    bgClass: 'bg-sky-50',
  };

  if (isPast) {
    statusBadge = {
      textAr: 'موعد منقضي / مكتمل',
      textEn: 'Past Appointment',
      colorClass: 'text-slate-700',
      borderClass: 'border-slate-300',
      bgClass: 'bg-slate-100',
    };
  } else if (isAlreadyReminded) {
    statusBadge = {
      textAr: 'تم إرسال تذكير الـ 24 ساعة ✅',
      textEn: '24h Reminder Sent ✅',
      colorClass: 'text-emerald-900',
      borderClass: 'border-emerald-400',
      bgClass: 'bg-emerald-50',
    };
  } else if (isDueForReminder || isWithin24h) {
    statusBadge = {
      textAr: 'تذكير الـ 24 ساعة مستحق الآن! ⏰',
      textEn: '24h Reminder Due Now! ⏰',
      colorClass: 'text-amber-950',
      borderClass: 'border-amber-400',
      bgClass: 'bg-amber-50',
    };
  } else {
    statusBadge = {
      textAr: `الموعد بعد ${daysRemaining} يوم`,
      textEn: `In ${daysRemaining} days`,
      colorClass: 'text-[#0F2438]',
      borderClass: 'border-[#C6A052]/50',
      bgClass: 'bg-[#FAF8F2]',
    };
  }

  return {
    hasAppointment: true,
    isPast,
    isWithin24h,
    isDueForReminder,
    isAlreadyReminded,
    hoursRemaining,
    daysRemaining,
    appointmentEpochMs: epoch,
    formattedDateAr: formatReadableDateAr(appointment.appointmentDate),
    formattedTimeAr: formatReadableTimeAr(appointment.appointmentTime),
    statusBadge,
  };
}

export function buildAppointment24hReminderWhatsAppMessage(params: {
  clientName: string;
  orderCode: string;
  serviceType: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
  referenceNumber?: string;
  notes?: string;
  lang?: 'ar' | 'en';
  appUrl?: string;
}): string {
  const {
    clientName,
    orderCode,
    serviceType,
    appointmentDate,
    appointmentTime,
    location,
    referenceNumber,
    notes,
    lang = 'ar',
    appUrl = 'https://masarik-tourism.github.io/',
  } = params;

  const cleanName = clientName.trim() || (lang === 'en' ? 'Valued Traveler' : 'عميلنا العزيز');
  const cleanService = serviceType.trim() || 'موعد خدمة سياحية';
  const readableDate = formatReadableDateAr(appointmentDate);
  const readableTime = formatReadableTimeAr(appointmentTime);
  const cleanLoc = (location || '').trim();
  const cleanRef = (referenceNumber || '').trim() || orderCode;
  const cleanNotes = (notes || '').trim();

  if (lang === 'en') {
    return `Hello ${cleanName} 🌸
This is an official 24-hour reminder from Masarik Tourism for your upcoming appointment tomorrow:

📋 Service: ${cleanService}
📅 Date: ${appointmentDate}
⏰ Time: ${appointmentTime || 'As scheduled'}
${cleanLoc ? `📍 Location: ${cleanLoc}\n` : ''}🔖 Booking Reference: ${cleanRef}
${cleanNotes ? `📝 Note: ${cleanNotes}\n` : ''}
⚠️ Important Instructions:
1. Please arrive at least 15 minutes before your scheduled appointment time.
2. Bring your original passport (valid for 6+ months) and required personal photos.
3. Keep your booking appointment QR pass / confirmation sheet ready.

📲 View your Appointment QR Pass in the Masarik portal:
${appUrl}

Best wishes for a successful appointment & blessed journey!
Masarik Tourism Team`;
  }

  return `السلام عليكم ورحمة الله أ/ ${cleanName} 🌸
تذكير رسمي من مسارك للإنجاز السياحي (Masarik Tourism) بموعدكم القادم غداً بإذن الله:

📋 الخدمة / الموعد: ${cleanService}
📅 التاريخ: ${readableDate}
⏰ الوقت: ${readableTime}
${cleanLoc ? `📍 المركز / الموقع: ${cleanLoc}\n` : ''}🔖 رقم الحجز / المرجع: ${cleanRef}
${cleanNotes ? `📝 تعليمات خاصة: ${cleanNotes}\n` : ''}
⚠️ إرشادات وتعليمات هامة للحضور:
1. يرجى الحضور إلى المركز قبل الموعد بـ 15 دقيقة على الأقل.
2. إحضار أصل جواز السفر صالحاً لأكثر من 6 أشهر مع صور شخصية حديثة بخلفية بيضاء.
3. إحضار إشعار حجز الموعد المطبوع أو الباركود الإلكتروني.

📲 يمكنكم فتح بطاقة الموعد والباركود الذكي (Appointment QR Pass) مباشرة من محفظتكم في مسارك:
${appUrl}

نتمنى لكم دوام التوفيق والتيسير بإذن الله.
فريق مسارك للإنجاز السياحي`;
}

export interface AppointmentCalendarDay {
  dayNumber: number;
  isoDate: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  appointmentCount: number;
}

export function buildCalendarMonthMatrix(
  year: number,
  monthZeroIndexed: number,
  selectedIsoDate?: string,
  appointmentsByDate: Record<string, number> = {},
  nowMs = Date.now()
): AppointmentCalendarDay[][] {
  const today = new Date(nowMs);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;

  const firstDayOfMonth = new Date(year, monthZeroIndexed, 1);
  const lastDayOfMonth = new Date(year, monthZeroIndexed + 1, 0);
  const totalDays = lastDayOfMonth.getDate();

  // Arabic / Egyptian standard week starting Saturday:
  // JS getDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Map to Saturday = 0: (getDay() + 1) % 7
  const startDaySaturdayIndexed = (firstDayOfMonth.getDay() + 1) % 7;

  const weeks: AppointmentCalendarDay[][] = [];
  let currentWeek: AppointmentCalendarDay[] = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, monthZeroIndexed, 0).getDate();
  for (let i = startDaySaturdayIndexed - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const prevDate = new Date(year, monthZeroIndexed - 1, dayNum);
    const isoDate = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(prevDate.getDate()).padStart(2, '0')}`;
    currentWeek.push({
      dayNumber: dayNum,
      isoDate,
      isCurrentMonth: false,
      isToday: isoDate === todayIso,
      isSelected: isoDate === selectedIsoDate,
      isPast: isoDate < todayIso,
      appointmentCount: appointmentsByDate[isoDate] || 0,
    });
  }

  // Days of current month
  for (let d = 1; d <= totalDays; d++) {
    const isoDate = `${year}-${String(monthZeroIndexed + 1).padStart(2, '0')}-${String(d).padStart(
      2,
      '0'
    )}`;
    currentWeek.push({
      dayNumber: d,
      isoDate,
      isCurrentMonth: true,
      isToday: isoDate === todayIso,
      isSelected: isoDate === selectedIsoDate,
      isPast: isoDate < todayIso,
      appointmentCount: appointmentsByDate[isoDate] || 0,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Next month padding to fill out the last week
  if (currentWeek.length > 0) {
    let nextMonthDay = 1;
    while (currentWeek.length < 7) {
      const nextDate = new Date(year, monthZeroIndexed + 1, nextMonthDay);
      const isoDate = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(nextDate.getDate()).padStart(2, '0')}`;
      currentWeek.push({
        dayNumber: nextMonthDay,
        isoDate,
        isCurrentMonth: false,
        isToday: isoDate === todayIso,
        isSelected: isoDate === selectedIsoDate,
        isPast: isoDate < todayIso,
        appointmentCount: appointmentsByDate[isoDate] || 0,
      });
      nextMonthDay++;
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

export interface ClientAppointmentAlertItem {
  client: TravelerProfile;
  displayName: string;
  orderCode: string;
  phone: string;
  evaluation: AppointmentReminderEvaluation;
}

export function collectUpcoming24hAppointmentAlerts(
  travelers: TravelerProfile[],
  nowMs = Date.now()
): ClientAppointmentAlertItem[] {
  const alerts: ClientAppointmentAlertItem[] = [];

  for (const tr of travelers) {
    if (!tr.appointmentDetails?.appointmentDate?.trim()) continue;
    const evalResult = evaluateAppointmentReminderStatus(tr.appointmentDetails, nowMs);
    if (evalResult.isDueForReminder) {
      const names = getTravelerDisplayNames(tr);
      alerts.push({
        client: tr,
        displayName: tr.passportFullName?.trim() || names.fullDisplayName || tr.name,
        orderCode: tr.orderCode || buildOrderCodeFromPhone(tr.phone),
        phone: tr.phone,
        evaluation: evalResult,
      });
    }
  }

  // Sort by earliest appointment first
  alerts.sort(
    (a, b) =>
      (a.evaluation.appointmentEpochMs || 0) - (b.evaluation.appointmentEpochMs || 0)
  );

  return alerts;
}

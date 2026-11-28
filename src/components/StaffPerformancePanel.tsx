import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Award,
  CheckCircle2,
  Clock,
  FileCheck2,
  FolderOpen,
  History,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  Zap,
} from 'lucide-react';
import { ChatMessage, SubAdminAccount, TravelerProfile } from '../types/travel';
import { useLanguage } from '../contexts/LanguageContext';
import {
  StaffPeriodFilter,
  buildStaffPerformanceSummary,
  formatResponseDuration,
} from '../utils/staffPerformanceHelpers';

interface StaffPerformancePanelProps {
  travelers: TravelerProfile[];
  subAdmins: SubAdminAccount[];
  chatMessagesByPhone: Record<string, ChatMessage[]>;
  onOpenClientFolder: (phone: string, initialTab?: 'basic_passport' | 'documents' | 'order_stages') => void;
  onOpenDocMonitor?: () => void;
}

export const StaffPerformancePanel: React.FC<StaffPerformancePanelProps> = ({
  travelers,
  subAdmins,
  chatMessagesByPhone,
  onOpenClientFolder,
  onOpenDocMonitor,
}) => {
  const { lang, dir, t } = useLanguage();
  const [period, setPeriod] = useState<StaffPeriodFilter>('all');
  const [selectedStaffKey, setSelectedStaffKey] = useState<string>('all');
  const [feedSourceFilter, setFeedSourceFilter] = useState<'all' | 'order_audit' | 'document_audit'>('all');

  const summary = useMemo(
    () =>
      buildStaffPerformanceSummary({
        travelers,
        subAdmins,
        chatMessagesByPhone,
        period,
      }),
    [travelers, subAdmins, chatMessagesByPhone, period]
  );

  const chartData = useMemo(
    () =>
      summary.staffMetrics.slice(0, 10).map((s) => ({
        name: s.staffName,
        completedOrders: s.completedOrdersCount,
        docReviews: s.docReviewsCount,
        avgResponseMin: s.avgResponseMinutes ?? 0,
      })),
    [summary.staffMetrics]
  );

  const filteredFeed = useMemo(() => {
    return summary.auditFeed
      .filter((item) => {
        if (selectedStaffKey !== 'all' && item.staffKey !== selectedStaffKey) return false;
        if (feedSourceFilter === 'order_audit') {
          return item.source === 'order_audit' || item.source === 'deliverable';
        }
        if (feedSourceFilter === 'document_audit') {
          return item.source === 'document_audit';
        }
        return true;
      })
      .slice(0, 50);
  }, [summary.auditFeed, selectedStaffKey, feedSourceFilter]);

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
    try {
      return d.toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso.slice(0, 16);
    }
  };

  const selectedStaffMetric =
    selectedStaffKey === 'all'
      ? null
      : summary.staffMetrics.find((s) => s.staffKey === selectedStaffKey) || null;

  return (
    <div className="space-y-5" dir={dir}>
      {/* Header Banner & Period Selector */}
      <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] border border-[#C6A052]/60 rounded-2xl p-4 sm:p-5 text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#C6A052]/20 border border-[#C6A052]/60 text-[#E5C887] flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black text-white">
              {t('لوحة تقييم أداء موظفي الإنجاز', 'Execution Staff Performance Dashboard')}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {t(
                'قياس عدد الطلبات المنجزة، مراجعات المستندات، ومتوسط سرعة الاستجابة المرتبطة مباشرة بسجل التدقيق (Audit Log) والمحادثات.',
                'Measures completed orders, document reviews, and average response speed linked directly with the Audit Log and Live Chat.'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/15">
            {(
              [
                { id: 'all', ar: 'كل الفترات', en: 'All Time' },
                { id: '7d', ar: 'آخر 7 أيام', en: '7 Days' },
                { id: '30d', ar: '30 يوماً', en: '30 Days' },
                { id: '90d', ar: '90 يوماً', en: '90 Days' },
              ] as { id: StaffPeriodFilter; ar: string; en: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  period === opt.id
                    ? 'bg-[#C6A052] text-[#0A1926]'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                {lang === 'en' ? opt.en : opt.ar}
              </button>
            ))}
          </div>

          {onOpenDocMonitor && (
            <button
              type="button"
              onClick={onOpenDocMonitor}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-[#E5C887] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>{t('فتح مراقب المستندات', 'Open Doc Monitor')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 block">
              {t('الطلبات المنجزة المنسوبة', 'Attributed Completed Orders')}
            </span>
            <span className="text-2xl font-black font-mono text-[#0F2438] mt-1 block">
              {summary.totalCompletedOrders}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block truncate">
              {summary.topPerformerName
                ? t(`الأعلى إنجازاً: ${summary.topPerformerName}`, `Top: ${summary.topPerformerName}`)
                : t('لا توجد طلبات منجزة بعد', 'No completed orders yet')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 block">
              {t('متوسط سرعة استجابة الفريق', 'Team Avg Response Speed')}
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-sky-800 mt-1 block truncate">
              {formatResponseDuration(summary.teamAvgResponseMinutes, lang)}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block truncate">
              {summary.fastestResponderName
                ? t(`الأسرع: ${summary.fastestResponderName}`, `Fastest: ${summary.fastestResponderName}`)
                : t('يُحسب من Audit Log والدردشة', 'From Audit Log & Chat')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 block">
              {t('حركات Audit Log المرتبطة', 'Linked Audit Log Events')}
            </span>
            <span className="text-2xl font-black font-mono text-[#0F2438] mt-1 block">
              {summary.totalAuditEvents}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {t('مراجعات مستندات + مراحل طلبات', 'Doc reviews + order stages')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F2] border border-[#C6A052]/50 text-[#9E7B33] flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 block">
              {t('أعضاء فريق الإنجاز', 'Active Staff Evaluated')}
            </span>
            <span className="text-2xl font-black font-mono text-[#0F2438] mt-1 block">
              {summary.staffMetrics.filter((s) => s.role !== 'archive').length}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {t(`المدير العام + ${subAdmins.length} موظف`, `GM + ${subAdmins.length} staff`)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-[#0F2438] flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Charts & Staff Performance Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Bar Chart: Completed Orders vs Document Reviews per Staff Member */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
              {t('مقارنة إنجاز الموظفين ومراجعات التدقيق', 'Completed Orders & Audit Reviews by Staff')}
            </h3>
            <p className="text-[11px] text-slate-500">
              {t(
                'عدد الطلبات المكتملة مقابل حركات مراجعة المستندات لكل موظف',
                'Completed orders compared against document Audit Log reviews per employee'
              )}
            </p>
          </div>

          <div className="h-[270px] w-full" dir="ltr">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">
                {t('لا توجد بيانات موظفين متاحة حالياً', 'No staff activity data yet')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #C6A052',
                      backgroundColor: '#FFFFFF',
                      direction: dir,
                      textAlign: lang === 'ar' ? 'right' : 'left',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11.5px', fontWeight: 700, paddingTop: '6px' }} />
                  <Bar
                    dataKey="completedOrders"
                    name={t('الطلبات المنجزة', 'Completed Orders')}
                    fill="#10B981"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="docReviews"
                    name={t('مراجعات المستندات', 'Doc Reviews')}
                    fill="#0F2438"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Staff Performance Leaderboard Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                {t('جدول تقييم موظفي الإنجاز', 'Staff Performance Evaluation Table')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {t(
                  'اضغط على اسم أي موظف لتصفية سجل الـ Audit Log الخاص بأعماله بالأسفل',
                  'Select any employee row to filter their Audit Log history below'
                )}
              </p>
            </div>
            {selectedStaffKey !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedStaffKey('all')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold cursor-pointer transition whitespace-nowrap shrink-0"
              >
                {t('عرض جميع الموظفين', 'Show All Staff')}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse tabular-nums">
              <thead>
                <tr className="bg-[#FAF8F2] border-b border-[#C6A052]/40 text-[#0F2438]">
                  <th className="py-2.5 px-2.5 font-black text-start">{t('الموظف', 'Staff Member')}</th>
                  <th className="py-2.5 px-2 font-black text-center">{t('الطلبات المنجزة', 'Completed')}</th>
                  <th className="py-2.5 px-2 font-black text-center">{t('مراجعات المستندات', 'Doc Reviews')}</th>
                  <th className="py-2.5 px-2 font-black text-center">{t('متوسط سرعة الاستجابة', 'Avg Response')}</th>
                  <th className="py-2.5 px-2 font-black text-center">{t('سجل Audit', 'Audit Events')}</th>
                  <th className="py-2.5 px-2 font-black text-end">{t('آخر نشاط', 'Last Activity')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.staffMetrics.map((staff) => {
                  const isSelected = selectedStaffKey === staff.staffKey;
                  return (
                    <tr
                      key={staff.staffKey}
                      onClick={() =>
                        setSelectedStaffKey((prev) =>
                          prev === staff.staffKey ? 'all' : staff.staffKey
                        )
                      }
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-[#FAF8F2]' : 'hover:bg-slate-50/90'
                      }`}
                    >
                      <td className="py-2.5 px-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${
                              staff.role === 'super_admin'
                                ? 'bg-[#0F2438] text-[#E5C887]'
                                : staff.role === 'archive'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-sky-100 text-sky-900'
                            }`}
                          >
                            {staff.role === 'super_admin' ? (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            ) : (
                              staff.staffName.slice(0, 1)
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-black text-[#0F2438] block truncate">
                              {staff.staffName}
                            </span>
                            <span className="text-[10.5px] text-slate-500">
                              {staff.role === 'super_admin'
                                ? t('المدير العام', 'General Manager')
                                : staff.role === 'archive'
                                ? t('سجل أرشيفي سابق', 'Legacy Archive')
                                : t('موظف إنجاز', 'Execution Staff')}
                              {staff.chatRepliesCount > 0 && (
                                <>
                                  {' · '}
                                  {t(`${staff.chatRepliesCount} رد دردشة`, `${staff.chatRepliesCount} chat replies`)}
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className="font-mono text-sm font-black text-emerald-700">
                          {staff.completedOrdersCount}
                        </span>
                        {staff.deliverablesIssuedCount > 0 && (
                          <span className="block text-[10px] text-slate-500">
                            {t(`${staff.deliverablesIssuedCount} مخرج`, `${staff.deliverablesIssuedCount} docs`)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className="font-mono font-bold text-[#0F2438]">
                          {staff.docReviewsCount}
                        </span>
                        {(staff.docApprovalsCount > 0 || staff.docRejectionsCount > 0) && (
                          <span className="block text-[10px] text-slate-500">
                            <span className="text-emerald-700">{staff.docApprovalsCount}✓</span>
                            {' / '}
                            <span className="text-red-600">{staff.docRejectionsCount}✕</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`font-mono font-black ${
                            staff.avgResponseMinutes === null
                              ? 'text-slate-400 font-normal'
                              : staff.avgResponseMinutes <= 30
                              ? 'text-emerald-700'
                              : staff.avgResponseMinutes <= 180
                              ? 'text-sky-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {formatResponseDuration(staff.avgResponseMinutes, lang)}
                        </span>
                        {staff.responseSamplesCount > 0 && (
                          <span className="block text-[10px] text-slate-500">
                            {staff.avgChatResponseMinutes !== null &&
                            staff.avgAuditResponseMinutes !== null
                              ? t(
                                  `دردشة: ${formatResponseDuration(staff.avgChatResponseMinutes, lang)} · تدقيق: ${formatResponseDuration(staff.avgAuditResponseMinutes, lang)}`,
                                  `Chat: ${formatResponseDuration(staff.avgChatResponseMinutes, lang)} · Audit: ${formatResponseDuration(staff.avgAuditResponseMinutes, lang)}`
                                )
                              : t(`${staff.responseSamplesCount} قياس`, `${staff.responseSamplesCount} sample(s)`)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">
                        {staff.auditEventsCount}
                      </td>
                      <td className="py-2.5 px-2 text-end text-[11px] text-slate-500 whitespace-nowrap">
                        {formatDateTime(staff.lastActivityAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Linked Audit Log Feed */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FAF8F2] border border-[#C6A052]/50 text-[#9E7B33] flex items-center justify-center shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                {selectedStaffMetric
                  ? t(
                      `سجل التدقيق المرتبط بالموظف: ${selectedStaffMetric.staffName}`,
                      `Audit Log for: ${selectedStaffMetric.staffName}`
                    )
                  : t(
                      'سجل التدقيق الموحّد المرتبط بأداء الفريق (Audit Log)',
                      'Unified Team Performance Audit Log'
                    )}
              </h3>
              <p className="text-[11px] text-slate-500">
                {t(
                  'يعرض الحركات الفعلية المسجلة عند إنجاز الطلبات، إصدار المستندات، ومراجعة مرفقات العملاء مع زمن الاستجابة المحسوب.',
                  'Shows recorded order completions, delivered documents, and client document reviews with measured response times.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedStaffKey}
              onChange={(e) => setSelectedStaffKey(e.target.value)}
              aria-label={t('تصفية حسب الموظف', 'Filter by Staff Member')}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
            >
              <option value="all">{t('كل الموظفين', 'All Staff')}</option>
              {summary.staffMetrics.map((s) => (
                <option key={s.staffKey} value={s.staffKey}>
                  {s.staffName} ({s.auditEventsCount})
                </option>
              ))}
            </select>

            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100">
              {(
                [
                  { id: 'all', ar: 'الكل', en: 'All' },
                  { id: 'order_audit', ar: 'الطلبات والتسليم', en: 'Orders' },
                  { id: 'document_audit', ar: 'مراجعة المستندات', en: 'Doc Reviews' },
                ] as const
              ).map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setFeedSourceFilter(src.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    feedSourceFilter === src.id
                      ? 'bg-white text-[#0F2438] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F2438]'
                  }`}
                >
                  {lang === 'en' ? src.en : src.ar}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredFeed.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 space-y-1">
            <Clock className="w-6 h-6 text-slate-300 mx-auto" />
            <p className="font-bold">
              {t(
                'لا توجد حركات مسجلة في سجل التدقيق ضمن النطاق المحدد حالياً.',
                'No Audit Log entries match the selected filter.'
              )}
            </p>
            <p className="text-[11px] text-slate-400">
              {t(
                'تُربط الحركات تلقائياً عند اعتماد المستندات أو تحديث مراحل الطلبات أو تسليم المخرجات.',
                'Actions are logged automatically whenever staff review documents, update stages, or deliver orders.'
              )}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredFeed.map((item) => (
              <div
                key={item.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70 px-2 rounded-xl transition"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-black text-[#0F2438]">{item.staffName}</span>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span
                      className={`font-bold ${
                        item.actionType === 'approved' ||
                        item.actionType === 'order_completed' ||
                        item.actionType === 'deliverable_issued'
                          ? 'text-emerald-700'
                          : item.actionType === 'rejected'
                          ? 'text-red-700'
                          : 'text-sky-700'
                      }`}
                    >
                      {lang === 'en' ? item.actionLabelEn : item.actionLabelAr}
                    </span>
                    {item.targetLabel && (
                      <>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-700 truncate max-w-[220px]">
                          {item.targetLabel}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                    <span className="font-bold text-slate-700">{item.clientName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{item.orderCode}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(item.timestamp)}</span>
                    {item.responseMinutes !== null && item.responseMinutes !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-sky-700 font-bold">
                          <MessageCircle className="w-3 h-3" />
                          <span>
                            {t(
                              `زمن الاستجابة: ${formatResponseDuration(item.responseMinutes, lang)}`,
                              `Response: ${formatResponseDuration(item.responseMinutes, lang)}`
                            )}
                          </span>
                        </span>
                      </>
                    )}
                  </div>

                  {item.note && (
                    <p className="text-[11px] text-slate-600 truncate max-w-2xl">
                      {t('ملاحظة:', 'Note:')} {item.note}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onOpenClientFolder(
                      item.phone,
                      item.source === 'document_audit' ? 'documents' : 'order_stages'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#0F2438] bg-white text-[#0F2438] text-[11px] font-bold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#C6A052]" />
                  <span>{t('فتح ملف العميل', 'Open Client')}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Crown,
  FileCheck2,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { ClientPriorityTier, TravelerProfile } from '../types/travel';
import { useLanguage } from '../contexts/LanguageContext';
import {
  buildSixMonthReportsData,
  getClientTierConfig,
} from '../utils/clientReportsHelpers';

interface AdminReportsPanelProps {
  travelers: TravelerProfile[];
  onFilterClientsByTier?: (tier: ClientPriorityTier) => void;
}

export const AdminReportsPanel: React.FC<AdminReportsPanelProps> = ({
  travelers,
  onFilterClientsByTier,
}) => {
  const { lang, dir, t } = useLanguage();

  const summary = useMemo(
    () => buildSixMonthReportsData(travelers, lang),
    [travelers, lang]
  );

  const pieData = useMemo(
    () => summary.tierBreakdown.filter((item) => item.count > 0),
    [summary.tierBreakdown]
  );

  const renderTierIcon = (tier: ClientPriorityTier | 'standard') => {
    if (tier === 'vip') return <Crown className="w-4 h-4 text-[#9E7B33]" />;
    if (tier === 'new') return <Sparkles className="w-4 h-4 text-sky-600" />;
    if (tier === 'delayed') return <AlertTriangle className="w-4 h-4 text-red-600" />;
    return <Users className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="space-y-5" dir={dir}>
      {/* Reports Header Banner */}
      <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] border-2 border-[#C6A052]/60 rounded-2xl p-4 sm:p-5 text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#C6A052]/20 border border-[#C6A052]/60 text-[#E5C887] flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-white">
              {t(
                'قسم التقارير والأداء — آخر 6 أشهر',
                'Executive Reports & Performance — Last 6 Months'
              )}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {t(
                'تحليل مباشر لاتجاهات الطلبات، التأشيرات المنجزة، وتوزيع تصنيفات أولوية العملاء',
                'Live breakdown of order trends, completed visas, and client priority classifications'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 font-black text-[#E5C887]">
            {t(`إجمالي الملفات: ${travelers.length}`, `Total Profiles: ${travelers.length}`)}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 font-black text-emerald-200">
            {t(`نسبة الإنجاز: ${summary.completionRatePct}%`, `Completion: ${summary.completionRatePct}%`)}
          </span>
        </div>
      </div>

      {/* 4 Executive Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">
              {t('الطلبات (آخر 6 أشهر)', 'Orders (Last 6M)')}
            </span>
            <span className="text-2xl font-black font-mono text-[#0F2438] mt-1 block">
              {summary.totalOrders6M}
            </span>
            <span className="text-[10.5px] font-bold text-sky-700 mt-0.5 block">
              {t(`عملاء جدد: ${summary.newClients6M}`, `New clients: ${summary.newClients6M}`)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-emerald-800 block">
              {t('التأشيرات المنجزة (6 أشهر)', 'Completed Visas (6M)')}
            </span>
            <span className="text-2xl font-black font-mono text-emerald-700 mt-1 block">
              {summary.completedVisas6M}
            </span>
            <span className="text-[10.5px] font-bold text-emerald-600 mt-0.5 block">
              {t(`قيد المتابعة: ${summary.inProgressOrders6M}`, `In progress: ${summary.inProgressOrders6M}`)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-[#C6A052]/60 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-[#7A5611] block">
              {t('معدل الإنجاز العام', 'Overall Completion Rate')}
            </span>
            <span className="text-2xl font-black font-mono text-[#0F2438] mt-1 block">
              {summary.completionRatePct}%
            </span>
            <span className="text-[10.5px] font-bold text-slate-500 mt-0.5 block">
              {t('نسبة التأشيرات المكتملة للطلبات', 'Completed visas vs. orders')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F2] border border-[#C6A052]/60 text-[#9E7B33] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1.5">
          <span className="text-[11px] font-bold text-slate-600 block">
            {t('ملخص الأولويات', 'Priority Breakdown')}
          </span>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
            <span className="px-2 py-0.5 rounded-full bg-[#FAF0D7] border border-[#C6A052] text-[#7A5611]">
              VIP: {summary.tierCounts.vip}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-sky-50 border border-sky-300 text-sky-900">
              {t('جديد', 'New')}: {summary.tierCounts.new}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-300 text-red-800">
              {t('متأخر', 'Delayed')}: {summary.tierCounts.delayed}
            </span>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Chart 1: 6-Month Order Trends & Completed Visas (AreaChart) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                {t(
                  'اتجاهات الطلبات والتأشيرات المنجزة (آخر 6 أشهر)',
                  'Order Trends & Completed Visas (Last 6 Months)'
                )}
              </h3>
              <p className="text-[11px] text-slate-500">
                {t(
                  'مقارنة شهرية لحجم الطلبات المسجلة مقابل التأشيرات المنجزة فعلياً',
                  'Monthly comparison of incoming orders against completed visas'
                )}
              </p>
            </div>
          </div>

          <div className="h-[290px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={summary.monthlyTrends}
                margin={{ top: 10, right: 16, left: 0, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="masarikOrdersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284C7" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#0284C7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="masarikVisasGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1px solid #C6A052',
                    backgroundColor: '#FFFFFF',
                    boxShadow: '0 10px 25px -5px rgba(15, 36, 56, 0.15)',
                    direction: dir,
                    textAlign: lang === 'ar' ? 'right' : 'left',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: '12px',
                    fontWeight: 700,
                    paddingTop: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalOrders"
                  name={t('إجمالي الطلبات', 'Total Orders')}
                  stroke="#0284C7"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#masarikOrdersGrad)"
                  activeDot={{ r: 5 }}
                />
                <Area
                  type="monotone"
                  dataKey="completedVisas"
                  name={t('التأشيرات المنجزة', 'Completed Visas')}
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#masarikVisasGrad)"
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Client Priority Tier Distribution (PieChart + Interactive Filter Cards) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
              {t('توزيع تصنيفات العملاء', 'Client Priority Distribution')}
            </h3>
            <p className="text-[11px] text-slate-500">
              {t(
                'اضغط على أي تصنيف لعرض أصحابه مباشرة في دليل العملاء',
                'Click any tier below to filter matching clients in the directory'
              )}
            </p>
          </div>

          <div className="h-[205px] w-full relative" dir="ltr">
            {pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-bold">
                {t('لا توجد بيانات عملاء كافية للرسم البياني', 'Not enough client records yet')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #C6A052',
                      direction: dir,
                      textAlign: lang === 'ar' ? 'right' : 'left',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['vip', 'new', 'delayed'] as ClientPriorityTier[]).map((tierKey) => {
              const cfg = getClientTierConfig(tierKey, lang);
              const count = summary.tierCounts[tierKey];
              return (
                <button
                  key={tierKey}
                  type="button"
                  onClick={() => onFilterClientsByTier?.(tierKey)}
                  className={`p-2.5 rounded-xl border text-start transition cursor-pointer hover:shadow-xs flex items-center justify-between gap-2 ${cfg.badgeClass}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {renderTierIcon(tierKey)}
                    <span className="text-[11px] font-black truncate">{cfg.shortLabel}</span>
                  </div>
                  <span className="text-sm font-black font-mono tabular-nums">{count}</span>
                </button>
              );
            })}
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {renderTierIcon('standard')}
                <span className="text-[11px] font-bold truncate">
                  {t('غير مصنف', 'Standard')}
                </span>
              </div>
              <span className="text-sm font-black font-mono tabular-nums">
                {summary.tierCounts.standard}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart 3: Monthly Bar Chart Comparison + Numeric Breakdown Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
              {t(
                'عدد التأشيرات المنجزة والطلبات الجارية شهرياً',
                'Monthly Completed Visas vs. Active & New Clients'
              )}
            </h3>
            <p className="text-[11px] text-slate-500">
              {t(
                'توزيع شهري للتأشيرات المكتملة مقابل الطلبات الجارية والعملاء الجدد',
                'Side-by-side breakdown of completed visas, active pipeline, and new signups'
              )}
            </p>
          </div>

          <div className="h-[260px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={summary.monthlyTrends}
                margin={{ top: 10, right: 12, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1px solid #C6A052',
                    backgroundColor: '#FFFFFF',
                    direction: dir,
                    textAlign: lang === 'ar' ? 'right' : 'left',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    paddingTop: '8px',
                  }}
                />
                <Bar
                  dataKey="completedVisas"
                  name={t('التأشيرات المنجزة', 'Completed Visas')}
                  fill="#10B981"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="inProgressOrders"
                  name={t('قيد التنفيذ', 'In Progress')}
                  fill="#C6A052"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="newClients"
                  name={t('عملاء جدد', 'New Clients')}
                  fill="#0F2438"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Data Summary Table */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
              {t('جدول الأرقام الشهرية التفصيلي', 'Monthly Numeric Breakdown')}
            </h3>
            <p className="text-[11px] text-slate-500">
              {t(
                'قراءة رقمية سريعة للأشهر الستة الأخيرة',
                'Quick numeric summary across the trailing 6 months'
              )}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse tabular-nums">
              <thead>
                <tr className="bg-[#FAF8F2] border-b border-[#C6A052]/40 text-[#0F2438]">
                  <th className="py-2 px-2.5 font-black text-start">{t('الشهر', 'Month')}</th>
                  <th className="py-2 px-2 font-black text-center">{t('الطلبات', 'Orders')}</th>
                  <th className="py-2 px-2 font-black text-center">{t('المنجزة', 'Visas')}</th>
                  <th className="py-2 px-2 font-black text-center">{t('جدد', 'New')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.monthlyTrends.map((row) => (
                  <tr key={row.monthKey} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-2.5 font-bold text-[#0F2438]">{row.monthLabel}</td>
                    <td className="py-2.5 px-2 text-center font-mono font-bold text-sky-700">
                      {row.totalOrders}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono font-black text-emerald-700">
                      {row.completedVisas}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">
                      {row.newClients}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

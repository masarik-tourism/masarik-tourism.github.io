import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  FolderOpen,
  History,
  Loader2,
  Search,
  ShieldAlert,
  UserCheck,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  DocumentAuditEntry,
  DocumentReviewStatus,
  TravelerDocument,
  TravelerProfile,
} from '../types/travel';
import {
  DocumentMonitorFilterCriteria,
  DocumentMonitorRecord,
  collectGlobalDocumentAuditRecords,
  computeDocumentMonitorStats,
  filterDocumentAuditRecords,
  resolveDocumentReviewMeta,
} from '../utils/documentAuditHelpers';
import {
  downloadCloudFile,
  getDisplayableDriveImageUrl,
  getDriveViewUrl,
} from '../utils/firebaseStorageHelper';
import { updateDocumentReviewStatusCloud } from '../utils/travelerStore';
import { useLanguage } from '../contexts/LanguageContext';

interface DocumentMonitorPanelProps {
  travelers: TravelerProfile[];
  reviewerName: string;
  onRefreshTravelers: () => void;
  onOpenClientDocs: (phone: string) => void;
  onPreviewImage: (label: string, dataUrl: string, downloadName?: string) => void;
}

export const DocumentMonitorPanel: React.FC<DocumentMonitorPanelProps> = ({
  travelers,
  reviewerName,
  onRefreshTravelers,
  onOpenClientDocs,
  onPreviewImage,
}) => {
  const { lang, t } = useLanguage();
  const [filters, setFilters] = useState<DocumentMonitorFilterCriteria>({
    query: '',
    status: 'all',
    docType: 'all',
    dateRange: 'all',
  });
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const allRecords = useMemo(
    () => collectGlobalDocumentAuditRecords(travelers),
    [travelers]
  );

  const stats = useMemo(() => computeDocumentMonitorStats(allRecords), [allRecords]);

  const filteredRecords = useMemo(
    () => filterDocumentAuditRecords(allRecords, filters),
    [allRecords, filters]
  );

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
    try {
      return d.toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso.slice(0, 16);
    }
  };

  const getDocTypeLabel = (docType: TravelerDocument['docType']) => {
    switch (docType) {
      case 'passport':
        return t('جواز سفر', 'Passport');
      case 'photo':
        return t('صورة شخصية', 'Photo');
      case 'visa':
        return t('تأشيرة', 'Visa');
      case 'contract':
        return t('عقد / تفويض', 'Contract');
      case 'receipt':
        return t('إيصال سداد', 'Receipt');
      default:
        return t('مستند آخر', 'Other');
    }
  };

  const getTimelineDotAndBadge = (entry: DocumentAuditEntry) => {
    if (entry.action === 'approved' || entry.status === 'completed') {
      return {
        dotCls: 'bg-emerald-500 ring-emerald-100',
        pillCls: 'bg-emerald-50 border-emerald-300 text-emerald-900',
      };
    }
    if (entry.action === 'rejected' || entry.status === 'pending_completion') {
      return {
        dotCls: 'bg-red-500 ring-red-100',
        pillCls: 'bg-red-50 border-red-300 text-red-900',
      };
    }
    if (entry.action === 'uploaded' || entry.action === 'replaced') {
      return {
        dotCls: 'bg-[#C6A052] ring-amber-100',
        pillCls: 'bg-amber-50 border-amber-300 text-amber-950',
      };
    }
    return {
      dotCls: 'bg-sky-500 ring-sky-100',
      pillCls: 'bg-sky-50 border-sky-200 text-sky-900',
    };
  };

  const handleQuickReview = async (
    rec: DocumentMonitorRecord,
    nextStatus: DocumentReviewStatus
  ) => {
    if (updatingKey) return;
    setUpdatingKey(rec.recordKey);
    try {
      const note =
        noteDrafts[rec.recordKey] !== undefined
          ? noteDrafts[rec.recordKey]
          : rec.statusNote;
      await updateDocumentReviewStatusCloud(
        rec.phone,
        rec.doc.id,
        nextStatus,
        note,
        reviewerName
      );
      setExpandedKeys((prev) => ({ ...prev, [rec.recordKey]: true }));
      onRefreshTravelers();
    } finally {
      setUpdatingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Summary KPI Cards */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                {t('مراقب المستندات وسجل التدقيق التاريخي (Audit Log)', 'Document Monitor & Audit Log')}
              </h3>
              <p className="text-xs text-slate-500">
                {t(
                  'تتبع تاريخي كامل لكل مستند مرفوع: وقت الرفع، اسم المراجع، وجميع تغييرات الحالة (تم القبول / مرفوض).',
                  'Full audit trail for every uploaded document: upload timestamp, reviewer name, and status changes.'
                )}
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF8F2] border border-[#C6A052]/50 text-[11px] font-black text-[#0F2438] tabular-nums">
            <History className="w-3.5 h-3.5 text-[#C6A052]" />
            <span>
              {t(`${stats.totalEventsCount} حركة تدقيق مسجلة`, `${stats.totalEventsCount} audit events logged`)}
            </span>
          </span>
        </div>

        {/* Interactive KPI Filter Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, status: 'all' }))}
            className={`text-start p-3 rounded-xl border transition cursor-pointer ${
              filters.status === 'all'
                ? 'bg-[#0F2438] text-white border-[#0F2438] shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-[#0F2438]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold opacity-80">
              <span>{t('إجمالي المستندات', 'Total Documents')}</span>
              <FileText className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-black mt-1 tabular-nums">{stats.totalDocs}</p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                status: prev.status === 'completed' ? 'all' : 'completed',
              }))
            }
            className={`text-start p-3 rounded-xl border transition cursor-pointer ${
              filters.status === 'completed'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                : 'bg-emerald-50/70 hover:bg-emerald-100/80 border-emerald-200 text-emerald-950'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{t('تم القبول ✓', 'Approved ✓')}</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-black mt-1 tabular-nums">{stats.approvedCount}</p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                status: prev.status === 'pending_completion' ? 'all' : 'pending_completion',
              }))
            }
            className={`text-start p-3 rounded-xl border transition cursor-pointer ${
              filters.status === 'pending_completion'
                ? 'bg-red-600 text-white border-red-700 shadow-xs'
                : 'bg-red-50/70 hover:bg-red-100/80 border-red-200 text-red-950'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{t('مرفوض / مطلوب استكماله', 'Rejected / Incomplete')}</span>
              <XCircle className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-black mt-1 tabular-nums">{stats.rejectedCount}</p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                status: prev.status === 'received' ? 'all' : 'received',
              }))
            }
            className={`text-start p-3 rounded-xl border transition cursor-pointer ${
              filters.status === 'received'
                ? 'bg-[#0284C7] text-white border-[#0284C7] shadow-xs'
                : 'bg-sky-50/70 hover:bg-sky-100/80 border-sky-200 text-sky-950'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{t('قيد المراجعة ⏳', 'Under Review ⏳')}</span>
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-black mt-1 tabular-nums">
              {stats.pendingReviewCount}
            </p>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              placeholder={t(
                'بحث باسم العميل، الهاتف، المستند، اسم المراجع، أو الملاحظة...',
                'Search client, phone, document, reviewer, or notes...'
              )}
              className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-[#0F2438]"
            />
          </div>

          <select
            value={filters.docType}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                docType: e.target.value as DocumentMonitorFilterCriteria['docType'],
              }))
            }
            className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-[#0F2438]"
          >
            <option value="all">{t('كل أنواع المستندات', 'All Document Types')}</option>
            <option value="passport">{t('جواز سفر', 'Passport')}</option>
            <option value="photo">{t('صورة شخصية', 'Personal Photo')}</option>
            <option value="visa">{t('تأشيرة', 'Visa')}</option>
            <option value="receipt">{t('إيصال سداد', 'Payment Receipt')}</option>
            <option value="contract">{t('عقد / تفويض', 'Contract')}</option>
            <option value="other">{t('أخرى', 'Other')}</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                dateRange: e.target.value as DocumentMonitorFilterCriteria['dateRange'],
              }))
            }
            className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-[#0F2438]"
          >
            <option value="all">{t('كل التواريخ', 'All Dates')}</option>
            <option value="today">{t('اليوم فقط', 'Today')}</option>
            <option value="7d">{t('آخر 7 أيام', 'Last 7 Days')}</option>
            <option value="30d">{t('آخر 30 يوماً', 'Last 30 Days')}</option>
          </select>
        </div>
      </div>

      {/* Audit Records Stream */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-black text-[#0F2438]">
            {t('لا توجد مستندات مطابقة لمعايير التصفية الحالية.', 'No documents match your current filters.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((rec) => {
            const meta = resolveDocumentReviewMeta(rec.currentStatus);
            const isExpanded = Boolean(expandedKeys[rec.recordKey]);
            const isUpdating = updatingKey === rec.recordKey;
            const isPdf = rec.doc.fileName?.toLowerCase().endsWith('.pdf');

            return (
              <div
                key={rec.recordKey}
                className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3"
              >
                {/* Top Summary Row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {isPdf ? (
                      <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 text-red-600 flex flex-col items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                        <span className="text-[9px] font-black">PDF</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewImage(
                            `${rec.clientName} — ${rec.doc.label}`,
                            rec.doc.dataUrl,
                            rec.doc.fileName
                          )
                        }
                        className="shrink-0 cursor-pointer"
                      >
                        <img
                          src={getDisplayableDriveImageUrl(rec.doc.dataUrl)}
                          alt={rec.doc.label}
                          loading="lazy"
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-slate-50"
                        />
                      </button>
                    )}

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="text-xs sm:text-sm font-black text-[#0F2438] truncate">
                          {rec.doc.label}
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {getDocTypeLabel(rec.doc.docType)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.badgeClass}`}
                        >
                          {lang === 'en' ? meta.labelEn : meta.labelAr}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                        <span className="font-black text-[#0F2438]">{rec.clientName}</span>
                        <span dir="ltr" className="tabular-nums text-slate-500">
                          +{rec.phone} · {rec.orderCode}
                        </span>
                        <span className="text-slate-500">
                          {t('تاريخ الرفع:', 'Uploaded:')}{' '}
                          <strong className="text-[#0F2438] tabular-nums">
                            {formatDateTime(rec.uploadedAt)}
                          </strong>
                        </span>
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <UserCheck className="w-3.5 h-3.5 text-[#C6A052]" />
                          <span>
                            {t('المراجع:', 'Reviewer:')}{' '}
                            <strong className="text-[#0F2438]">
                              {rec.lastReviewedBy || t('لم يُراجع بعد', 'Pending review')}
                            </strong>
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {isPdf ? (
                      <a
                        href={getDriveViewUrl(
                          rec.doc.dataUrl,
                          rec.doc.viewUrl,
                          rec.doc.storagePath
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{t('فتح', 'Open')}</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewImage(
                            `${rec.clientName} — ${rec.doc.label}`,
                            rec.doc.dataUrl,
                            rec.doc.fileName
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t('معاينة', 'Inspect')}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        void downloadCloudFile(rec.doc.dataUrl, rec.doc.fileName || 'document.jpg')
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t('تحميل', 'Download')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenClientDocs(rec.phone)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{t('ملف العميل', 'Client File')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(rec.recordKey)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#FAF8F2] hover:bg-amber-100 border border-[#C6A052]/50 text-[#0F2438] text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-[#C6A052]" />
                      <span>
                        {t(
                          `السجل التاريخي (${rec.timeline.length})`,
                          `Audit Log (${rec.timeline.length})`
                        )}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Inline Review Controls */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={noteDrafts[rec.recordKey] ?? rec.statusNote}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({ ...prev, [rec.recordKey]: e.target.value }))
                    }
                    placeholder={t(
                      'أضف ملاحظة مراجعة (مثال: سبب الرفض أو ملاحظة الاعتماد)...',
                      'Add review note (e.g. rejection reason or approval note)...'
                    )}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-[#0F2438]"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void handleQuickReview(rec, 'completed')}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 ${
                        rec.currentStatus === 'completed'
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>{t('تم القبول ✓', 'Approve ✓')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void handleQuickReview(rec, 'pending_completion')}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 ${
                        rec.currentStatus === 'pending_completion'
                          ? 'bg-red-600 text-white border-red-700'
                          : 'bg-white hover:bg-red-50 text-red-800 border-red-300'
                      }`}
                    >
                      <span>{t('رفض / استكمال ✕', 'Reject ✕')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void handleQuickReview(rec, 'received')}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition cursor-pointer disabled:opacity-50 ${
                        rec.currentStatus === 'received'
                          ? 'bg-[#0284C7] text-white border-[#0284C7]'
                          : 'bg-white hover:bg-sky-50 text-sky-800 border-sky-300'
                      }`}
                    >
                      {t('قيد المراجعة', 'Under Review')}
                    </button>
                  </div>
                </div>

                {/* Chronological Audit Log Timeline */}
                {isExpanded && (
                  <div className="bg-[#FAF8F2]/70 border border-[#C6A052]/35 rounded-xl p-3 sm:p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-black text-[#0F2438]">
                      <span className="inline-flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-[#C6A052]" />
                        <span>
                          {t(
                            'التسلسل التاريخي الكامل للتغييرات والمراجعات',
                            'Chronological Document Audit History'
                          )}
                        </span>
                      </span>
                      <span className="text-slate-500 font-bold">
                        {t('رافع المستند:', 'Uploaded by:')} {rec.uploadedBy}
                      </span>
                    </div>

                    <div className="space-y-2 border-s-2 border-[#C6A052]/40 ps-3.5 ms-1.5">
                      {rec.timeline.map((entry) => {
                        const style = getTimelineDotAndBadge(entry);
                        return (
                          <div
                            key={entry.id}
                            className="relative bg-white border border-slate-200 rounded-xl p-2.5 text-xs space-y-1 shadow-2xs"
                          >
                            <span
                              className={`w-2.5 h-2.5 rounded-full ring-4 absolute -start-[21px] top-3.5 ${style.dotCls}`}
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${style.pillCls}`}
                                >
                                  {lang === 'en' ? entry.statusLabelEn : entry.statusLabelAr}
                                </span>
                                <span className="font-bold text-[#0F2438]">
                                  {entry.actorRole === 'client'
                                    ? t('بواسطة العميل:', 'By Client:')
                                    : t('بواسطة المراجع:', 'Reviewed by:')}{' '}
                                  {entry.actorName}
                                </span>
                              </div>
                              <span className="text-[10.5px] text-slate-500 tabular-nums">
                                {formatDateTime(entry.timestamp)}
                              </span>
                            </div>
                            {entry.note && (
                              <p className="text-[11px] text-slate-700 bg-slate-50 rounded-lg px-2.5 py-1 border border-slate-100">
                                {t('ملاحظة:', 'Note:')} {entry.note}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

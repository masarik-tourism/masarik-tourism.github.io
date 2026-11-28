import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  MessageSquare,
  RotateCcw,
  Save,
  Sparkles,
  ToggleLeft,
  X,
  Zap,
} from 'lucide-react';
import { ChatQuickReplyTemplate, VisaOrderStatus } from '../types/travel';
import { useLanguage } from '../contexts/LanguageContext';
import {
  ORDER_STAGE_DEFINITIONS,
  StageTemplateDefinition,
  findStageQuickReplyTemplate,
} from '../utils/orderStageWhatsAppHelpers';
import {
  resolveQuickReplyTextPlaceholders,
  upsertQuickReplyTemplateCloud,
  useQuickReplyTemplates,
} from '../utils/chatStore';

interface StageWhatsAppTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminName?: string;
  isAutoWhatsAppEnabled: boolean;
  onToggleAutoWhatsApp: (enabled: boolean) => void;
}

export const StageWhatsAppTemplatesModal: React.FC<StageWhatsAppTemplatesModalProps> = ({
  isOpen,
  onClose,
  adminName = 'المدير العام',
  isAutoWhatsAppEnabled,
  onToggleAutoWhatsApp,
}) => {
  const { lang, t } = useLanguage();
  const allTemplates = useQuickReplyTemplates();

  const [selectedStatus, setSelectedStatus] = useState<VisaOrderStatus>('تم استلام الطلب');
  const [editingDraft, setEditingDraft] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [copiedPreview, setCopiedPreview] = useState(false);

  const currentDefinition: StageTemplateDefinition = useMemo(() => {
    return (
      ORDER_STAGE_DEFINITIONS.find((d) => d.status === selectedStatus) ||
      ORDER_STAGE_DEFINITIONS[0]
    );
  }, [selectedStatus]);

  const matchedCustomTemplate: ChatQuickReplyTemplate | undefined = useMemo(() => {
    return findStageQuickReplyTemplate(allTemplates, selectedStatus);
  }, [allTemplates, selectedStatus]);

  // Sync draft text whenever selected stage changes or templates update
  React.useEffect(() => {
    if (matchedCustomTemplate?.text) {
      setEditingDraft(matchedCustomTemplate.text);
    } else {
      setEditingDraft(
        lang === 'en'
          ? currentDefinition.defaultTextEn
          : currentDefinition.defaultTextAr
      );
    }
    setSaveFeedback(null);
  }, [selectedStatus, matchedCustomTemplate, lang, currentDefinition]);

  // Sample live preview context
  const livePreviewText = useMemo(() => {
    return resolveQuickReplyTextPlaceholders(editingDraft, {
      clientName: 'أحمد محمود',
      orderCode: 'MSK-50024',
      serviceTitle: 'تأشيرة سياحة السعودية',
      stageLabel: currentDefinition.badgeLabelAr,
      portalUrl: 'https://masarik-tourism.github.io/',
      phone: '01128440008',
    });
  }, [editingDraft, currentDefinition.badgeLabelAr]);

  if (!isOpen) return null;

  const handleInsertTag = (tag: string) => {
    setEditingDraft((prev) => `${prev} ${tag}`.trim());
  };

  const handleResetToDefault = () => {
    setEditingDraft(
      lang === 'en'
        ? currentDefinition.defaultTextEn
        : currentDefinition.defaultTextAr
    );
    setSaveFeedback(t('تم استعادة النص الافتراضي لهذا المرحلة', 'Default template restored'));
    setTimeout(() => setSaveFeedback(null), 2500);
  };

  const handleSaveTemplate = async () => {
    if (!editingDraft.trim()) return;
    setIsSaving(true);
    setSaveFeedback(null);
    try {
      const templateTitle = `مرحلة: ${currentDefinition.badgeLabelAr}`;
      await upsertQuickReplyTemplateCloud({
        id: matchedCustomTemplate?.id,
        title: templateTitle,
        text: editingDraft.trim(),
        category: 'order_stages',
        createdBy: adminName,
      });

      setSaveFeedback(
        t(
          'تم حفظ وتخصيص قالب الرسالة ومزامنته سحابياً بنجاح ✅',
          'Stage template customized & cloud synced ✅'
        )
      );
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch {
      setSaveFeedback(t('تعذر حفظ القالب حالياً.', 'Failed to save template.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0A1926]/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-xs text-[#0F2438]">
        {/* Modal Header */}
        <div className="bg-gradient-to-l from-[#0F2438] via-[#163B65] to-[#0F2438] p-4 sm:p-5 text-white flex items-center justify-between gap-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C6A052] text-[#0A1926] flex items-center justify-center font-black shadow-xs shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white">
                  {t('قوالب رسائل واتساب التلقائية لتحديث المراحل', 'Automated WhatsApp Stage Message Templates')}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-[#C6A052]/20 border border-[#C6A052]/40 text-[#E5C887] text-[10.5px] font-black">
                  {t('قوالب الردود السريعة', 'Quick Replies')}
                </span>
              </div>
              <p className="text-slate-300 text-xs mt-0.5">
                {t(
                  'تخصيص الرسائل التي تُرسل تلقائياً للعملاء على واتساب عند تغيير مرحلة الطلب.',
                  'Customize messages sent automatically to clients on WhatsApp when order stage changes.'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('إغلاق', 'Close')}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global Auto-Send Master Toggle */}
        <div className="px-4 sm:px-6 py-3 bg-[#FAF8F2] border-b border-[#C6A052]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#C6A052] shrink-0" />
            <div>
              <span className="font-black text-[#0F2438] text-xs sm:text-sm block">
                {t('الإرسال التلقائي عبر واتساب عند تغيير الحالة', 'Auto-WhatsApp on Stage Change')}
              </span>
              <span className="text-[11px] text-slate-600 block">
                {isAutoWhatsAppEnabled
                  ? t(
                      'مفعّل: عند الضغط على أي مرحلة يتم تجهيز رسالة الواتساب المخصصة فوراً للعميل.',
                      'Enabled: 1-click stage buttons instantly prompt the customized WhatsApp notification.'
                    )
                  : t(
                      'معطّل: تحديث المراحل يتم داخلياً فقط بدون فتح واتساب تلقائياً.',
                      'Disabled: Stage updates silently without opening WhatsApp.'
                    )}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleAutoWhatsApp(!isAutoWhatsAppEnabled)}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              isAutoWhatsAppEnabled
                ? 'bg-[#25D366] text-white shadow-xs'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {isAutoWhatsAppEnabled ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('المزامنة التلقائية مفعلة ✅', 'Auto-Dispatch Enabled ✅')}</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4" />
                <span>{t('المزامنة معطلة (يدوي فقط)', 'Disabled (Manual Only)')}</span>
              </>
            )}
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Stage Selector Tabs */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-xs">
              {t('اختر مرحلة الطلب لتخصيص رسالتها:', 'Select Order Stage to Customize:')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {ORDER_STAGE_DEFINITIONS.map((def) => {
                const isActive = selectedStatus === def.status;
                const hasCustom = findStageQuickReplyTemplate(allTemplates, def.status);
                return (
                  <button
                    key={def.status}
                    type="button"
                    onClick={() => setSelectedStatus(def.status)}
                    className={`p-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 min-h-[46px] ${
                      isActive
                        ? 'bg-[#0F2438] text-[#E5C887] border-[#C6A052] shadow-xs ring-1 ring-[#C6A052]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-[#0F2438]'
                    }`}
                  >
                    <span className="font-black text-[11px] leading-tight block truncate w-full">
                      {def.badgeLabelAr}
                    </span>
                    {hasCustom && (
                      <span className="text-[9.5px] font-bold text-[#C6A052] block">
                        • {t('مخصص', 'Customized')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Variable Insertion Chips */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
            <span className="text-[11px] font-black text-slate-700 block">
              {t('اضغط على المتغير لإدراجه تلقائياً في نص الرسالة:', 'Click variable to insert into message:')}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { tag: '{اسم_العميل}', label: 'اسم العميل' },
                  { tag: '{رقم_الطلب}', label: 'كود الطلب' },
                  { tag: '{نوع_الخدمة}', label: 'نوع التأشيرة/الخدمة' },
                  { tag: '{المرحلة_الحالية}', label: 'المرحلة الحالية' },
                  { tag: '{رابط_المنصة}', label: 'رابط المحفظة' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.tag}
                  type="button"
                  onClick={() => handleInsertTag(chip.tag)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-[#0F2438] hover:bg-[#FAF8F2] text-[#0F2438] font-mono text-[11px] font-black inline-flex items-center gap-1 cursor-pointer transition shadow-2xs"
                >
                  <span className="text-[#C6A052] font-black">+</span>
                  <span>{chip.tag}</span>
                  <span className="text-[10px] text-slate-500 font-sans">({chip.label})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Template Text Editor */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="font-bold text-slate-700 text-xs">
                {t('نص رسالة الواتساب المخصصة لهذا المرحلة:', 'Custom WhatsApp Message Text:')}
              </label>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-[11px] font-bold text-slate-500 hover:text-[#0F2438] flex items-center gap-1 cursor-pointer transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('استعادة النص الافتراضي', 'Restore Default')}</span>
              </button>
            </div>
            <textarea
              rows={5}
              value={editingDraft}
              onChange={(e) => setEditingDraft(e.target.value)}
              placeholder={t('اكتب نص رسالة الواتساب هنا...', 'Write WhatsApp message text here...')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] text-xs leading-relaxed font-sans focus:border-[#0F2438] focus:ring-1 focus:ring-[#C6A052]/30 focus:outline-none"
            />
          </div>

          {/* Live Simulated WhatsApp Bubble Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#25D366]" />
                <span>{t('معاينة حية كما ستصل للعميل في واتساب:', 'Live WhatsApp Preview:')}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(livePreviewText);
                  setCopiedPreview(true);
                  setTimeout(() => setCopiedPreview(false), 2000);
                }}
                className="text-[10.5px] font-bold text-slate-500 hover:text-[#0F2438] flex items-center gap-1 cursor-pointer"
              >
                {copiedPreview ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>{t('تم النسخ', 'Copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>{t('نسخ النص', 'Copy')}</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-[#EFEAE2] p-3 sm:p-4 rounded-2xl border border-slate-200">
              <div className="bg-[#DCF8C6] text-[#0A1926] rounded-2xl rounded-tr-none p-3 shadow-xs max-w-[92%] sm:max-w-[85%] space-y-1 text-xs leading-relaxed whitespace-pre-line border border-emerald-200/50">
                <p className="font-sans font-medium">{livePreviewText}</p>
                <div className="text-end text-[10px] text-slate-500 font-mono flex items-center justify-end gap-1">
                  <span>10:30 AM</span>
                  <span className="text-sky-600 font-black">✓✓</span>
                </div>
              </div>
            </div>
          </div>

          {saveFeedback && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-black text-center flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveFeedback}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 font-bold">
            {t(
              'يتم حفظ التخصيص في قوالب الردود السريعة ومزامنته سحابياً لكافة المشرفين.',
              'Saved to Quick Replies and synced across all admins.'
            )}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer transition"
            >
              {t('إغلاق', 'Close')}
            </button>
            <button
              type="button"
              disabled={isSaving || !editingDraft.trim()}
              onClick={() => void handleSaveTemplate()}
              className="min-h-[38px] px-5 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? t('جاري الحفظ...', 'Saving...') : t('حفظ القالب سحابياً', 'Save & Sync Template')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

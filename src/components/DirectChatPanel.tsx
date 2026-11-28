import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Paperclip,
  X,
  FileText,
  Download,
  ExternalLink,
  Check,
  CheckCheck,
  Building2,
  ShieldCheck,
  Loader2,
  Image as ImageIcon,
  Zap,
  MessageSquare,
  Trash2,
  Settings2,
  Plus,
  Edit3,
  RotateCcw,
  BookmarkCheck,
} from 'lucide-react';
import {
  AccountType,
  ChatMessage,
  ChatQuickReplyTemplate,
  ChatSenderRole,
  QuickReplyCategory,
} from '../types/travel';
import {
  clearAdminChatHistoryCloud,
  clearLocalChatCache,
  deleteQuickReplyTemplateCloud,
  getLocalAdminClearedAt,
  markChatThreadReadCloud,
  permanentlyDeleteChatHistoryCloud,
  playChatNotificationChime,
  resetQuickReplyTemplatesToDefaultsCloud,
  resolveQuickReplyTextPlaceholders,
  sendChatMessageCloud,
  subscribeChatMessages,
  subscribeChatThread,
  upsertQuickReplyTemplateCloud,
  useQuickReplyTemplates,
} from '../utils/chatStore';
import {
  downloadCloudFile,
  getDisplayableDriveImageUrl,
  getDriveViewUrl,
} from '../utils/firebaseStorageHelper';
import { formatLastSeenRelative } from '../utils/travelerStore';
import { useLanguage } from '../contexts/LanguageContext';

interface DirectChatPanelProps {
  phone: string;
  recipientTitle: string;
  recipientSubtitle?: string;
  avatarUrl?: string;
  accountType?: AccountType;
  recipientVerified?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string;
  senderRole: ChatSenderRole;
  senderName: string;
  clientName?: string;
  companyName?: string;
  orderCode?: string;
  onInspectImage?: (url: string, title: string) => void;
  compactHeight?: boolean;
}

export const DirectChatPanel: React.FC<DirectChatPanelProps> = ({
  phone,
  recipientTitle,
  recipientSubtitle,
  avatarUrl,
  accountType = 'individual',
  recipientVerified,
  isOnline = false,
  lastSeenAt,
  senderRole,
  senderName,
  clientName,
  companyName,
  orderCode,
  onInspectImage,
  compactHeight = false,
}) => {
  const { lang, dir, t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [adminClearedAt, setAdminClearedAt] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingAction, setClearingAction] = useState(false);
  const [clearFeedback, setClearFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Admin Quick Reply Templates state
  const quickReplyTemplates = useQuickReplyTemplates();
  const [quickReplySendMode, setQuickReplySendMode] = useState<'instant' | 'insert'>('instant');
  const [quickReplyCategoryFilter, setQuickReplyCategoryFilter] = useState<
    'all' | QuickReplyCategory
  >('all');
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [tplSearch, setTplSearch] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [tplTitleDraft, setTplTitleDraft] = useState('');
  const [tplCategoryDraft, setTplCategoryDraft] = useState<QuickReplyCategory>('general');
  const [tplTextDraft, setTplTextDraft] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [tplFeedback, setTplFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSeenMsgIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!phone) {
      setAdminClearedAt(null);
      return;
    }
    const localCleared = getLocalAdminClearedAt(phone);
    setAdminClearedAt(localCleared);

    const unsubThread = subscribeChatThread(phone, (thread) => {
      const cloudCleared = thread?.adminClearedAt || null;
      const latestLocal = getLocalAdminClearedAt(phone);
      if (cloudCleared && latestLocal) {
        setAdminClearedAt(cloudCleared >= latestLocal ? cloudCleared : latestLocal);
      } else {
        setAdminClearedAt(cloudCleared || latestLocal || null);
      }
    });
    return () => unsubThread();
  }, [phone]);

  // Subscribe to isolated live chat thread messages
  useEffect(() => {
    initializedRef.current = false;
    lastSeenMsgIdRef.current = null;
    if (!phone) return;

    const unsub = subscribeChatMessages(phone, (nextMsgs) => {
      setMessages(nextMsgs);
      const latest = nextMsgs[nextMsgs.length - 1];

      if (!initializedRef.current) {
        initializedRef.current = true;
        lastSeenMsgIdRef.current = latest?.id || null;
      } else if (latest && latest.id !== lastSeenMsgIdRef.current) {
        lastSeenMsgIdRef.current = latest.id;
        if (latest.senderRole !== senderRole) {
          playChatNotificationChime(true);
        }
      }

      // Mark unread messages from opposite party as read while chat panel is open
      const hasUnreadFromOpposite = nextMsgs.some((m) =>
        senderRole === 'admin' ? !m.readByAdmin : !m.readByClient
      );
      if (hasUnreadFromOpposite) {
        void markChatThreadReadCloud(phone, senderRole);
      }
    });

    return () => unsub();
  }, [phone, senderRole]);

  const displayedMessages = messages.filter((m) => {
    if (senderRole === 'admin' && adminClearedAt) {
      if (m.createdAt <= adminClearedAt) return false;
    }
    return true;
  });

  // Smooth scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [displayedMessages.length]);

  const handleAdminOnlyClear = async () => {
    if (clearingAction) return;
    setClearingAction(true);
    setClearFeedback(null);
    try {
      const res = await clearAdminChatHistoryCloud(phone);
      setAdminClearedAt(res.clearedAt || new Date().toISOString());
      setClearFeedback({
        ok: true,
        text: t(
          'تم مسح وإخفاء الرسائل السابقة من لوحة الإدارة فقط (تظل ظاهرة للعميل).',
          'Chat history hidden from admin view only (still visible to client).'
        ),
      });
    } catch (err) {
      setClearFeedback({
        ok: false,
        text:
          err instanceof Error
            ? err.message
            : t('تعذر مسح المحادثة.', 'Failed to clear chat.'),
      });
    } finally {
      setClearingAction(false);
      setShowClearModal(false);
    }
  };

  const handlePermanentDeleteBothSides = async () => {
    if (clearingAction) return;
    setClearingAction(true);
    setClearFeedback(null);
    try {
      const knownIds = messages.map((m) => m.id).filter(Boolean);
      const res = await permanentlyDeleteChatHistoryCloud(phone, knownIds);
      clearLocalChatCache(phone);
      setMessages([]);
      setAdminClearedAt(null);
      if (res.ok) {
        setClearFeedback({
          ok: true,
          text: t(
            'تم حذف المحادثة بالكامل نهائياً من الإدارة ومن عند العميل.',
            'Chat history permanently deleted for both admin and client.'
          ),
        });
      } else {
        setClearFeedback({
          ok: false,
          text: res.error || t('تعذر الحذف النهائي للمحادثة.', 'Failed to delete chat.'),
        });
      }
    } catch (err) {
      clearLocalChatCache(phone);
      setMessages([]);
      setAdminClearedAt(null);
      setClearFeedback({
        ok: false,
        text:
          err instanceof Error
            ? err.message
            : t('تعذر الحذف النهائي للمحادثة.', 'Failed to delete chat.'),
      });
    } finally {
      setClearingAction(false);
      setShowClearModal(false);
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setErrorMsg(null);
    setPendingFiles((prev) => [...prev, ...selected].slice(0, 10));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async (
    overrideText?: string,
    messageType?: ChatMessage['messageType']
  ) => {
    const msgText = (overrideText !== undefined ? overrideText : text).trim();
    const filesToSend = pendingFiles;
    if ((!msgText && filesToSend.length === 0) || isSending) return;

    setErrorMsg(null);
    setIsSending(true);
    try {
      const res = await sendChatMessageCloud({
        phone,
        senderRole,
        senderName,
        text: msgText,
        files: filesToSend,
        messageType,
        accountType,
        clientName,
        companyName,
      });

      if (!res.ok) {
        setErrorMsg(res.error || t('تعذر إرسال الرسالة.', 'Failed to send message.'));
      } else {
        if (overrideText === undefined) {
          setText('');
        }
        setPendingFiles([]);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : t('حدث خطأ أثناء رفع المرفقات.', 'Error uploading attachments.')
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleImageClick = (url: string, title: string) => {
    if (onInspectImage) {
      onInspectImage(url, title);
    } else {
      setLightboxImage({ url, title });
    }
  };

  const quickReplyCategories: { id: QuickReplyCategory; labelAr: string; labelEn: string }[] = [
    { id: 'general', labelAr: 'عام', labelEn: 'General' },
    { id: 'order_stages', labelAr: 'مراحل الطلبات وواتساب', labelEn: 'Order Stages & WA' },
    { id: 'documents', labelAr: 'المستندات', labelEn: 'Documents' },
    { id: 'appointments', labelAr: 'المواعيد', labelEn: 'Appointments' },
    { id: 'visas', labelAr: 'التأشيرات', labelEn: 'Visas' },
    { id: 'payment', labelAr: 'الدفع', labelEn: 'Payment' },
  ];

  const getCategoryLabel = (cat: QuickReplyCategory) => {
    const found = quickReplyCategories.find((c) => c.id === cat);
    return found ? (lang === 'en' ? found.labelEn : found.labelAr) : t('عام', 'General');
  };

  const resolveTemplateBody = (tpl: ChatQuickReplyTemplate) =>
    resolveQuickReplyTextPlaceholders(tpl.text, {
      clientName: clientName || recipientTitle,
      orderCode: orderCode || `MSK-${phone.slice(-6)}`,
    });

  const handleUseQuickReplyTemplate = (
    tpl: ChatQuickReplyTemplate,
    forcedMode?: 'instant' | 'insert'
  ) => {
    const resolved = resolveTemplateBody(tpl);
    const mode = forcedMode || quickReplySendMode;
    if (mode === 'insert') {
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${resolved}` : resolved));
      setShowTemplatesModal(false);
      return;
    }
    setShowTemplatesModal(false);
    void handleSend(resolved, 'quick_reply');
  };

  const handleStartNewTemplate = () => {
    setEditingTemplateId(null);
    setTplTitleDraft('');
    setTplCategoryDraft('general');
    setTplTextDraft('');
    setTplFeedback(null);
  };

  const handleStartEditTemplate = (tpl: ChatQuickReplyTemplate) => {
    setEditingTemplateId(tpl.id);
    setTplTitleDraft(tpl.title);
    setTplCategoryDraft(tpl.category);
    setTplTextDraft(tpl.text);
    setTplFeedback(null);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplTextDraft.trim() || isSavingTemplate) return;
    setIsSavingTemplate(true);
    setTplFeedback(null);
    try {
      const res = await upsertQuickReplyTemplateCloud({
        id: editingTemplateId || undefined,
        title: tplTitleDraft,
        text: tplTextDraft,
        category: tplCategoryDraft,
        createdBy: senderName,
      });
      setTplFeedback({
        ok: true,
        text: res.cloudSynced
          ? t('تم حفظ القالب ومزامنته سحابياً بنجاح ✓', 'Template saved & cloud-synced ✓')
          : t('تم حفظ القالب محلياً بنجاح ✓', 'Template saved locally ✓'),
      });
      handleStartNewTemplate();
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (tplId: string) => {
    if (isSavingTemplate) return;
    setIsSavingTemplate(true);
    try {
      await deleteQuickReplyTemplateCloud(tplId, senderName);
      if (editingTemplateId === tplId) {
        handleStartNewTemplate();
      }
      setTplFeedback({
        ok: true,
        text: t('تم حذف القالب بنجاح.', 'Template deleted.'),
      });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleResetTemplates = async () => {
    if (isSavingTemplate) return;
    setIsSavingTemplate(true);
    try {
      await resetQuickReplyTemplatesToDefaultsCloud(senderName);
      handleStartNewTemplate();
      setTplFeedback({
        ok: true,
        text: t('تمت استعادة القوالب الافتراضية.', 'Default templates restored.'),
      });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const filteredQuickReplyBarTemplates = quickReplyTemplates.filter((tpl) =>
    quickReplyCategoryFilter === 'all' ? true : tpl.category === quickReplyCategoryFilter
  );

  const filteredModalTemplates = quickReplyTemplates.filter((tpl) => {
    if (quickReplyCategoryFilter !== 'all' && tpl.category !== quickReplyCategoryFilter) {
      return false;
    }
    const q = tplSearch.trim().toLowerCase();
    if (!q) return true;
    return `${tpl.title} ${tpl.text}`.toLowerCase().includes(q);
  });

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso.slice(11, 16);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={`flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${
        compactHeight ? 'h-[480px] sm:h-[540px]' : 'h-[560px] sm:h-[620px]'
      }`}
    >
      {/* Chat Header */}
      <div className="bg-[#0F2438] text-white px-4 py-3 flex items-center justify-between gap-3 border-b border-[#C6A052]/40 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img
                src={getDisplayableDriveImageUrl(avatarUrl)}
                alt={recipientTitle}
                className="w-10 h-10 rounded-full object-cover border-2 border-[#C6A052] bg-white"
              />
            ) : accountType === 'b2b_partner' ? (
              <div className="w-10 h-10 rounded-full bg-[#C6A052]/20 border-2 border-[#C6A052] text-[#E5C887] flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/10 border border-[#C6A052]/60 text-[#E5C887] flex items-center justify-center font-black text-sm">
                {senderRole === 'client' ? (
                  <ShieldCheck className="w-5 h-5" />
                ) : (
                  recipientTitle.slice(0, 2)
                )}
              </div>
            )}
            {senderRole === 'admin' && (
              <span
                className={`absolute -bottom-0.5 -end-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0F2438] ${
                  isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-sm font-black text-white truncate">{recipientTitle}</h3>
              {accountType === 'b2b_partner' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#C6A052] text-[#0A1926] text-[10px] font-black shrink-0">
                  <Building2 className="w-3 h-3" />
                  <span>{t('شركة شريكة B2B', 'B2B Partner')}</span>
                </span>
              )}
              {senderRole === 'admin' && recipientVerified !== undefined && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 border ${
                    recipientVerified
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : 'bg-orange-500/25 border-orange-400/60 text-orange-200'
                  }`}
                >
                  <span>
                    {recipientVerified
                      ? t('✅ موثق', '✅ Verified')
                      : t('⚠️ غير موثق / غير مفعل', '⚠️ Unverified')}
                  </span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 truncate flex items-center gap-1.5">
              {senderRole === 'admin' ? (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isOnline ? 'bg-emerald-400' : 'bg-slate-400'
                    }`}
                  />
                  <span>{formatLastSeenRelative(lastSeenAt, isOnline, lang)}</span>
                  {recipientSubtitle && (
                    <span className="text-slate-400">• {recipientSubtitle}</span>
                  )}
                </>
              ) : (
                <span>
                  {recipientSubtitle ||
                    t(
                      'محادثة مباشرة وفورية مع إدارة مسارك للإنجاز السياحي',
                      'Direct real-time chat with Masarik Tourism Management'
                    )}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {senderRole === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setClearFeedback(null);
                setShowClearModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-red-100 text-[11px] font-black transition cursor-pointer"
              title={t('مسح المحادثة 🗑️', 'Clear Chat 🗑️')}
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t('مسح المحادثة', 'Clear Chat')}</span>
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-[#E5C887] text-[10.5px] font-bold shrink-0">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t('مشفّرة ومعزولة', 'Private Thread')}</span>
          </span>
        </div>
      </div>

      {/* Admin Clear Feedback Banner */}
      {clearFeedback && (
        <div
          className={`px-3.5 py-2 text-[11.5px] font-bold flex items-center justify-between gap-2 border-b shrink-0 ${
            clearFeedback.ok
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span>{clearFeedback.text}</span>
          <button
            type="button"
            onClick={() => setClearFeedback(null)}
            className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-slate-50/75">
        {displayedMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
            <div className="w-12 h-12 rounded-2xl bg-[#0F2438]/10 text-[#0F2438] flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-black text-[#0F2438]">
              {adminClearedAt && senderRole === 'admin'
                ? t('تم مسح السجل من لوحة الإدارة', 'Chat cleared from admin view')
                : t('ابدأ المحادثة الفورية الآن', 'Start your live conversation now')}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
              {t(
                'يمكنك إرسال الرسائل النصية أو صور الجوازات أو ملفات PDF وسيتم ضغطها وحفظها في السحابة بشكل تلقائي وآمن.',
                'Send messages, passport photos, or PDF documents — images are automatically compressed and stored securely.'
              )}
            </p>
          </div>
        ) : (
          displayedMessages.map((msg) => {
            const isOwn = msg.senderRole === senderRole;
            const isReadByOther = isOwn
              ? senderRole === 'admin'
                ? msg.readByClient
                : msg.readByAdmin
              : true;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                    msg.messageType === 'status_notice'
                      ? 'bg-amber-50 border border-amber-300 text-amber-950'
                      : isOwn
                      ? 'bg-[#0F2438] text-white border border-[#C6A052]/35 rounded-ee-sm'
                      : 'bg-white text-[#0F2438] border border-slate-200 rounded-es-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span
                      className={`text-[10.5px] font-black ${
                        msg.messageType === 'status_notice'
                          ? 'text-amber-800'
                          : isOwn
                          ? 'text-[#E5C887]'
                          : 'text-[#0284C7]'
                      }`}
                    >
                      {msg.senderName}
                    </span>
                  </div>

                  {msg.text && (
                    <p className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>
                  )}

                  {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.attachments.map((att) => {
                        const isImage =
                          att.mimeType?.startsWith('image/') ||
                          /\.(jpe?g|png|webp|gif)$/i.test(att.fileName || '');
                        const imgSrc = getDisplayableDriveImageUrl(att.downloadUrl);
                        const openUrl = getDriveViewUrl(
                          att.downloadUrl,
                          att.viewUrl,
                          att.storagePath
                        );

                        if (isImage) {
                          return (
                            <div
                              key={att.id}
                              className={`rounded-xl overflow-hidden border ${
                                isOwn ? 'border-white/20 bg-black/20' : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleImageClick(imgSrc, att.fileName)}
                                className="block w-full cursor-pointer group relative"
                              >
                                <img
                                  src={imgSrc}
                                  alt={att.fileName}
                                  loading="lazy"
                                  className="max-h-56 w-full object-cover bg-white"
                                />
                              </button>
                              <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[10.5px]">
                                <span className="truncate font-semibold max-w-[160px]">
                                  {att.fileName}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => void downloadCloudFile(att.downloadUrl, att.fileName)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold cursor-pointer ${
                                      isOwn
                                        ? 'bg-white/15 hover:bg-white/25 text-white'
                                        : 'bg-slate-200 hover:bg-slate-300 text-[#0F2438]'
                                    }`}
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>{t('تحميل', 'Download')}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={att.id}
                            className={`rounded-xl p-2.5 border flex items-center justify-between gap-2.5 ${
                              isOwn
                                ? 'bg-white/10 border-white/20 text-white'
                                : 'bg-slate-50 border-slate-200 text-[#0F2438]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  isOwn
                                    ? 'bg-[#C6A052]/25 text-[#E5C887]'
                                    : 'bg-red-50 text-red-600'
                                }`}
                              >
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-bold block truncate">
                                  {att.fileName}
                                </span>
                                {att.sizeBytes ? (
                                  <span
                                    className={`text-[10px] ${
                                      isOwn ? 'text-slate-300' : 'text-slate-500'
                                    }`}
                                  >
                                    PDF • {formatBytes(att.sizeBytes)}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {openUrl && (
                                <a
                                  href={openUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`p-1.5 rounded-lg transition ${
                                    isOwn
                                      ? 'bg-white/15 hover:bg-white/25 text-white'
                                      : 'bg-white border border-slate-200 hover:bg-slate-100 text-[#0F2438]'
                                  }`}
                                  title={t('معاينة', 'Preview')}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => void downloadCloudFile(att.downloadUrl, att.fileName)}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${
                                  isOwn
                                    ? 'bg-[#C6A052] hover:bg-[#d5b162] text-[#0A1926]'
                                    : 'bg-[#0F2438] hover:bg-[#1a3a57] text-white'
                                }`}
                                title={t('تحميل', 'Download')}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div
                    className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                      msg.messageType === 'status_notice'
                        ? 'text-amber-700'
                        : isOwn
                        ? 'text-slate-300'
                        : 'text-slate-400'
                    }`}
                  >
                    <span>{formatTime(msg.createdAt)}</span>
                    {isOwn && (
                      <span
                        className="inline-flex items-center gap-0.5"
                        title={
                          isReadByOther
                            ? t('تمت القراءة', 'Read')
                            : t('تم الإرسال', 'Sent')
                        }
                      >
                        {isReadByOther ? (
                          <>
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[9.5px] text-emerald-300 font-bold">
                              {t('تمت القراءة', 'Read')}
                            </span>
                          </>
                        ) : (
                          <Check className="w-3 h-3 text-slate-400" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Admin Quick-Reply Templates Bar directly above composer */}
      {senderRole === 'admin' && (
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 space-y-1.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10.5px] font-black text-[#0F2438]">
                <Zap className="w-3.5 h-3.5 text-[#C6A052]" />
                <span>{t('قوالب الردود السريعة:', 'Quick Reply Templates:')}</span>
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[10px] font-black">
                <button
                  type="button"
                  onClick={() => setQuickReplySendMode('instant')}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                    quickReplySendMode === 'instant'
                      ? 'bg-[#0F2438] text-[#E5C887]'
                      : 'text-slate-600 hover:text-[#0F2438]'
                  }`}
                >
                  {t('⚡ إرسال فوري', '⚡ 1-Click Send')}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickReplySendMode('insert')}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                    quickReplySendMode === 'insert'
                      ? 'bg-[#0284C7] text-white'
                      : 'text-slate-600 hover:text-[#0F2438]'
                  }`}
                >
                  {t('✏️ إدراج للنص', '✏️ Insert Text')}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={quickReplyCategoryFilter}
                onChange={(e) =>
                  setQuickReplyCategoryFilter(e.target.value as 'all' | QuickReplyCategory)
                }
                aria-label={t('تصنيف القوالب', 'Template category')}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-[10.5px] font-bold text-[#0F2438]"
              >
                <option value="all">{t('كل القوالب', 'All')}</option>
                {quickReplyCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'en' ? c.labelEn : c.labelAr}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setTplFeedback(null);
                  setShowTemplatesModal(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[10.5px] font-black inline-flex items-center gap-1 cursor-pointer transition shadow-xs"
              >
                <Settings2 className="w-3 h-3" />
                <span>{t('إدارة وحفظ القوالب', 'Manage Templates')}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {filteredQuickReplyBarTemplates.length === 0 ? (
              <span className="text-[11px] text-slate-500">
                {t('لا توجد قوالب في هذا التصنيف.', 'No templates in this category.')}
              </span>
            ) : (
              filteredQuickReplyBarTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  disabled={isSending}
                  onClick={() => handleUseQuickReplyTemplate(tpl)}
                  title={resolveTemplateBody(tpl)}
                  className="px-2.5 py-1 rounded-full bg-white hover:bg-[#0F2438] hover:text-[#E5C887] text-[#0F2438] border border-slate-300 text-[11px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <BookmarkCheck className="w-3 h-3 text-[#C6A052] shrink-0" />
                  <span>{tpl.title}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Pending Multi-File Preview Bar */}
      {pendingFiles.length > 0 && (
        <div className="bg-sky-50/90 border-t border-sky-200 px-3 py-2 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-[10.5px] font-bold text-sky-900">
            <span>
              {t(
                `ملفات جاهزة للإرسال (${pendingFiles.length}) — يتم ضغط الصور تلقائياً`,
                `Files ready to send (${pendingFiles.length}) — images auto-compressed`
              )}
            </span>
            <button
              type="button"
              onClick={() => setPendingFiles([])}
              className="text-red-600 hover:underline cursor-pointer"
            >
              {t('مسح الكل', 'Clear all')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pendingFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-sky-200 text-xs font-bold text-[#0F2438]"
              >
                {file.type.startsWith('image/') ? (
                  <ImageIcon className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-red-600 shrink-0" />
                )}
                <span className="max-w-[130px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemovePendingFile(idx)}
                  className="text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Bar */}
      {errorMsg && (
        <div className="bg-red-50 border-t border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-700 flex items-center justify-between gap-2 shrink-0">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="bg-white border-t border-slate-200 p-2.5 sm:p-3 flex items-end gap-2 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={handleFilesSelected}
          className="hidden"
        />

        <button
          type="button"
          disabled={isSending}
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] flex items-center justify-center shrink-0 transition cursor-pointer disabled:opacity-50"
          title={t('إرفاق صور أو ملفات PDF (متعدد)', 'Attach photos or PDFs (multi-select)')}
        >
          <Paperclip className="w-4.5 h-4.5" />
        </button>

        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={t(
            'اكتب رسالتك أو أرفق صور الجوازات والملفات هنا...',
            'Type your message or attach passports & PDF files...'
          )}
          className="flex-1 min-h-[40px] max-h-28 resize-none rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#0284C7] focus:outline-none px-3 py-2 text-xs sm:text-sm text-[#0F2438]"
        />

        <button
          type="button"
          disabled={isSending || (!text.trim() && pendingFiles.length === 0)}
          onClick={() => void handleSend()}
          className="h-10 px-4 rounded-xl bg-[#0F2438] hover:bg-[#1a3a57] text-[#E5C887] font-black text-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-45"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{t('إرسال', 'Send')}</span>
        </button>
      </div>

      {/* Built-in Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0F2438] text-white px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-xs font-bold truncate">{lightboxImage.title}</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 bg-slate-100 flex items-center justify-center max-h-[75vh]">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[70vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
      {/* Admin Clear / Delete Chat Confirmation Modal */}
      {showClearModal && senderRole === 'admin' && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-xs p-4"
          onClick={() => !clearingAction && setShowClearModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0F2438] text-white px-4 py-3.5 flex items-center justify-between gap-2 border-b border-[#C6A052]/40">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4.5 h-4.5 text-red-300" />
                <h4 className="text-sm font-black">
                  {t('خيارات مسح المحادثة', 'Chat Clear & Deletion Options')}
                </h4>
              </div>
              <button
                type="button"
                disabled={clearingAction}
                onClick={() => setShowClearModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                {t(
                  `اختر طريقة مسح سجل المحادثة مع "${recipientTitle}":`,
                  `Choose how to clear the chat history with "${recipientTitle}":`
                )}
              </p>

              <button
                type="button"
                disabled={clearingAction}
                onClick={() => void handleAdminOnlyClear()}
                className="w-full text-start p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100/80 transition cursor-pointer disabled:opacity-50 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-black text-amber-950">
                    {t('حذف من عندي فقط / إخفاء من الإدارة', 'Clear for Admin Only (Hide History)')}
                  </span>
                  {clearingAction && <Loader2 className="w-4 h-4 animate-spin text-amber-700" />}
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  {t(
                    'يُخفي الرسائل السابقة من لوحة الإدارة فقط، بينما تبقى المحادثة كاملة ظاهرة للعميل دون حذف.',
                    'Hides older messages from the admin dashboard while keeping the full chat visible to the client.'
                  )}
                </p>
              </button>

              <button
                type="button"
                disabled={clearingAction}
                onClick={() => void handlePermanentDeleteBothSides()}
                className="w-full text-start p-3.5 rounded-xl border border-red-300 bg-red-50/80 hover:bg-red-100 transition cursor-pointer disabled:opacity-50 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-black text-red-900">
                    {t('حذف نهائي من عندي ومن عند العميل', 'Permanently Delete for Both Sides')}
                  </span>
                  {clearingAction && <Loader2 className="w-4 h-4 animate-spin text-red-700" />}
                </div>
                <p className="text-[11px] text-red-700 leading-relaxed">
                  {t(
                    'يمسح جميع رسائل هذه المحادثة نهائياً من السحابة لدى الإدارة والعميل معاً ولا يمكن التراجع عنه.',
                    'Permanently deletes all chat messages from Firestore for both admin and client. Cannot be undone.'
                  )}
                </p>
              </button>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  disabled={clearingAction}
                  onClick={() => setShowClearModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Quick Reply Templates Manager Modal */}
      {showTemplatesModal && senderRole === 'admin' && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 bg-black/65 backdrop-blur-xs p-3 sm:p-4"
          dir={dir}
          onClick={() => setShowTemplatesModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0F2438] text-white px-4 py-3.5 flex items-center justify-between gap-2 border-b border-[#C6A052]/40 shrink-0">
              <div className="flex items-center gap-2">
                <Zap className="w-4.5 h-4.5 text-[#E5C887]" />
                <div>
                  <h4 className="text-sm font-black">
                    {t('قوالب الردود السريعة للأسئلة الشائعة', 'Quick Reply Templates Manager')}
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    {t(
                      'احفظ نصوصاً جاهزة وأرسلها بضغطة واحدة للعملاء مع تخصيص الاسم ورقم الطلب تلقائياً.',
                      'Save reusable answers and send them in one click with auto-filled client variables.'
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplatesModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {tplFeedback && (
                <div
                  className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                    tplFeedback.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {tplFeedback.text}
                </div>
              )}

              {/* Create / Edit Template Form */}
              <form
                onSubmit={(e) => void handleSaveTemplate(e)}
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-[#0F2438] flex items-center gap-1.5">
                    {editingTemplateId ? (
                      <Edit3 className="w-3.5 h-3.5 text-[#0284C7]" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>
                      {editingTemplateId
                        ? t('تعديل قالب محفوظ', 'Edit Saved Template')
                        : t('إضافة قالب رد سريع جديد', 'Add New Quick Reply Template')}
                    </span>
                  </span>
                  {editingTemplateId && (
                    <button
                      type="button"
                      onClick={handleStartNewTemplate}
                      className="text-[11px] font-bold text-slate-600 hover:text-red-600 cursor-pointer"
                    >
                      {t('إلغاء التعديل', 'Cancel Edit')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={tplTitleDraft}
                    onChange={(e) => setTplTitleDraft(e.target.value)}
                    placeholder={t('عنوان مختصر للقالب (مثال: طلب جواز أوضح)', 'Short template title...')}
                    className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
                  />
                  <select
                    value={tplCategoryDraft}
                    onChange={(e) => setTplCategoryDraft(e.target.value as QuickReplyCategory)}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#0F2438]"
                  >
                    {quickReplyCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {lang === 'en' ? c.labelEn : c.labelAr}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  rows={3}
                  required
                  value={tplTextDraft}
                  onChange={(e) => setTplTextDraft(e.target.value)}
                  placeholder={t(
                    'اكتب نص الرد الجاهز هنا... يمكنك استخدام {clientName} لاسم العميل أو {orderCode} لرقم الطلب',
                    'Type template text here... You can insert {clientName} or {orderCode}'
                  )}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-[#0F2438]"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    <span className="text-slate-500 font-bold">
                      {t('متغيرات ذكية:', 'Smart variables:')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTplTextDraft((prev) => `${prev} {clientName}`.trimStart())}
                      className="px-2 py-0.5 rounded-lg bg-white border border-slate-300 hover:border-[#0F2438] text-[#0F2438] font-bold cursor-pointer"
                    >
                      + {'{clientName}'} ({t('اسم العميل', 'Client Name')})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTplTextDraft((prev) => `${prev} {orderCode}`.trimStart())}
                      className="px-2 py-0.5 rounded-lg bg-white border border-slate-300 hover:border-[#0F2438] text-[#0F2438] font-bold cursor-pointer"
                    >
                      + {'{orderCode}'} ({t('رقم الطلب', 'Order Code')})
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingTemplate || !tplTextDraft.trim()}
                    className="px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingTemplate ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BookmarkCheck className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {editingTemplateId
                        ? t('حفظ التعديلات', 'Save Changes')
                        : t('حفظ القالب', 'Save Template')}
                    </span>
                  </button>
                </div>
              </form>

              {/* Saved Templates List */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="text"
                    value={tplSearch}
                    onChange={(e) => setTplSearch(e.target.value)}
                    placeholder={t('ابحث داخل القوالب المحفوظة...', 'Search saved templates...')}
                    className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
                  />
                  <button
                    type="button"
                    disabled={isSavingTemplate}
                    onClick={() => void handleResetTemplates()}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{t('استعادة الافتراضية', 'Restore Defaults')}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {filteredModalTemplates.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                      {t('لا توجد قوالب مطابقة.', 'No matching templates.')}
                    </div>
                  ) : (
                    filteredModalTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="p-3 rounded-xl border border-slate-200 bg-white hover:border-[#C6A052]/60 transition space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-black text-[#0F2438] truncate">
                              {tpl.title}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                              {getCategoryLabel(tpl.category)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isSending}
                              onClick={() => handleUseQuickReplyTemplate(tpl, 'instant')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-black cursor-pointer disabled:opacity-50"
                            >
                              {t('⚡ إرسال فوري', '⚡ Send Now')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUseQuickReplyTemplate(tpl, 'insert')}
                              className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-[10.5px] font-black cursor-pointer"
                            >
                              {t('✏️ إدراج', '✏️ Insert')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEditTemplate(tpl)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] cursor-pointer"
                              title={t('تعديل', 'Edit')}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isSavingTemplate}
                              onClick={() => void handleDeleteTemplate(tpl.id)}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer disabled:opacity-50"
                              title={t('حذف', 'Delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {tpl.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  AccountType,
  ChatMessage,
  ChatSenderRole,
  ChatThreadSummary,
} from '../types/travel';
import {
  ADMIN_CHAT_QUICK_REPLIES,
  clearAdminChatHistoryCloud,
  markChatThreadReadCloud,
  permanentlyDeleteChatHistoryCloud,
  playChatNotificationChime,
  sendChatMessageCloud,
  subscribeChatMessages,
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
  isOnline?: boolean;
  lastSeenAt?: string;
  senderRole: ChatSenderRole;
  senderName: string;
  clientName?: string;
  companyName?: string;
  onInspectImage?: (url: string, title: string) => void;
  compactHeight?: boolean;
}

export const DirectChatPanel: React.FC<DirectChatPanelProps> = ({
  phone,
  recipientTitle,
  recipientSubtitle,
  avatarUrl,
  accountType = 'individual',
  isOnline = false,
  lastSeenAt,
  senderRole,
  senderName,
  clientName,
  companyName,
  onInspectImage,
  compactHeight = false,
}) => {
  const { lang, t } = useLanguage();
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSeenMsgIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!phone) return;
    const unsubThread = onSnapshot(doc(db, 'chats', phone), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ChatThreadSummary;
        setAdminClearedAt(data.adminClearedAt || null);
      } else {
        setAdminClearedAt(null);
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
    const res = await clearAdminChatHistoryCloud(phone);
    setClearingAction(false);
    setShowClearModal(false);
    if (res.ok) {
      setAdminClearedAt(new Date().toISOString());
      setClearFeedback({
        ok: true,
        text: t(
          'تم مسح وإخفاء الرسائل السابقة من لوحة الإدارة فقط (تظل ظاهرة للعميل).',
          'Chat history hidden from admin view only (still visible to client).'
        ),
      });
    } else {
      setClearFeedback({
        ok: false,
        text: res.error || t('تعذر مسح المحادثة.', 'Failed to clear chat.'),
      });
    }
  };

  const handlePermanentDeleteBothSides = async () => {
    if (clearingAction) return;
    setClearingAction(true);
    setClearFeedback(null);
    const res = await permanentlyDeleteChatHistoryCloud(phone);
    setClearingAction(false);
    setShowClearModal(false);
    if (res.ok) {
      setMessages([]);
      setAdminClearedAt(null);
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

      {/* Admin Quick-Reply Buttons directly above composer */}
      {senderRole === 'admin' && (
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="inline-flex items-center gap-1 text-[10.5px] font-black text-[#0F2438] shrink-0 pe-1">
            <Zap className="w-3.5 h-3.5 text-[#C6A052]" />
            <span>{t('ردود سريعة:', 'Quick Replies:')}</span>
          </span>
          {ADMIN_CHAT_QUICK_REPLIES.map((tpl) => (
            <button
              key={tpl}
              type="button"
              disabled={isSending}
              onClick={() => void handleSend(tpl, 'quick_reply')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-[#0F2438] hover:text-[#E5C887] text-[#0F2438] border border-slate-300 text-[11px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {tpl}
            </button>
          ))}
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
    </div>
  );
};

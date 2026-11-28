import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountType,
  ChatAttachment,
  ChatMessage,
  ChatQuickReplyTemplate,
  ChatSenderRole,
  ChatThreadSummary,
  QuickReplyCategory,
} from '../types/travel';
import { uploadChatAttachmentToDrive } from './firebaseStorageHelper';
import { dispatchRemotePushNotification } from './fcmPushService';

function cleanDigits(rawPhone: string): string {
  return String(rawPhone || '').replace(/\D/g, '');
}

let audioCtxRef: AudioContext | null = null;
let lastChimeMs = 0;
let audioUnlockListenersAttached = false;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioCtxRef) {
    audioCtxRef = new AudioContextCtor();
  }
  return audioCtxRef;
}

export function unlockNotificationAudio(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

if (typeof window !== 'undefined' && !audioUnlockListenersAttached) {
  audioUnlockListenersAttached = true;
  const handleFirstGesture = () => {
    unlockNotificationAudio();
  };
  window.addEventListener('pointerdown', handleFirstGesture, { passive: true });
  window.addEventListener('keydown', handleFirstGesture, { passive: true });
  window.addEventListener('click', handleFirstGesture, { passive: true });
}

function scheduleChimeTones(ctx: AudioContext): void {
  const startTime = ctx.currentTime + 0.01;
  const playTone = (freq: number, offset: number, dur: number, peakGain: number) => {
    const osc = ctx.createOscillator();
    const harmOsc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime + offset);
    harmOsc.type = 'sine';
    harmOsc.frequency.setValueAtTime(freq * 1.5, startTime + offset);

    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0.25, startTime + offset);

    gain.gain.setValueAtTime(0.0001, startTime + offset);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + dur);

    osc.connect(gain);
    harmOsc.connect(harmGain);
    harmGain.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime + offset);
    harmOsc.start(startTime + offset);
    osc.stop(startTime + offset + dur + 0.03);
    harmOsc.stop(startTime + offset + dur + 0.03);
  };

  playTone(880, 0, 0.18, 0.22);
  playTone(1174.66, 0.13, 0.2, 0.22);
  playTone(1567.98, 0.26, 0.3, 0.24);
}

/**
 * Plays a clear multi-tone Web Audio notification ring for incoming alerts or manual sound testing.
 * Supports force=true to bypass debounce during explicit user test clicks.
 */
export function playChatNotificationChime(force = false): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (!force && now - lastChimeMs < 900) return;
  lastChimeMs = now;

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          scheduleChimeTones(ctx);
        })
        .catch(() => {});
      return;
    }
    scheduleChimeTones(ctx);
  } catch {
    // Ignore audio context block if user hasn't interacted yet
  }
}

export function subscribeChatThread(
  rawPhone: string | null | undefined,
  onUpdate: (thread: ChatThreadSummary | null) => void
): () => void {
  const phone = cleanDigits(rawPhone || '');
  if (!/^[0-9]{8,20}$/.test(phone)) {
    onUpdate(null);
    return () => {};
  }

  const path = `chats/${phone}`;
  return onSnapshot(
    doc(db, 'chats', phone),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(snap.data() as ChatThreadSummary);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.GET, path);
      }
      console.warn('Chat thread subscription warning:', msg);
    }
  );
}

export function subscribeAllChatThreads(
  onUpdate: (threads: Record<string, ChatThreadSummary>) => void
): () => void {
  const path = 'chats';
  const q = query(
    collection(db, 'chats'),
    where('lastSenderRole', 'in', ['admin', 'client'])
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, ChatThreadSummary> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as ChatThreadSummary;
        const phoneId = cleanDigits(data.phoneId || docSnap.id);
        if (phoneId) {
          map[phoneId] = { ...data, phoneId };
        }
      });
      onUpdate(map);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.LIST, path);
      }
      console.warn('All chat threads listener warning:', msg);
    }
  );
}

export function subscribeChatMessages(
  rawPhone: string | null | undefined,
  onUpdate: (messages: ChatMessage[]) => void
): () => void {
  const phone = cleanDigits(rawPhone || '');
  if (!/^[0-9]{8,20}$/.test(phone)) {
    onUpdate([]);
    return () => {};
  }

  const path = `chats/${phone}/messages`;
  const q = query(
    collection(db, 'chats', phone, 'messages'),
    where('phoneId', '==', phone)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as ChatMessage;
        items.push({ ...data, id: data.id || docSnap.id, phoneId: phone });
      });
      items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      onUpdate(items);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.LIST, path);
      }
      console.warn('Chat messages listener warning:', msg);
    }
  );
}

export async function sendChatMessageCloud(params: {
  phone: string;
  senderRole: ChatSenderRole;
  senderName: string;
  text?: string;
  files?: File[];
  messageType?: ChatMessage['messageType'];
  accountType?: AccountType;
  clientName?: string;
  companyName?: string;
}): Promise<{ ok: boolean; message?: ChatMessage; error?: string }> {
  const phone = cleanDigits(params.phone);
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, error: 'رقم الهاتف غير صالح لإرسال الرسالة.' };
  }

  const cleanText = String(params.text || '').trim().slice(0, 4000);
  const files = Array.isArray(params.files) ? params.files.slice(0, 10) : [];

  if (!cleanText && files.length === 0) {
    return { ok: false, error: 'يرجى كتابة رسالة أو إرفاق ملف قبل الإرسال.' };
  }

  // Upload attachments (with automatic client-side image compression) to Google Drive Web App
  const uploadedAttachments: ChatAttachment[] = [];
  if (files.length > 0) {
    const drivePurpose = params.senderRole === 'admin' ? 'admin_deliverables' : 'client_docs';
    for (const file of files) {
      const uploaded = await uploadChatAttachmentToDrive(phone, file, drivePurpose);
      uploadedAttachments.push({
        id: uploaded.id,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        downloadUrl: uploaded.downloadUrl,
        viewUrl: uploaded.viewUrl,
        storagePath: uploaded.storagePath,
        sizeBytes: uploaded.sizeBytes,
      });
    }
  }

  const nowIso = new Date().toISOString();
  const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const resolvedType: ChatMessage['messageType'] =
    params.messageType || (uploadedAttachments.length > 0 ? 'files' : 'text');

  const messagePayload: ChatMessage = {
    id: msgId,
    phoneId: phone,
    senderRole: params.senderRole,
    senderName: String(params.senderName || (params.senderRole === 'admin' ? 'إدارة مسارك' : 'عميل'))
      .trim()
      .slice(0, 160),
    text: cleanText,
    attachments: uploadedAttachments,
    messageType: resolvedType,
    readByAdmin: params.senderRole === 'admin',
    readByClient: params.senderRole === 'client',
    createdAt: nowIso,
  };

  // Read existing thread counters cleanly
  let prevUnreadAdmin = 0;
  let prevUnreadClient = 0;
  let prevAccountType = params.accountType;
  let prevClientName = params.clientName;
  let prevCompanyName = params.companyName;
  let prevAdminClearedAt: string | undefined;

  try {
    const existingSnap = await getDoc(doc(db, 'chats', phone));
    if (existingSnap.exists()) {
      const prev = existingSnap.data() as ChatThreadSummary;
      prevUnreadAdmin = typeof prev.unreadAdminCount === 'number' ? prev.unreadAdminCount : 0;
      prevUnreadClient = typeof prev.unreadClientCount === 'number' ? prev.unreadClientCount : 0;
      prevAccountType = params.accountType || prev.accountType;
      prevClientName = params.clientName || prev.clientName;
      prevCompanyName = params.companyName || prev.companyName;
      prevAdminClearedAt = prev.adminClearedAt;
    }
  } catch {
    // Proceed with defaults
  }

  const summaryText =
    cleanText ||
    (uploadedAttachments.length === 1
      ? `📎 ${uploadedAttachments[0].fileName}`
      : `📎 ${uploadedAttachments.length} ملفات مرفقة`);

  const threadPayload: ChatThreadSummary = {
    phoneId: phone,
    ...(prevAccountType ? { accountType: prevAccountType } : {}),
    ...(prevClientName ? { clientName: String(prevClientName).trim().slice(0, 160) } : {}),
    ...(prevCompanyName ? { companyName: String(prevCompanyName).trim().slice(0, 160) } : {}),
    lastMessageText: summaryText.slice(0, 500),
    lastMessageAt: nowIso,
    lastSenderRole: params.senderRole,
    unreadAdminCount:
      params.senderRole === 'client' ? Math.min(9999, prevUnreadAdmin + 1) : 0,
    unreadClientCount:
      params.senderRole === 'admin' ? Math.min(9999, prevUnreadClient + 1) : 0,
    updatedAt: nowIso,
    ...(prevAdminClearedAt ? { adminClearedAt: prevAdminClearedAt } : {}),
  };

  try {
    await setDoc(doc(db, 'chats', phone), threadPayload);
    await setDoc(doc(db, 'chats', phone, 'messages', msgId), messagePayload);

    if (params.senderRole === 'client') {
      const senderLabel = prevCompanyName || prevClientName || params.senderName || phone;
      void dispatchRemotePushNotification({
        targetRole: 'admin',
        title: `رسالة جديدة من ${senderLabel}`,
        body: summaryText,
        data: { role: 'admin', action: 'live_chat', phone },
      });
    } else {
      void dispatchRemotePushNotification({
        targetRole: 'client',
        targetPhone: phone,
        title: 'رسالة جديدة من إدارة مسارك',
        body: summaryText,
        data: { role: 'client', action: 'chat', phone },
      });
    }

    return { ok: true, message: messagePayload };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${phone}/messages/${msgId}`);
    }
    return { ok: false, error: 'تعذر إرسال الرسالة حالياً. يرجى التحقق من الاتصال بالإنترنت.' };
  }
}

export async function markChatThreadReadCloud(
  rawPhone: string,
  readerRole: ChatSenderRole
): Promise<void> {
  const phone = cleanDigits(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) return;

  try {
    const threadRef = doc(db, 'chats', phone);
    const snap = await getDoc(threadRef);
    if (snap.exists()) {
      const current = snap.data() as ChatThreadSummary;
      const needsThreadReset =
        readerRole === 'admin'
          ? (current.unreadAdminCount || 0) > 0
          : (current.unreadClientCount || 0) > 0;

      if (needsThreadReset) {
        await updateDoc(threadRef, {
          ...(readerRole === 'admin' ? { unreadAdminCount: 0 } : { unreadClientCount: 0 }),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const q = query(
      collection(db, 'chats', phone, 'messages'),
      where('phoneId', '==', phone)
    );
    const msgSnaps = await getDocs(q);
    const updates: Promise<void>[] = [];
    msgSnaps.forEach((docSnap) => {
      const data = docSnap.data() as ChatMessage;
      if (readerRole === 'admin' && !data.readByAdmin) {
        updates.push(updateDoc(docSnap.ref, { readByAdmin: true }));
      } else if (readerRole === 'client' && !data.readByClient) {
        updates.push(updateDoc(docSnap.ref, { readByClient: true }));
      }
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (err) {
    console.warn('Mark chat read skipped:', err);
  }
}

export const ADMIN_CHAT_QUICK_REPLIES = [
  'تم استلام أوراقك بنجاح',
  'يرجى إرسال صورة جواز أوضح',
  'تم إنجاز طلبك ومرفق المستند',
  'تم حجز الموعد بنجاح وإرفاق التفاصيل',
] as const;

export const DEFAULT_CHAT_QUICK_REPLY_TEMPLATES: ChatQuickReplyTemplate[] = [
  {
    id: 'qr-welcome',
    title: 'ترحيب واستلام الملف',
    text: 'مرحباً {clientName}، أهلاً بكم في مسارك للإنجاز السياحي. تم استلام رسالتكم وجاري المتابعة الفورية لملفكم.',
    category: 'general',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'qr-stage-received',
    title: 'مرحلة 1: تم التقديم واستلام الطلب',
    text: 'السلام عليكم أ/ {اسم_العميل} 🌸\nتم استلام وتسجيل طلبكم رقم ({رقم_الطلب}) الخاص بخدمة ({نوع_الخدمة}) بنجاح لدى مسارك للإنجاز السياحي.\n• الحالة الحالية: تم استلام الطلب والبدء في الإجراءات ✓\nجاري مراجعة الأوراق والبيانات لدى المختصين.',
    category: 'order_stages',
    orderStatusTrigger: 'تم استلام الطلب',
    createdAt: '2026-01-01T00:00:30.000Z',
  },
  {
    id: 'qr-docs-received',
    title: 'تم استلام الأوراق بنجاح',
    text: 'تم استلام أوراقك ومستنداتك بنجاح ✓ وجاري مراجعتها والبدء في إجراءات التنفيذ.',
    category: 'documents',
    createdAt: '2026-01-01T00:01:00.000Z',
  },
  {
    id: 'qr-stage-under-review',
    title: 'مرحلة 2: قيد المراجعة والتنفيذ',
    text: 'أهلاً بك أ/ {اسم_العميل} 🌸\nيود فريق مسارك للإنجاز السياحي إبلاغكم بأن طلبكم رقم ({رقم_الطلب}) الخاص بخدمة ({نوع_الخدمة}) هو الآن: (قيد المراجعة والتنفيذ) لدى الجهات المختصة.\nملفكم قيد المتابعة الحثيثة وسنوافيكم فور صدور أي مستجدات بإذن الله.',
    category: 'order_stages',
    orderStatusTrigger: 'قيد المراجعة والتنفيذ',
    createdAt: '2026-01-01T00:01:30.000Z',
  },
  {
    id: 'qr-clearer-passport',
    title: 'طلب صورة جواز أوضح',
    text: 'يرجى إرسال صورة واضحة ومكتملة لصفحة البيانات في جواز السفر بدون قص أو إضاءة عاكسة لاستكمال الطلب.',
    category: 'documents',
    createdAt: '2026-01-01T00:02:00.000Z',
  },
  {
    id: 'qr-stage-booked-issued',
    title: 'مرحلة 3: تم الحجز / الإصدار',
    text: 'بشرى سارة أ/ {اسم_العميل} 🌸\nتم إنجاز مرحلة (تم الحجز / الإصدار) لطلبكم رقم ({رقم_الطلب}) بنجاح.\nيمكنكم الاطلاع على تفاصيل الحجز والمستندات عبر محفظتكم في مسارك.',
    category: 'order_stages',
    orderStatusTrigger: 'تم الحجز / الإصدار',
    createdAt: '2026-01-01T00:02:30.000Z',
  },
  {
    id: 'qr-tasheer-booked',
    title: 'تم حجز موعد تساهيل',
    text: 'تم حجز موعد تساهيل (VFS) الخاص بكم بنجاح، وتم إرفاق تفاصيل الموعد والباركود داخل حسابكم.',
    category: 'appointments',
    createdAt: '2026-01-01T00:03:00.000Z',
  },
  {
    id: 'qr-payment-receipt',
    title: 'طلب إيصال التحويل',
    text: 'يرجى إرفاق صورة إيصال التحويل أو السداد هنا ليتم تأكيد الطلب وتفعيل المتابعة الفورية.',
    category: 'payment',
    createdAt: '2026-01-01T00:04:00.000Z',
  },
  {
    id: 'qr-stage-completed',
    title: 'مرحلة 4: تأشيرة جاهزة / تم التنفيذ',
    text: 'تهانينا الحارة أ/ {اسم_العميل} 🎉\nتأشيرتكم / طلبكم رقم ({رقم_الطلب}) الخاص بخدمة ({نوع_الخدمة}) جاهز وتم تنفيذه بنجاح تام!\nتم إيداع المستندات ووثائق الإنجاز في محفظة حسابكم بمسارك.\nنتمنى لكم رحلة مباركة وموفقة بإذن الله.',
    category: 'order_stages',
    orderStatusTrigger: 'تم تنفيذ الطلب',
    createdAt: '2026-01-01T00:04:30.000Z',
  },
  {
    id: 'qr-completed',
    title: 'تم إنجاز الطلب وإرفاق المستند',
    text: 'تم إنجاز طلبكم بنجاح وإرفاق المستند النهائي في محفظة المستندات بحسابكم. رحلة موفقة بإذن الله.',
    category: 'visas',
    createdAt: '2026-01-01T00:05:00.000Z',
  },
];

const QUICK_REPLIES_STORAGE_KEY = 'masarik_chat_quick_replies_v1';
const QUICK_REPLIES_UPDATED_EVENT = 'masarik-quick-replies-updated';
const QUICK_REPLIES_DOC_PATH = 'site_config/quick_replies';

const VALID_QR_CATEGORIES = new Set<QuickReplyCategory>([
  'general',
  'documents',
  'visas',
  'appointments',
  'payment',
  'order_stages',
]);

function sanitizeQuickReplyTemplates(list: unknown): ChatQuickReplyTemplate[] {
  if (!Array.isArray(list)) return DEFAULT_CHAT_QUICK_REPLY_TEMPLATES;
  const cleaned = list
    .filter((item): item is Partial<ChatQuickReplyTemplate> => Boolean(item && typeof item === 'object'))
    .slice(0, 60)
    .map((item, idx) => {
      const title = String(item.title || '').trim().slice(0, 80);
      const text = String(item.text || '').trim().slice(0, 2000);
      const cat: QuickReplyCategory = VALID_QR_CATEGORIES.has(item.category as QuickReplyCategory)
        ? (item.category as QuickReplyCategory)
        : 'general';
      const orderTrigger = item.orderStatusTrigger ? String(item.orderStatusTrigger).slice(0, 60) : undefined;
      return {
        id:
          String(item.id || `qr-${Date.now()}-${idx}`)
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .slice(0, 80) || `qr-${idx}`,
        title: title || text.slice(0, 36) || `قالب ${idx + 1}`,
        text,
        category: cat,
        ...(orderTrigger ? { orderStatusTrigger: orderTrigger as ChatQuickReplyTemplate['orderStatusTrigger'] } : {}),
        createdAt: String(item.createdAt || new Date().toISOString()).slice(0, 64),
        ...(item.updatedAt ? { updatedAt: String(item.updatedAt).slice(0, 64) } : {}),
        ...(item.createdBy ? { createdBy: String(item.createdBy).trim().slice(0, 120) } : {}),
      };
    })
    .filter((item) => item.text.length > 0);
  return cleaned;
}

function emitQuickRepliesUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUICK_REPLIES_UPDATED_EVENT));
  }
}

function writeQuickRepliesLocalOnly(templates: ChatQuickReplyTemplate[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUICK_REPLIES_STORAGE_KEY, JSON.stringify(templates));
    emitQuickRepliesUpdate();
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function getQuickReplyTemplates(): ChatQuickReplyTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_CHAT_QUICK_REPLY_TEMPLATES;
  try {
    const raw = window.localStorage.getItem(QUICK_REPLIES_STORAGE_KEY);
    if (!raw) return DEFAULT_CHAT_QUICK_REPLY_TEMPLATES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CHAT_QUICK_REPLY_TEMPLATES;
    return sanitizeQuickReplyTemplates(parsed);
  } catch {
    return DEFAULT_CHAT_QUICK_REPLY_TEMPLATES;
  }
}

export function subscribeQuickReplyTemplatesCloud(): () => void {
  const ref = doc(db, 'site_config', 'quick_replies');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { templates?: unknown };
      if (Array.isArray(data?.templates)) {
        const sanitized = sanitizeQuickReplyTemplates(data.templates);
        writeQuickRepliesLocalOnly(sanitized);
      }
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      // Graceful non-blocking fallback to local storage if Firestore rules haven't been refreshed yet
      if (!msg.toLowerCase().includes('permission')) {
        console.warn('Quick replies subscription warning:', msg);
      }
    }
  );
}

export async function saveQuickReplyTemplatesCloud(
  templates: ChatQuickReplyTemplate[],
  updatedBy?: string
): Promise<{ ok: boolean; cloudSynced: boolean; templates: ChatQuickReplyTemplate[]; error?: string }> {
  const sanitized = sanitizeQuickReplyTemplates(templates);
  writeQuickRepliesLocalOnly(sanitized);

  try {
    await setDoc(doc(db, 'site_config', 'quick_replies'), {
      templates: sanitized,
      updatedBy: String(updatedBy || 'المدير العام').trim().slice(0, 120),
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, cloudSynced: true, templates: sanitized };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`Quick replies cloud sync deferred (${QUICK_REPLIES_DOC_PATH}):`, msg);
    return { ok: true, cloudSynced: false, templates: sanitized, error: msg };
  }
}

export async function upsertQuickReplyTemplateCloud(
  input: {
    id?: string;
    title: string;
    text: string;
    category: QuickReplyCategory;
    createdBy?: string;
  }
): Promise<{ ok: boolean; cloudSynced: boolean; templates: ChatQuickReplyTemplate[]; saved: ChatQuickReplyTemplate }> {
  const current = getQuickReplyTemplates();
  const nowIso = new Date().toISOString();
  const existing = input.id ? current.find((t) => t.id === input.id) : undefined;
  const saved: ChatQuickReplyTemplate = {
    id: existing?.id || `qr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim().slice(0, 80) || input.text.trim().slice(0, 36),
    text: input.text.trim().slice(0, 2000),
    category: VALID_QR_CATEGORIES.has(input.category) ? input.category : 'general',
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    ...(input.createdBy || existing?.createdBy
      ? { createdBy: String(input.createdBy || existing?.createdBy).trim().slice(0, 120) }
      : {}),
  };

  const next = existing
    ? current.map((item) => (item.id === existing.id ? saved : item))
    : [saved, ...current];

  const res = await saveQuickReplyTemplatesCloud(next, input.createdBy);
  return { ...res, saved };
}

export async function deleteQuickReplyTemplateCloud(
  templateId: string,
  actorName?: string
): Promise<{ ok: boolean; cloudSynced: boolean; templates: ChatQuickReplyTemplate[] }> {
  const current = getQuickReplyTemplates();
  const next = current.filter((t) => t.id !== templateId);
  const res = await saveQuickReplyTemplatesCloud(next, actorName);
  return res;
}

export async function resetQuickReplyTemplatesToDefaultsCloud(
  actorName?: string
): Promise<{ ok: boolean; cloudSynced: boolean; templates: ChatQuickReplyTemplate[] }> {
  return saveQuickReplyTemplatesCloud(DEFAULT_CHAT_QUICK_REPLY_TEMPLATES, actorName);
}

export function resolveQuickReplyTextPlaceholders(
  rawText: string,
  context: {
    clientName?: string;
    orderCode?: string;
    serviceTitle?: string;
    stageLabel?: string;
    portalUrl?: string;
    phone?: string;
  }
): string {
  const name = String(context.clientName || '').trim() || 'عميلنا العزيز';
  const orderCode = String(context.orderCode || '').trim() || 'MSK';
  const service = String(context.serviceTitle || '').trim() || 'موعد خدمة سياحية';
  const stage = String(context.stageLabel || '').trim() || 'قيد المراجعة';
  const portalUrl = String(context.portalUrl || '').trim() || 'https://masarik-tourism.github.io/';
  const phone = String(context.phone || '').trim();

  return String(rawText || '')
    .replace(/\{clientName\}|\{اسم_العميل\}/gi, name)
    .replace(/\{orderCode\}|\{رقم_الطلب\}/gi, orderCode)
    .replace(/\{serviceTitle\}|\{نوع_الخدمة\}/gi, service)
    .replace(/\{stageLabel\}|\{المرحلة_الحالية\}/gi, stage)
    .replace(/\{portalUrl\}|\{رابط_المنصة\}/gi, portalUrl)
    .replace(/\{phone\}|\{الهاتف\}/gi, phone);
}

export function useQuickReplyTemplates(): ChatQuickReplyTemplate[] {
  const [templates, setTemplates] = useState<ChatQuickReplyTemplate[]>(() =>
    getQuickReplyTemplates()
  );

  useEffect(() => {
    const syncLocal = () => setTemplates(getQuickReplyTemplates());
    window.addEventListener(QUICK_REPLIES_UPDATED_EVENT, syncLocal);
    window.addEventListener('storage', syncLocal);
    const unsubCloud = subscribeQuickReplyTemplatesCloud();
    return () => {
      window.removeEventListener(QUICK_REPLIES_UPDATED_EVENT, syncLocal);
      window.removeEventListener('storage', syncLocal);
      unsubCloud();
    };
  }, []);

  return templates;
}

const ADMIN_CLEARED_STORAGE_PREFIX = 'masarik_admin_chat_cleared_';

export function getLocalAdminClearedAt(rawPhone: string): string | null {
  if (typeof window === 'undefined') return null;
  const phone = cleanDigits(rawPhone);
  if (!phone) return null;
  try {
    return window.localStorage.getItem(`${ADMIN_CLEARED_STORAGE_PREFIX}${phone}`);
  } catch {
    return null;
  }
}

export function setLocalAdminClearedAt(rawPhone: string, iso: string | null): void {
  if (typeof window === 'undefined') return;
  const phone = cleanDigits(rawPhone);
  if (!phone) return;
  try {
    const key = `${ADMIN_CLEARED_STORAGE_PREFIX}${phone}`;
    if (iso) {
      window.localStorage.setItem(key, iso);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function clearLocalChatCache(rawPhone: string): void {
  if (typeof window === 'undefined') return;
  const phone = cleanDigits(rawPhone);
  if (!phone) return;
  try {
    window.localStorage.removeItem(`${ADMIN_CLEARED_STORAGE_PREFIX}${phone}`);
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.includes(`chat_${phone}`) || k.includes(`messages_${phone}`))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Ignore storage errors
  }
}

export async function clearAdminChatHistoryCloud(
  rawPhone: string
): Promise<{ ok: boolean; clearedAt: string; cloudSynced: boolean; error?: string }> {
  const phone = cleanDigits(rawPhone);
  const nowIso = new Date().toISOString();
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, clearedAt: nowIso, cloudSynced: false, error: 'رقم الهاتف غير صالح' };
  }

  // Always update local admin clear timestamp immediately so UI responds even if no cloud doc exists
  setLocalAdminClearedAt(phone, nowIso);

  try {
    const threadRef = doc(db, 'chats', phone);
    const snap = await getDoc(threadRef);
    if (!snap.exists()) {
      return { ok: true, clearedAt: nowIso, cloudSynced: true };
    }
    await updateDoc(threadRef, {
      adminClearedAt: nowIso,
      unreadAdminCount: 0,
      updatedAt: nowIso,
    });
    return { ok: true, clearedAt: nowIso, cloudSynced: true };
  } catch (err) {
    console.warn('clearAdminChatHistoryCloud warning (local hide preserved):', err);
    return {
      ok: true,
      clearedAt: nowIso,
      cloudSynced: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function permanentlyDeleteChatHistoryCloud(
  rawPhone: string,
  knownMessageIds: string[] = []
): Promise<{ ok: boolean; deletedCount: number; error?: string }> {
  const phone = cleanDigits(rawPhone);
  if (!/^[0-9]{8,20}$/.test(phone)) {
    return { ok: false, deletedCount: 0, error: 'رقم الهاتف غير صالح' };
  }

  // Always clean any local cache immediately
  clearLocalChatCache(phone);

  let deletedCount = 0;
  try {
    const messagesQuery = query(
      collection(db, 'chats', phone, 'messages'),
      where('phoneId', '==', phone)
    );
    const msgSnaps = await getDocs(messagesQuery);
    const idsToDelete = new Set<string>(knownMessageIds.filter(Boolean));
    const deletes: Promise<void>[] = [];

    msgSnaps.forEach((docSnap) => {
      idsToDelete.delete(docSnap.id);
      deletes.push(
        deleteDoc(docSnap.ref).then(() => {
          deletedCount += 1;
        })
      );
    });

    idsToDelete.forEach((msgId) => {
      deletes.push(
        deleteDoc(doc(db, 'chats', phone, 'messages', msgId))
          .then(() => {
            deletedCount += 1;
          })
          .catch(() => {})
      );
    });

    if (deletes.length > 0) {
      await Promise.all(deletes);
    }

    const threadRef = doc(db, 'chats', phone);
    const threadSnap = await getDoc(threadRef);
    if (threadSnap.exists()) {
      await deleteDoc(threadRef);
    }

    return { ok: true, deletedCount };
  } catch (err) {
    console.warn('permanentlyDeleteChatHistoryCloud error:', err);
    return {
      ok: false,
      deletedCount,
      error: 'تعذر إكمال الحذف السحابي من Firestore. يرجى التحقق من قواعد الأمان أو الاتصال.',
    };
  }
}

const chatAnalysisCache = new Map<
  string,
  { lastMessageAt: string; messages: ChatMessage[] }
>();

/**
 * Fetches and caches chat messages for threads whose `lastMessageAt` changed,
 * enabling accurate calculation of client response latency in AdminDashboardWorkspace
 * without repeated Firestore reads.
 */
export async function fetchChatMessagesForResponseAnalysisCloud(
  threads: Record<string, ChatThreadSummary>
): Promise<Record<string, ChatMessage[]>> {
  const result: Record<string, ChatMessage[]> = {};
  const entries = Object.entries(threads || {})
    .filter(([phoneId]) => /^[0-9]{8,20}$/.test(cleanDigits(phoneId)))
    .sort((a, b) => Date.parse(b[1]?.lastMessageAt || '') - Date.parse(a[1]?.lastMessageAt || ''))
    .slice(0, 60);

  const staleTargets: { phone: string; lastMessageAt: string }[] = [];

  for (const [rawPhone, summary] of entries) {
    const phone = cleanDigits(rawPhone);
    const stamp = String(summary?.lastMessageAt || summary?.updatedAt || '');
    const cached = chatAnalysisCache.get(phone);
    if (cached && cached.lastMessageAt === stamp) {
      result[phone] = cached.messages;
    } else {
      if (cached) {
        result[phone] = cached.messages;
      }
      staleTargets.push({ phone, lastMessageAt: stamp });
    }
  }

  const batchSize = 6;
  for (let i = 0; i < staleTargets.length; i += batchSize) {
    const chunk = staleTargets.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async ({ phone, lastMessageAt }) => {
        try {
          const q = query(
            collection(db, 'chats', phone, 'messages'),
            where('phoneId', '==', phone)
          );
          const snap = await getDocs(q);
          const items: ChatMessage[] = [];
          snap.forEach((docSnap) => {
            const data = docSnap.data() as ChatMessage;
            items.push({ ...data, id: data.id || docSnap.id, phoneId: phone });
          });
          items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
          chatAnalysisCache.set(phone, { lastMessageAt, messages: items });
          result[phone] = items;
        } catch {
          // Keep existing cached snapshot on transient network errors
        }
      })
    );
  }

  return result;
}

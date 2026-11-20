import {
  collection,
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
  ChatSenderRole,
  ChatThreadSummary,
} from '../types/travel';
import { uploadChatAttachmentToDrive } from './firebaseStorageHelper';
import { dispatchRemotePushNotification } from './fcmPushService';

function cleanDigits(rawPhone: string): string {
  return String(rawPhone || '').replace(/\D/g, '');
}

let audioCtxRef: AudioContext | null = null;
let lastChimeMs = 0;

/**
 * Plays a gentle dual-tone Web Audio chime for newly incoming chat messages.
 * Debounced and resilient against browser autoplay restrictions.
 */
export function playChatNotificationChime(): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastChimeMs < 1500) return;
  lastChimeMs = now;

  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioCtxRef) {
      audioCtxRef = new AudioContextCtor();
    }
    if (audioCtxRef.state === 'suspended') {
      void audioCtxRef.resume();
    }

    const startTime = audioCtxRef.currentTime;
    const playTone = (freq: number, offset: number, dur: number, peakGain: number) => {
      if (!audioCtxRef) return;
      const osc = audioCtxRef.createOscillator();
      const gain = audioCtxRef.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + offset);
      gain.gain.setValueAtTime(0.0001, startTime + offset);
      gain.gain.exponentialRampToValueAtTime(peakGain, startTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + dur);
      osc.connect(gain);
      gain.connect(audioCtxRef.destination);
      osc.start(startTime + offset);
      osc.stop(startTime + offset + dur + 0.02);
    };

    playTone(880, 0, 0.14, 0.06);
    playTone(1174.66, 0.1, 0.18, 0.055);
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

  try {
    const existingSnap = await getDoc(doc(db, 'chats', phone));
    if (existingSnap.exists()) {
      const prev = existingSnap.data() as ChatThreadSummary;
      prevUnreadAdmin = typeof prev.unreadAdminCount === 'number' ? prev.unreadAdminCount : 0;
      prevUnreadClient = typeof prev.unreadClientCount === 'number' ? prev.unreadClientCount : 0;
      prevAccountType = params.accountType || prev.accountType;
      prevClientName = params.clientName || prev.clientName;
      prevCompanyName = params.companyName || prev.companyName;
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

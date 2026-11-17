import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { AdminPermission, AdminSession, SubAdminAccount } from '../types/travel';
import { OperationType, db, handleFirestoreError, sha256Hex } from '../firebase';
import {
  getAdminPin,
  getMasterAdminPinHash,
  normalizeArabicDigits,
  setSyncedMasterPinHash,
  verifyAdminPin,
} from './travelerStore';

const SUB_ADMINS_STORAGE_KEY = 'masarik_sub_admins_v1';
const ADMIN_SESSION_STORAGE_KEY = 'masarik_admin_session_v1';

export const ADMIN_AUTH_UPDATED_EVENT = 'masarik-admin-auth-updated';

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  'manage_clients',
  'activate_otp',
  'edit_content',
  'delete_records',
];

export const PERMISSION_LABELS: Record<
  AdminPermission,
  { ar: string; en: string; descAr: string; descEn: string }
> = {
  manage_clients: {
    ar: 'إدارة ملفات العملاء',
    en: 'Manage Clients',
    descAr: 'عرض بيانات العملاء وصور الجوازات وتحديث مراحل الطلب',
    descEn: 'View client folders, passport scans, & update order stages',
  },
  activate_otp: {
    ar: 'تفعيل الحسابات و OTP',
    en: 'Activate OTP & Links',
    descAr: 'توليد وإرسال أكواد التفعيل OTP وروابط واتساب للعملاء',
    descEn: 'Generate & send WhatsApp OTP codes & Magic Activation links',
  },
  edit_content: {
    ar: 'تعديل محتوى الموقع',
    en: 'Edit Site Content',
    descAr: 'التعديل المباشر لنصوص الموقع، الخدمات، الإعلانات وإضافة بنود جديدة',
    descEn: 'Inline edit site texts, services, announcement banners, & add items',
  },
  delete_records: {
    ar: 'صلاحية الحذف',
    en: 'Delete Records',
    descAr: 'حذف ملفات العملاء أو حذف بطاقات وأقسام من الموقع',
    descEn: 'Delete client records or remove site cards and blocks',
  },
};

function emitAdminAuthEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_AUTH_UPDATED_EVENT));
  }
}

export function getSubAdmins(): SubAdminAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SUB_ADMINS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SubAdminAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSubAdminsLocalOnly(list: SubAdminAccount[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SUB_ADMINS_STORAGE_KEY, JSON.stringify(list));
    emitAdminAuthEvent();
  } catch {
    // Ignore storage quota errors
  }
}

async function syncSubAdminToCloud(sub: SubAdminAccount): Promise<void> {
  const path = `admins/${sub.id}`;
  const cleanPin = normalizeArabicDigits(sub.pin).trim();
  const payload = {
    id: sub.id.slice(0, 64),
    role: 'sub_admin',
    name: String(sub.name || 'Sub-Admin').slice(0, 120),
    pinHash: sha256Hex(cleanPin),
    pin: cleanPin.slice(0, 32),
    permissions: sub.permissions.slice(0, 10),
    createdAt: String(sub.createdAt || new Date().toISOString()).slice(0, 64),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'admins', sub.id), payload);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    console.warn('Sub-admin cloud sync deferred:', msg);
  }
}

let masterSeedAttempted = false;

export function subscribeAdminsCloud(): () => void {
  const path = 'admins';
  const adminsQuery = query(
    collection(db, 'admins'),
    where('role', 'in', ['super_admin', 'sub_admin'])
  );
  return onSnapshot(
    adminsQuery,
    (snapshot) => {
      let hasMaster = false;
      const cloudSubs: SubAdminAccount[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as {
          id?: string;
          role?: string;
          name?: string;
          pinHash?: string;
          pin?: string;
          permissions?: AdminPermission[];
          createdAt?: string;
        };

        if (docSnap.id === 'master' || data.role === 'super_admin') {
          hasMaster = true;
          if (data.pinHash && /^[a-f0-9]{64}$/.test(data.pinHash)) {
            setSyncedMasterPinHash(data.pinHash);
          }
        } else if (data.role === 'sub_admin') {
          cloudSubs.push({
            id: data.id || docSnap.id,
            name: data.name || 'مدير مساعد',
            pin: data.pin || '',
            permissions: Array.isArray(data.permissions) ? data.permissions : [],
            createdAt: data.createdAt || new Date().toISOString(),
          });
        }
      });

      if (!hasMaster && !masterSeedAttempted) {
        masterSeedAttempted = true;
        const defaultPin = getAdminPin();
        void setDoc(doc(db, 'admins', 'master'), {
          id: 'master',
          role: 'super_admin',
          name: 'المدير العام',
          pinHash: sha256Hex(defaultPin),
          permissions: [...ALL_ADMIN_PERMISSIONS],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch(() => {
          // Ignore initial seed error when offline
        });
      }

      cloudSubs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      saveSubAdminsLocalOnly(cloudSubs);

      // Keep active sub-admin session permissions synced in real time
      const active = getActiveAdminSession();
      if (active && active.role === 'sub_admin') {
        const updatedMatch = cloudSubs.find((sa) => sa.id === active.adminId);
        if (!updatedMatch) {
          saveActiveAdminSession(null);
        } else {
          const samePerms =
            updatedMatch.permissions.length === active.permissions.length &&
            updatedMatch.permissions.every((p, idx) => p === active.permissions[idx]);
          if (!samePerms || updatedMatch.name !== active.name) {
            saveActiveAdminSession({
              ...active,
              name: updatedMatch.name,
              permissions: [...updatedMatch.permissions],
            });
          }
        }
      }
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.LIST, path);
      }
      console.warn('Admins cloud listener warning:', msg);
    }
  );
}

export function createSubAdmin(
  name: string,
  pin: string,
  permissions: AdminPermission[],
  lang: 'ar' | 'en' = 'ar'
): { ok: boolean; error?: string; subAdmin?: SubAdminAccount } {
  const cleanName = name.trim();
  const cleanPin = normalizeArabicDigits(pin).trim();

  if (!cleanName) {
    return {
      ok: false,
      error: lang === 'en' ? 'Please enter the sub-admin name.' : 'يرجى إدخال اسم المدير المساعد.',
    };
  }
  if (cleanPin.length < 4) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'PIN must be at least 4 characters or digits.'
          : 'يجب أن يتكون الرمز السري من 4 أرقام أو أحرف على الأقل.',
    };
  }
  if (sha256Hex(cleanPin) === getMasterAdminPinHash()) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'This PIN matches the General Manager PIN. Please choose a different PIN.'
          : 'هذا الرمز مطابق لرمز المدير العام. يرجى اختيار رمز سري مختلف للمدير المساعد.',
    };
  }

  const existing = getSubAdmins();
  if (existing.some((sa) => normalizeArabicDigits(sa.pin).trim() === cleanPin)) {
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'Another sub-admin already uses this PIN. Choose a unique PIN.'
          : 'يوجد مدير مساعد آخر يستخدم نفس الرمز السري. يرجى اختيار رمز فريد.',
    };
  }

  const created: SubAdminAccount = {
    id: `sa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    pin: cleanPin,
    permissions: Array.from(new Set(permissions)),
    createdAt: new Date().toISOString(),
  };

  saveSubAdminsLocalOnly([created, ...existing]);
  void syncSubAdminToCloud(created);
  return { ok: true, subAdmin: created };
}

export function updateSubAdminPermissions(
  id: string,
  permissions: AdminPermission[]
): SubAdminAccount[] {
  const updated = getSubAdmins().map((sa) =>
    sa.id === id ? { ...sa, permissions: Array.from(new Set(permissions)) } : sa
  );
  saveSubAdminsLocalOnly(updated);

  const target = updated.find((sa) => sa.id === id);
  if (target) {
    void syncSubAdminToCloud(target);
  }

  // Sync active session if that sub-admin is currently logged in
  const active = getActiveAdminSession();
  if (active && active.adminId === id) {
    saveActiveAdminSession({
      ...active,
      permissions: Array.from(new Set(permissions)),
    });
  }
  return updated;
}

export function deleteSubAdmin(id: string): void {
  const next = getSubAdmins().filter((sa) => sa.id !== id);
  saveSubAdminsLocalOnly(next);

  const path = `admins/${id}`;
  void deleteDoc(doc(db, 'admins', id)).catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
    console.warn('Sub-admin cloud delete deferred:', msg);
  });
}

export function getActiveAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveAdminSession(session: AdminSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (session) {
      window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    }
    emitAdminAuthEvent();
  } catch {
    // Ignore storage errors
  }
}

export function authenticateAdminPin(
  rawPin: string,
  lang: 'ar' | 'en' = 'ar'
): { ok: boolean; error?: string; session?: AdminSession } {
  const cleanPin = normalizeArabicDigits(rawPin).trim();
  if (!cleanPin) {
    return {
      ok: false,
      error: lang === 'en' ? 'Please enter your Admin PIN.' : 'يرجى إدخال الرمز السري للإدارة.',
    };
  }

  // 1. Check General Manager PIN (against cloud-synced hash)
  if (verifyAdminPin(cleanPin)) {
    const session: AdminSession = {
      role: 'super_admin',
      adminId: 'super_admin',
      name: lang === 'en' ? 'General Manager' : 'المدير العام',
      permissions: [...ALL_ADMIN_PERMISSIONS],
      loggedInAt: new Date().toISOString(),
      mode: 'dashboard',
    };
    saveActiveAdminSession(session);
    return { ok: true, session };
  }

  // 2. Check Sub-Admin PINs (synced from Firestore)
  const subAdmins = getSubAdmins();
  const matchedSub = subAdmins.find((sa) => normalizeArabicDigits(sa.pin).trim() === cleanPin);
  if (matchedSub) {
    const defaultMode: AdminSession['mode'] =
      !matchedSub.permissions.includes('manage_clients') &&
      !matchedSub.permissions.includes('activate_otp') &&
      matchedSub.permissions.includes('edit_content')
        ? 'live_editor'
        : 'dashboard';

    const session: AdminSession = {
      role: 'sub_admin',
      adminId: matchedSub.id,
      name: matchedSub.name,
      permissions: [...matchedSub.permissions],
      loggedInAt: new Date().toISOString(),
      mode: defaultMode,
    };
    saveActiveAdminSession(session);
    return { ok: true, session };
  }

  return {
    ok: false,
    error: lang === 'en' ? 'Incorrect Admin PIN.' : 'الرمز السري غير صحيح.',
  };
}

export function updateAdminSessionMode(mode: AdminSession['mode']): void {
  const current = getActiveAdminSession();
  if (!current) return;
  saveActiveAdminSession({ ...current, mode });
}

export function logoutAdminSession(): void {
  saveActiveAdminSession(null);
}

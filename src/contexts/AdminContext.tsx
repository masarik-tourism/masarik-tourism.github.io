import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AdminPermission, AdminSession } from '../types/travel';
import {
  ADMIN_AUTH_UPDATED_EVENT,
  authenticateAdminPin,
  getActiveAdminSession,
  logoutAdminSession,
  updateAdminSessionMode,
} from '../utils/adminAuthStore';

import {
  beginCmsDraftSession,
  discardCmsDraftSession,
} from '../utils/cmsStore';

interface AdminContextValue {
  session: AdminSession | null;
  isAdminActive: boolean;
  isSuperAdmin: boolean;
  isDashboardMode: boolean;
  isLiveEditorMode: boolean;
  isEditUnlocked: boolean;
  loginModalOpen: boolean;
  openAdminLoginModal: () => void;
  closeAdminLoginModal: () => void;
  loginWithPin: (pin: string, lang: 'ar' | 'en') => { ok: boolean; error?: string };
  logoutAdmin: () => void;
  setAdminMode: (mode: AdminSession['mode']) => void;
  unlockEditMode: () => void;
  lockEditMode: () => void;
  toggleEditLock: () => void;
  hasPermission: (perm: AdminPermission) => boolean;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AdminSession | null>(() => getActiveAdminSession());
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  // Always start in Safe Follow-Up & Reception Mode (Edit Lock Active)
  const [isEditUnlocked, setIsEditUnlocked] = useState<boolean>(false);

  useEffect(() => {
    const sync = () => setSession(getActiveAdminSession());
    window.addEventListener(ADMIN_AUTH_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ADMIN_AUTH_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (session?.mode === 'live_editor' && isEditUnlocked) {
      beginCmsDraftSession();
    } else {
      discardCmsDraftSession();
    }
  }, [session?.mode, isEditUnlocked]);

  const openAdminLoginModal = useCallback(() => {
    setLoginModalOpen(true);
  }, []);

  const closeAdminLoginModal = useCallback(() => {
    setLoginModalOpen(false);
  }, []);

  const loginWithPin = useCallback((pin: string, lang: 'ar' | 'en') => {
    const res = authenticateAdminPin(pin, lang);
    if (res.ok && res.session) {
      setIsEditUnlocked(false);
      setSession(res.session);
      setLoginModalOpen(false);
    }
    return { ok: res.ok, error: res.error };
  }, []);

  const logoutAdmin = useCallback(() => {
    discardCmsDraftSession();
    setIsEditUnlocked(false);
    logoutAdminSession();
    setSession(null);
  }, []);

  const unlockEditMode = useCallback(() => {
    setIsEditUnlocked(true);
  }, []);

  const lockEditMode = useCallback(() => {
    discardCmsDraftSession();
    setIsEditUnlocked(false);
  }, []);

  const toggleEditLock = useCallback(() => {
    setIsEditUnlocked((prev) => {
      if (prev) {
        discardCmsDraftSession();
        return false;
      }
      return true;
    });
  }, []);

  const setAdminMode = useCallback(
    (mode: AdminSession['mode']) => {
      if (mode !== 'live_editor' || !isEditUnlocked) {
        discardCmsDraftSession();
      } else {
        beginCmsDraftSession();
      }
      updateAdminSessionMode(mode);
      setSession((prev) => (prev ? { ...prev, mode } : null));
    },
    [isEditUnlocked]
  );

  const hasPermission = useCallback(
    (perm: AdminPermission) => {
      if (!session) return false;
      if (session.role === 'super_admin') return true;
      return session.permissions.includes(perm);
    },
    [session]
  );

  const isAdminActive = Boolean(session);
  const isSuperAdmin = session?.role === 'super_admin';
  const isDashboardMode = Boolean(session && session.mode === 'dashboard');
  const isLiveEditorMode = Boolean(session && session.mode === 'live_editor');

  return (
    <AdminContext.Provider
      value={{
        session,
        isAdminActive,
        isSuperAdmin,
        isDashboardMode,
        isLiveEditorMode,
        isEditUnlocked,
        loginModalOpen,
        openAdminLoginModal,
        closeAdminLoginModal,
        loginWithPin,
        logoutAdmin,
        setAdminMode,
        unlockEditMode,
        lockEditMode,
        toggleEditLock,
        hasPermission,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdmin must be used inside <AdminProvider>');
  }
  return ctx;
}

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AdminPermission, AdminSession } from '../types/travel';
import {
  ADMIN_AUTH_UPDATED_EVENT,
  authenticateAdminPin,
  getActiveAdminSession,
  logoutAdminSession,
  updateAdminSessionMode,
} from '../utils/adminAuthStore';

interface AdminContextValue {
  session: AdminSession | null;
  isAdminActive: boolean;
  isSuperAdmin: boolean;
  isDashboardMode: boolean;
  isLiveEditorMode: boolean;
  loginModalOpen: boolean;
  openAdminLoginModal: () => void;
  closeAdminLoginModal: () => void;
  loginWithPin: (pin: string, lang: 'ar' | 'en') => { ok: boolean; error?: string };
  logoutAdmin: () => void;
  setAdminMode: (mode: AdminSession['mode']) => void;
  hasPermission: (perm: AdminPermission) => boolean;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AdminSession | null>(() => getActiveAdminSession());
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const sync = () => setSession(getActiveAdminSession());
    window.addEventListener(ADMIN_AUTH_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ADMIN_AUTH_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const openAdminLoginModal = useCallback(() => {
    setLoginModalOpen(true);
  }, []);

  const closeAdminLoginModal = useCallback(() => {
    setLoginModalOpen(false);
  }, []);

  const loginWithPin = useCallback((pin: string, lang: 'ar' | 'en') => {
    const res = authenticateAdminPin(pin, lang);
    if (res.ok && res.session) {
      setSession(res.session);
      setLoginModalOpen(false);
    }
    return { ok: res.ok, error: res.error };
  }, []);

  const logoutAdmin = useCallback(() => {
    logoutAdminSession();
    setSession(null);
  }, []);

  const setAdminMode = useCallback((mode: AdminSession['mode']) => {
    updateAdminSessionMode(mode);
    setSession((prev) => (prev ? { ...prev, mode } : null));
  }, []);

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
        loginModalOpen,
        openAdminLoginModal,
        closeAdminLoginModal,
        loginWithPin,
        logoutAdmin,
        setAdminMode,
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

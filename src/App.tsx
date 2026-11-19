import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { ServicesScreen } from './screens/ServicesScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { ContactScreen } from './screens/ContactScreen';
import { TravelRepository, getLocalizedTravelContent } from './data/travelData';
import {
  CUSTOMER_SERVICE_WHATSAPP_NUMBER,
  dialPhoneNumber,
  openCustomerServiceWhatsApp,
} from './utils/communication';
import { Phone, Mail, MapPin, Clock, ShieldCheck, ArrowUpRight, ShieldAlert, X, Smartphone, RefreshCw } from 'lucide-react';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SiteUpdateBanner } from './components/SiteUpdateBanner';
import { InAppVersionBanner } from './components/InAppVersionBanner';
import { CURRENT_APP_VERSION, triggerApkUpdateModal } from './hooks/useLatestApkUrl';
import {
  PendingPostAuthFlow,
  TravelerSubTab,
  TravelerWorkspaceScreen,
} from './components/TravelerWorkspaceScreen';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AdminDashboardWorkspace } from './components/AdminDashboardWorkspace';
import { LiveInlineEditorEngine } from './components/LiveInlineEditorEngine';
import {
  TRAVELERS_UPDATED_EVENT,
  TravelerProfileDraft,
  activateViaMagicLinkCloud,
  getActivePhone,
  getActiveTraveler,
  getPendingVerificationPhone,
  getTravelerDisplayNames,
  getTravelerSessionMeta,
  logoutTravelerSession,
  setPendingVerificationPhone,
  subscribeActiveTravelerCloud,
  subscribeAllClientsCloud,
  updateUserPresenceCloud,
} from './utils/travelerStore';
import { playChatNotificationChime, subscribeChatThread } from './utils/chatStore';
import { consumeSessionExpiredNotice } from './utils/deviceTrust';
import { TravelerProfile, TravelerSessionMeta } from './types/travel';
import { FacebookIcon } from './components/FacebookIcon';
import { WhatsAppIcon } from './components/WhatsAppIcon';
import { useLanguage } from './contexts/LanguageContext';
import { subscribeSiteConfigCloud, useSiteConfig } from './utils/siteConfigStore';
import { subscribeCmsCloud } from './utils/cmsStore';
import { subscribeAdminsCloud } from './utils/adminAuthStore';
import { useAdmin } from './contexts/AdminContext';

function buildDraftFromTraveler(
  traveler: TravelerProfile | null,
  lang: 'ar' | 'en'
): TravelerProfileDraft {
  if (!traveler) {
    return {
      firstName: '',
      lastName: '',
      passportFullName: '',
      passportNumber: '',
      passportExpiryDate: '',
      nationality: lang === 'en' ? 'Egyptian' : 'مصري',
      preferredVisaType:
        lang === 'en' ? 'Saudi Visit Visa / VFS Tasheer' : 'تأشيرة زيارة / تساهيل السعودية',
      pendingAvatarPreviewUrl: '',
      pendingDocuments: [],
      removedDocIds: [],
      isDirty: false,
    };
  }
  const names = getTravelerDisplayNames(traveler);
  return {
    firstName: names.firstName,
    lastName: names.lastName,
    passportFullName: traveler.passportFullName || names.fullDisplayName,
    passportNumber: traveler.passportNumber || '',
    passportExpiryDate: traveler.passportExpiryDate || '',
    nationality: traveler.nationality || (lang === 'en' ? 'Egyptian' : 'مصري'),
    preferredVisaType:
      traveler.preferredVisaType ||
      (lang === 'en' ? 'Saudi Visit Visa / VFS Tasheer' : 'تأشيرة زيارة / تساهيل السعودية'),
    pendingAvatarPreviewUrl: '',
    pendingDocuments: [],
    removedDocIds: [],
    isDirty: false,
  };
}

export const App: React.FC = () => {
  const { lang, dir, t } = useLanguage();
  const siteConfig = useSiteConfig();
  const { isDashboardMode, openAdminLoginModal, isAdminActive, setAdminMode } = useAdmin();
  const localized = getLocalizedTravelContent(lang);

  const [currentTab, setCurrentTab] = useState<number>(0);
  const [travelerSection, setTravelerSection] = useState<TravelerSubTab | null>(null);
  const [selectedServiceForContact, setSelectedServiceForContact] = useState<string | null>(null);
  const [magicLinkFeedback, setMagicLinkFeedback] = useState<string | null>(null);
  const [activeTravelerPhone, setActiveTravelerPhoneState] = useState<string | null>(() =>
    getActivePhone()
  );
  const [activeTraveler, setActiveTraveler] = useState<TravelerProfile | null>(() =>
    getActiveTraveler()
  );
  const [pendingOtpPhone, setPendingOtpPhoneState] = useState<string | null>(() =>
    getActivePhone() ? null : getPendingVerificationPhone()
  );
  const updatePendingOtpPhone = useCallback((phone: string | null) => {
    setPendingOtpPhoneState(phone);
    setPendingVerificationPhone(phone);
  }, []);
  const [pendingPostAuthFlow, setPendingPostAuthFlow] = useState<PendingPostAuthFlow | null>(null);
  const [sessionMeta, setSessionMeta] = useState<TravelerSessionMeta | null>(() =>
    getTravelerSessionMeta()
  );
  const [sessionExpiredAlert, setSessionExpiredAlert] = useState<string | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState<number>(0);
  const prevChatUnreadRef = useRef<number | null>(null);

  // Restore OTP hold screen automatically if client registered as pending_verification and reopened the page
  useEffect(() => {
    if (!getActivePhone() && getPendingVerificationPhone()) {
      setTravelerSection((curr) => curr || 'account');
    }
  }, []);

  // Lifted Draft State: preserved across full-page navigation until explicit Save or Cancel
  const [travelerDraft, setTravelerDraft] = useState<TravelerProfileDraft>(() =>
    buildDraftFromTraveler(getActiveTraveler(), lang)
  );
  const draftOwnerPhoneRef = useRef<string | null>(activeTravelerPhone);

  const adminTapCountRef = useRef<number>(0);
  const adminTapTimerRef = useRef<number | null>(null);

  // Notify if an earlier temporary 1-hour session had expired before page load
  useEffect(() => {
    if (consumeSessionExpiredNotice()) {
      setSessionExpiredAlert(
        lang === 'en'
          ? 'Your 1-hour temporary session has expired for security. Please sign in again.'
          : 'انتهت مدة الجلسة المؤقتة (ساعة واحدة) حرصاً على أمان حسابك. يرجى تسجيل الدخول مرة أخرى.'
      );
    }
  }, [lang]);

  // Global real-time cloud subscriptions (site_config, cms, admins)
  useEffect(() => {
    const unsubConfig = subscribeSiteConfigCloud();
    const unsubCms = subscribeCmsCloud();
    const unsubAdmins = subscribeAdminsCloud();
    const syncTravelerState = () => {
      const nextPhone = getActivePhone();
      const nextTraveler = getActiveTraveler();
      const nextMeta = getTravelerSessionMeta();
      setActiveTravelerPhoneState(nextPhone);
      setActiveTraveler(nextTraveler);
      setSessionMeta(nextMeta);

      if (consumeSessionExpiredNotice()) {
        setSessionExpiredAlert(
          lang === 'en'
            ? 'Your 1-hour temporary session has expired for security. Please sign in again.'
            : 'انتهت مدة الجلسة المؤقتة (ساعة واحدة) حرصاً على أمان حسابك. يرجى تسجيل الدخول مرة أخرى.'
        );
      }

      // Re-sync draft only when active user changes or draft is clean (never overwrite unsaved edits)
      if (draftOwnerPhoneRef.current !== nextPhone) {
        draftOwnerPhoneRef.current = nextPhone;
        setTravelerDraft(buildDraftFromTraveler(nextTraveler, lang));
      } else {
        setTravelerDraft((prev) =>
          prev.isDirty ? prev : buildDraftFromTraveler(nextTraveler, lang)
        );
      }
    };
    window.addEventListener(TRAVELERS_UPDATED_EVENT, syncTravelerState);
    return () => {
      unsubConfig();
      unsubCms();
      unsubAdmins();
      window.removeEventListener(TRAVELERS_UPDATED_EVENT, syncTravelerState);
    };
  }, [lang]);

  // Active 60-minute Temporary Session Auto-Logout Guard (handles live countdown & sleep/wake)
  useEffect(() => {
    if (!sessionMeta || sessionMeta.mode !== 'temporary' || !sessionMeta.expiresAt) return;

    const triggerExpiry = () => {
      logoutTravelerSession('expired');
      consumeSessionExpiredNotice();
      setTravelerDraft(buildDraftFromTraveler(null, lang));
      updatePendingOtpPhone(null);
      setPendingPostAuthFlow(null);
      setSessionExpiredAlert(
        lang === 'en'
          ? 'Your 1-hour temporary session has expired for security. Please sign in again.'
          : 'انتهت مدة الجلسة المؤقتة (ساعة واحدة) حرصاً على أمان حسابك. يرجى تسجيل الدخول مرة أخرى.'
      );
      setTravelerSection('account');
    };

    const msRemaining = sessionMeta.expiresAt - Date.now();
    if (msRemaining <= 0) {
      triggerExpiry();
      return;
    }

    const timeoutId = window.setTimeout(triggerExpiry, msRemaining + 50);
    const intervalId = window.setInterval(() => {
      if (sessionMeta.expiresAt && Date.now() >= sessionMeta.expiresAt) {
        triggerExpiry();
      }
    }, 15000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [sessionMeta, lang]);

  // Real-time cloud subscription for currently signed-in traveler
  useEffect(() => {
    if (!activeTravelerPhone) return;
    return subscribeActiveTravelerCloud(activeTravelerPhone);
  }, [activeTravelerPhone]);

  // 30-second Live Online/Offline Heartbeat + page exit & visibility presence updater
  useEffect(() => {
    if (!activeTravelerPhone) return;

    void updateUserPresenceCloud(activeTravelerPhone, true);

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void updateUserPresenceCloud(activeTravelerPhone, true);
      }
    }, 30_000);

    const handleVisibility = () => {
      void updateUserPresenceCloud(
        activeTravelerPhone,
        document.visibilityState === 'visible'
      );
    };

    const handlePageExit = () => {
      void updateUserPresenceCloud(activeTravelerPhone, false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.clearInterval(heartbeatId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [activeTravelerPhone]);

  // Real-time unread chat counter & chime for signed-in traveler / B2B partner
  useEffect(() => {
    prevChatUnreadRef.current = null;
    if (!activeTravelerPhone) {
      setChatUnreadCount(0);
      return;
    }

    return subscribeChatThread(activeTravelerPhone, (thread) => {
      const nextCount = thread?.unreadClientCount || 0;
      if (
        prevChatUnreadRef.current !== null &&
        nextCount > prevChatUnreadRef.current &&
        travelerSection !== 'chat'
      ) {
        playChatNotificationChime();
      }
      prevChatUnreadRef.current = nextCount;
      setChatUnreadCount(nextCount);
    });
  }, [activeTravelerPhone, travelerSection]);

  // Real-time cloud subscription for all clients when Admin/Sub-Admin session is active
  useEffect(() => {
    if (!isAdminActive) return;
    return subscribeAllClientsCloud();
  }, [isAdminActive]);

  useEffect(() => {
    const handleUrlActions = async () => {
      try {
        const url = new URL(window.location.href);
        const adminParam = url.searchParams.get('admin');
        if (adminParam === '1') {
          if (isAdminActive) {
            setAdminMode('dashboard');
          } else {
            openAdminLoginModal();
          }
          url.searchParams.delete('admin');
          window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        }

        const activatePhone = url.searchParams.get('activate_phone');
        const otp = url.searchParams.get('otp');
        const nameParam = url.searchParams.get('name');

        if (activatePhone && otp) {
          url.searchParams.delete('activate_phone');
          url.searchParams.delete('otp');
          url.searchParams.delete('name');
          window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);

          const res = await activateViaMagicLinkCloud(activatePhone, otp, nameParam);
          if (res.ok && res.profile) {
            if (res.needsPinSetup || !res.isDeviceTrusted) {
              updatePendingOtpPhone(res.profile.phone);
              setPendingPostAuthFlow({
                phone: res.profile.phone,
                stage: res.needsPinSetup ? 'pin_setup' : 'device_trust_prompt',
              });
              setMagicLinkFeedback(
                res.needsPinSetup
                  ? t(
                      `تم التحقق من رقمك (${res.profile.name}) عبر واتساب! يرجى الآن إنشاء رمز PIN شخصي من 6 أرقام لتأمين حسابك.`,
                      `WhatsApp verified for (${res.profile.name})! Please create a personal 6-digit PIN to secure your account.`
                    )
                  : t(
                      `تم التحقق من رقمك (${res.profile.name}) عبر واتساب! يرجى اختيار حفظ هذا الجهاز كجهاز موثوق أو المتابعة كجلسة مؤقتة.`,
                      `WhatsApp verified for (${res.profile.name})! Please choose whether to trust this device or use a 1-hour temporary session.`
                    )
              );
            } else {
              updatePendingOtpPhone(null);
              setPendingPostAuthFlow(null);
              setMagicLinkFeedback(
                t(
                  `تم تفعيل حسابك (${res.profile.name}) بنجاح والدخول المباشر عبر رابط الواتساب!`,
                  `Your account (${res.profile.name}) has been verified and unlocked via your WhatsApp link!`
                )
              );
            }
            setTravelerSection('account');
          } else {
            setMagicLinkFeedback(
              res.error || t('رابط التفعيل غير صالح أو منتهي.', 'Invalid or expired login link.')
            );
            setTravelerSection('account');
          }
        }
      } catch {
        // Ignore malformed URLs
      }
    };

    void handleUrlActions();
  }, [lang, t, isAdminActive, openAdminLoginModal, setAdminMode]);

  const handleSecretAdminTap = () => {
    adminTapCountRef.current += 1;
    if (adminTapTimerRef.current) {
      window.clearTimeout(adminTapTimerRef.current);
    }
    if (adminTapCountRef.current >= 5) {
      adminTapCountRef.current = 0;
      if (isAdminActive) {
        setAdminMode('dashboard');
      } else {
        openAdminLoginModal();
      }
      return;
    }
    adminTapTimerRef.current = window.setTimeout(() => {
      adminTapCountRef.current = 0;
    }, 3000);
  };

  const handleNavigateToAiScanner = () => {
    setTravelerSection(null);
    setCurrentTab(0);
    setTimeout(() => {
      const el = document.getElementById('traveler-smart-tools');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const handleNavigateToContact = (serviceTitle?: string) => {
    if (serviceTitle) {
      setSelectedServiceForContact(serviceTitle);
    }
    setTravelerSection(null);
    setCurrentTab(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTab = (tab: number) => {
    setTravelerSection(null);
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTravelerSection = (section: TravelerSubTab) => {
    setTravelerSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectServiceFromNavbar = (serviceTitle: string) => {
    setSelectedServiceForContact(serviceTitle);
    setTravelerSection(null);
    setCurrentTab(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetDraft = useCallback(() => {
    setTravelerDraft(buildDraftFromTraveler(getActiveTraveler(), lang));
  }, [lang]);

  return (
    <div
      id="masarik-site-viewport"
      key={lang}
      dir={dir}
      className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F2438] selection:bg-[#0284C7]/20"
    >
      {/* Organized Navigation Bar + Slim Logged-in Sub-Navbar */}
      <Navbar
        currentTab={currentTab}
        travelerSection={travelerSection}
        onSelectTab={handleSelectTab}
        onSelectTravelerSection={handleSelectTravelerSection}
        onSelectService={handleSelectServiceFromNavbar}
        onOpenTravelerProfile={() => handleSelectTravelerSection('account')}
        onSecretAdminTap={handleSecretAdminTap}
        hasUnsavedTravelerDraft={travelerDraft.isDirty}
        chatUnreadCount={chatUnreadCount}
      />

      {/* Global Notice Banner if 1-hour Temporary Session Expired while on another page */}
      {sessionExpiredAlert && !travelerSection && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs font-bold text-red-900">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span>{sessionExpiredAlert}</span>
            </div>
            <button
              type="button"
              onClick={() => setSessionExpiredAlert(null)}
              className="text-red-700 hover:text-red-950 p-1 cursor-pointer"
              aria-label={t('إغلاق', 'Close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Full-Page Admin Workspace OR Full-Page Traveler Workspace OR Live Site Viewport */}
      {isDashboardMode ? (
        <main className="flex-1" data-no-admin-edit="true">
          <AdminDashboardWorkspace />
        </main>
      ) : travelerSection ? (
        <main className="flex-1" data-no-admin-edit="true">
          <TravelerWorkspaceScreen
            activeTraveler={activeTraveler}
            sessionMeta={sessionMeta}
            subTab={travelerSection}
            onChangeSubTab={handleSelectTravelerSection}
            draft={travelerDraft}
            onUpdateDraft={(updater) => setTravelerDraft((prev) => updater(prev))}
            onResetDraft={handleResetDraft}
            pendingOtpPhone={pendingOtpPhone}
            onSetPendingOtpPhone={updatePendingOtpPhone}
            pendingPostAuthFlow={pendingPostAuthFlow}
            onSetPendingPostAuthFlow={setPendingPostAuthFlow}
            magicLinkFeedback={magicLinkFeedback}
            onClearMagicLinkFeedback={() => setMagicLinkFeedback(null)}
            sessionExpiredAlert={sessionExpiredAlert}
            onClearSessionExpiredAlert={() => setSessionExpiredAlert(null)}
            chatUnreadCount={chatUnreadCount}
            onNavigateToAiScanner={handleNavigateToAiScanner}
            onNavigateToServices={() => handleSelectTab(1)}
            onGoHome={() => handleSelectTab(0)}
          />
        </main>
      ) : (
        <main className="flex-1">
          {currentTab === 0 && (
            <HomeScreen
              onNavigateToServices={() => handleSelectTab(1)}
              onNavigateToContact={handleNavigateToContact}
              onOpenTravelerProfile={() => handleSelectTravelerSection('account')}
              onSecretAdminTap={handleSecretAdminTap}
            />
          )}
          {currentTab === 1 && (
            <ServicesScreen onNavigateToContact={handleNavigateToContact} />
          )}
          {currentTab === 2 && (
            <PaymentScreen onNavigateToContact={() => handleSelectTab(3)} />
          )}
          {currentTab === 3 && (
            <ContactScreen initialService={selectedServiceForContact} />
          )}
        </main>
      )}

      {/* Professional Portal Footer */}
      <footer className="bg-[#0A1926] text-white pt-12 pb-24 md:pb-10 border-t-2 border-[#C6A052]">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8 mb-10 text-xs sm:text-sm">
          {/* Col 1: Bio & Licensing */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base sm:text-lg font-black text-white">
                {localized.companyName}
              </span>
              <span className="text-xs text-[#C6A052] font-bold">
                ({TravelRepository.COMPANY_NAME_EN})
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed max-w-md">
              {t(
                'شباكك الواحد وبوابتك المعتمدة رسمياً لإنجاز كافة معاملات التأشيرات وحجز مواعيد تساهيل VFS، تسديد منصة إنجاز والتأمين الصحي، حجز تذاكر الطيران وتوثيق الأوراق الحكومية – بخبرة رائدة ومستمرة منذ عام 2022.',
                'Your officially licensed portal for visa processing, VFS Tasheer appointments, Enjaz & medical insurance, flight & hotel bookings, and official document legalization — serving travelers since 2022.'
              )}
            </p>
            <div className="flex flex-col gap-1 text-xs text-[#E5C887] font-semibold pt-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#C6A052]" />
                <span>{localized.commercialRecordStatement}</span>
              </div>
              <span className="text-slate-400 text-[11px] ps-6">
                {localized.certificationTitle}
              </span>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#E5C887] uppercase tracking-wider">
              {t('أقسام المنصة', 'Platform Sections')}
            </h3>
            <ul className="space-y-2 text-slate-300">
              <li>
                <button
                  onClick={() => handleSelectTab(0)}
                  className="hover:text-white transition flex items-center gap-1 cursor-pointer text-start"
                >
                  <span>{t('الرئيسية والدليل التفاعلي', 'Home & Interactive Guide')}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleSelectTab(1)}
                  className="hover:text-white transition flex items-center gap-1 cursor-pointer text-start"
                >
                  <span>{t('دليل الخدمات والتأشيرات', 'Services & Visas Directory')}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleSelectTab(2)}
                  className="hover:text-white transition flex items-center gap-1 cursor-pointer text-start"
                >
                  <span>{t('طرق الدفع المعتمدة (InstaPay)', 'Payment Methods (InstaPay)')}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleSelectTab(3)}
                  className="hover:text-white transition flex items-center gap-1 cursor-pointer text-start"
                >
                  <span>{t('بيانات الاتصال ومقر الفروع', 'Contact & Office Address')}</span>
                </button>
              </li>
              <li>
                <a
                  href="/privacy.html"
                  className="hover:text-[#E5C887] text-slate-200 transition flex items-center gap-1 cursor-pointer text-start font-semibold"
                >
                  <span>{t('سياسة الخصوصية', 'Privacy Policy')}</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Direct Contact */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#E5C887] uppercase tracking-wider">
              {t('التواصل والمقر الرسمي', 'Contact & Headquarters')}
            </h3>
            <div className="space-y-2 text-slate-300">
              <button
                onClick={() => dialPhoneNumber()}
                className="flex items-center gap-2 hover:text-[#E5C887] transition cursor-pointer text-start w-full"
              >
                <Phone className="w-4 h-4 text-[#C6A052] shrink-0" />
                <span>
                  {t('الهاتف:', 'Phone:')} {siteConfig.phoneNumber}
                </span>
              </button>

              <button
                onClick={() => openCustomerServiceWhatsApp()}
                className="flex items-center gap-2 hover:text-[#25D366] transition cursor-pointer text-start w-full tabular-nums"
              >
                <WhatsAppIcon className="w-4 h-4 shrink-0" variant="colored" />
                <span>
                  {t('خدمة العملاء واتساب:', 'Support WhatsApp:')}{' '}
                  <span dir="ltr">{CUSTOMER_SERVICE_WHATSAPP_NUMBER}</span>
                </span>
              </button>

              <div className="flex items-center gap-2 text-slate-300 min-w-0">
                <Mail className="w-4 h-4 text-[#C6A052] shrink-0" />
                <a
                  href={`mailto:${TravelRepository.OFFICIAL_EMAIL}`}
                  dir="ltr"
                  className="text-[11.5px] sm:text-xs md:text-[11px] lg:text-[12.5px] font-medium hover:text-[#E5C887] transition break-all"
                >
                  {TravelRepository.OFFICIAL_EMAIL}
                </a>
              </div>

              <div className="flex items-center gap-2 text-slate-300">
                <Clock className="w-4 h-4 text-[#C6A052] shrink-0" />
                <span>{lang === 'en' ? siteConfig.workingHoursEn : siteConfig.workingHoursAr}</span>
              </div>

              <div className="flex items-start gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-[#C6A052] shrink-0 mt-0.5" />
                <span>
                  {t('العنوان:', 'Address:')} {localized.address}
                </span>
              </div>

              <a
                href={TravelRepository.FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-[#60A5FA] text-slate-200 transition cursor-pointer pt-1"
              >
                <FacebookIcon className="w-4 h-4 fill-[#1877F2]" />
                <span>{t('صفحة مسارك على فيسبوك', 'Masarik on Facebook')}</span>
                <ArrowUpRight className="w-3 h-3 text-slate-400" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer Interactive App Install & Update Check CTA */}
        <div className="max-w-5xl mx-auto px-4 mb-6">
          <div className="bg-white/[0.04] border border-[#C6A052]/40 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-center sm:text-start">
              <div className="w-9 h-9 rounded-xl bg-[#C6A052]/15 border border-[#C6A052]/40 text-[#E5C887] flex items-center justify-center shrink-0">
                <Smartphone className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-black text-white block">
                  {t('تطبيق مسارك للإنجاز السياحي (Android)', 'Masarik Tourism Official App (Android)')}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {t(
                    'التحقق المباشر من التحديثات وتثبيت النسخة الرسمية',
                    'Direct update check & official release installer'
                  )}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => triggerApkUpdateModal('check')}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer whitespace-nowrap tabular-nums"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>
                {t(
                  `تثبيت التطبيق / التحقق من التحديثات (${CURRENT_APP_VERSION})`,
                  `Install App / Check for Updates (${CURRENT_APP_VERSION})`
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Legal notice bottom */}
        <div className="border-t border-white/10 pt-6 pb-2 text-center max-w-5xl mx-auto px-4">
          <p className="text-xs md:text-sm text-slate-300 font-medium tracking-wide select-none">
            {t('مسارك للإنجاز السياحي', 'Masarik Tourism LLC')}{' '}
            <button
              type="button"
              onClick={handleSecretAdminTap}
              className="text-slate-300 hover:text-white cursor-default focus:outline-none"
              aria-label={t('عام التأسيس', 'Founding Year')}
            >
              (2022)
            </button>{' '}
            © {t('جميع الحقوق محفوظة', 'All Rights Reserved')}
          </p>
        </div>
      </footer>

      {/* PIN-Only Admin Entry Modal (Unlocks Full-Page Admin Session) */}
      <AdminLoginModal />

      {/* Universal Live Inline Site Editor & Persistent CMS Observer */}
      {!isDashboardMode && !travelerSection && (
        <LiveInlineEditorEngine rootId="masarik-site-viewport" />
      )}

      {/* Self-Updating Website Notification Banner */}
      <SiteUpdateBanner />

      {/* Android WebView In-App Release Update Notification */}
      <InAppVersionBanner />

      {/* Offline Mode Alert */}
      <OfflineIndicator />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onOpenTravelerProfile={() => handleSelectTravelerSection('account')}
        isTravelerOpen={Boolean(travelerSection)}
      />

      {/* Floating Customer Service WhatsApp Action Button (201128440008 ONLY) */}
      {!isDashboardMode && (
        <button
          type="button"
          data-no-admin-edit="true"
          onClick={() => openCustomerServiceWhatsApp()}
          className="fixed bottom-20 md:bottom-6 end-3 sm:end-5 z-30 w-12 h-12 rounded-full bg-[#25D366] hover:bg-[#128C7E] text-white border-2 border-white shadow-xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer animate-pulse-float-a"
          title={t(
            `خدمة العملاء واتساب (${CUSTOMER_SERVICE_WHATSAPP_NUMBER})`,
            `Customer Support WhatsApp (${CUSTOMER_SERVICE_WHATSAPP_NUMBER})`
          )}
          aria-label={t('واتساب خدمة العملاء', 'Customer Support WhatsApp')}
        >
          <WhatsAppIcon className="w-6 h-6" variant="white" />
        </button>
      )}
    </div>
  );
};

export default App;

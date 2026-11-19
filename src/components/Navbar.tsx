import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  ShieldCheck,
  Compass,
  Menu,
  X,
  ChevronDown,
  RotateCw,
  UserCheck,
  Globe,
  Sparkles,
  LayoutDashboard,
  LogOut,
  Crown,
  Home,
  ClipboardList,
  FolderOpen,
  Briefcase,
  Bell,
  CheckCheck,
  FileCheck2,
  MessageSquare,
  Building2,
} from 'lucide-react';
import { TravelRepository, getLocalizedTravelContent } from '../data/travelData';
import {
  dialPhoneNumber,
} from '../utils/communication';
import masarikLogoImg from '../assets/images/masarik_logo.jpg';
import {
  formatFirstLastName,
  getActiveTraveler,
  getTravelerDisplayNames,
  markClientNotificationsReadCloud,
  TRAVELERS_UPDATED_EVENT,
} from '../utils/travelerStore';
import { getDisplayableDriveImageUrl } from '../utils/firebaseStorageHelper';
import { TravelerProfile } from '../types/travel';
import { useLanguage } from '../contexts/LanguageContext';
import { useAdmin } from '../contexts/AdminContext';
import { AnnouncementBanner } from './AnnouncementBanner';
import { useSiteConfig } from '../utils/siteConfigStore';
import type { TravelerSubTab } from './TravelerWorkspaceScreen';

interface NavbarProps {
  currentTab: number;
  travelerSection: TravelerSubTab | null;
  onSelectTab: (tab: number) => void;
  onSelectTravelerSection: (section: TravelerSubTab) => void;
  onSelectService?: (serviceTitle: string) => void;
  onOpenTravelerProfile: () => void;
  onSecretAdminTap?: () => void;
  hasUnsavedTravelerDraft?: boolean;
  chatUnreadCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  travelerSection,
  onSelectTab,
  onSelectTravelerSection,
  onSelectService,
  onOpenTravelerProfile,
  onSecretAdminTap,
  hasUnsavedTravelerDraft = false,
  chatUnreadCount = 0,
}) => {
  const { lang, isAr, toggleLang, t } = useLanguage();
  const {
    session,
    isAdminActive,
    isSuperAdmin,
    isDashboardMode,
    isLiveEditorMode,
    isEditUnlocked,
    setAdminMode,
    logoutAdmin,
    hasPermission,
  } = useAdmin();
  const siteConfig = useSiteConfig();
  const localized = getLocalizedTravelContent(lang);
  const [logoError, setLogoError] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const [activeTraveler, setActiveTraveler] = useState<TravelerProfile | null>(() =>
    getActiveTraveler()
  );

  useEffect(() => {
    const syncTraveler = () => setActiveTraveler(getActiveTraveler());
    window.addEventListener(TRAVELERS_UPDATED_EVENT, syncTraveler);
    return () => window.removeEventListener(TRAVELERS_UPDATED_EVENT, syncTraveler);
  }, []);

  const handleHardRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setShowRefreshToast(true);

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
      } catch {}
    }
    if ('caches' in window) {
      try {
        caches
          .keys()
          .then((names) => {
            names.forEach((name) => {
              caches.delete(name);
            });
          })
          .catch(() => {});
      } catch {}
    }

    setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('t', Date.now().toString());
        window.location.href = url.toString();
      } catch {
        window.location.reload();
      }
    }, 600);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setServicesDropdownOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tabs = [
    { label: t('الرئيسية', 'Home'), index: 0 },
    { label: t('دليل الخدمات', 'Services'), index: 1, hasDropdown: true },
    { label: t('طرق الدفع المعتمدة', 'Payments'), index: 2 },
    { label: t('تواصل معنا', 'Contact'), index: 3 },
  ];

  const handleTabClick = (index: number) => {
    if (isDashboardMode) {
      setAdminMode('live_editor');
    }
    onSelectTab(index);
    setMobileMenuOpen(false);
    setServicesDropdownOpen(false);
  };

  const handleTravelerTabClick = (section: TravelerSubTab) => {
    if (isDashboardMode) {
      setAdminMode('live_editor');
    }
    onSelectTravelerSection(section);
    setMobileMenuOpen(false);
    setServicesDropdownOpen(false);
  };

  const handleServiceSelect = (title: string) => {
    if (isDashboardMode) {
      setAdminMode('live_editor');
    }
    if (onSelectService) {
      onSelectService(title);
    }
    setServicesDropdownOpen(false);
    setMobileMenuOpen(false);
  };

  const names = getTravelerDisplayNames(activeTraveler);
  const travelerShortFullName = activeTraveler
    ? formatFirstLastName(names.fullDisplayName)
    : '';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      {/* Live Admin Announcement Banner (shown when enabled) */}
      <AnnouncementBanner />

      {/* Official Top Bar */}
      <div className="bg-[#0A1926] text-white px-3 sm:px-4 py-1.5 text-xs font-semibold border-b border-[#C6A052]/40">
        <div className="max-w-6xl mx-auto flex items-center justify-center text-center">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E5C887] shrink-0" />
            <span className="text-[10.5px] sm:text-xs leading-tight">
              {localized.certificationTitle} -{' '}
              {t(
                `سجل تجاري رقم: ${TravelRepository.COMMERCIAL_RECORD}`,
                `CR No: ${TravelRepository.COMMERCIAL_RECORD}`
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Main Decluttered Navbar */}
      <div className="max-w-6xl mx-auto px-2.5 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2">
        {/* Start Side: Company Logo + Full Non-Truncating Company Name */}
        <div
          onClick={() => {
            onSecretAdminTap?.();
            handleTabClick(0);
          }}
          className="flex items-center gap-1.5 min-[390px]:gap-2 sm:gap-2.5 cursor-pointer select-none group shrink-0"
        >
          <div className="relative shrink-0">
            {!logoError ? (
              <img
                src={masarikLogoImg}
                onError={() => setLogoError(true)}
                alt={t('شعار مسارك للإنجاز السياحي', 'Masarik Tourism Logo')}
                className="w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 sm:w-11 sm:h-11 rounded-full border-2 border-[#C6A052] object-cover shadow-xs group-hover:scale-105 transition-transform bg-white"
              />
            ) : (
              <div className="w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 sm:w-11 sm:h-11 rounded-full border-2 border-[#C6A052] bg-[#0F2438] flex items-center justify-center text-[#E5C887] shadow-xs group-hover:scale-105 transition-transform">
                <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-[#E5C887]" />
              </div>
            )}
            <span
              className={`absolute -bottom-0.5 ${isAr ? '-left-0.5' : '-right-0.5'} bg-[#0F2438] text-[#E5C887] p-0.5 sm:p-1 rounded-full border-[1.5px] border-white shadow-sm flex items-center justify-center`}
              title={t('شركة معتمدة وموثقة - س.ت 7839', 'Licensed & Certified - CR 7839')}
            >
              <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#E5C887] stroke-[2.25]" />
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[clamp(0.85rem,3.8vw,1.15rem)] font-black text-[#0F2438] leading-tight whitespace-nowrap">
              {t('مسارك للإنجاز السياحي', 'Masarik Tourism')}
            </span>
            <span className="text-[8.5px] sm:text-[10px] font-bold text-[#0284C7] tracking-wider uppercase whitespace-nowrap">
              {t(TravelRepository.COMPANY_NAME_EN, 'MASARIK LIL-INJAZ AL-SIYAHI LLC')}
            </span>
          </div>
        </div>

        {/* Center: Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 p-1.5 rounded-full border border-slate-200 text-xs sm:text-sm font-bold shrink-0">
          {tabs.map((tab) => {
            const isTabSelected = !travelerSection && !isDashboardMode && currentTab === tab.index;
            if (tab.hasDropdown) {
              return (
                <div key={tab.index} className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setServicesDropdownOpen(!servicesDropdownOpen)}
                    className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      isTabSelected
                        ? 'bg-[#0F2438] text-white shadow-xs'
                        : 'text-slate-700 hover:text-[#0F2438] hover:bg-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {servicesDropdownOpen && (
                    <div
                      className={`absolute top-full ${isAr ? 'right-0' : 'left-0'} mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in duration-150`}
                    >
                      <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 border-b border-slate-100">
                        {t('الخدمات المعتمدة الرسمية', 'Official Certified Services')}
                      </div>
                      {localized.services.map((svc) => (
                        <button
                          key={svc.id}
                          onClick={() => handleServiceSelect(svc.title)}
                          className="w-full text-start px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-[#0284C7] transition flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{svc.title}</span>
                          {svc.badge && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-medium shrink-0">
                              {svc.badge}
                            </span>
                          )}
                        </button>
                      ))}
                      <div className="border-t border-slate-100 mt-1 pt-1 px-3">
                        <button
                          onClick={() => handleTabClick(1)}
                          className="w-full text-center py-1.5 text-xs font-bold text-[#0284C7] hover:underline"
                        >
                          {t('عرض كل الخدمات بالتفصيل', 'View All Services in Detail')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={tab.index}
                onClick={() => handleTabClick(tab.index)}
                className={`px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                  isTabSelected
                    ? 'bg-[#0F2438] text-white shadow-xs'
                    : 'text-slate-700 hover:text-[#0F2438] hover:bg-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          <a
            href="/privacy.html"
            className="px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap text-slate-700 hover:text-[#0F2438] hover:bg-white"
          >
            {t('سياسة الخصوصية', 'Privacy Policy')}
          </a>
        </nav>

        {/* End Side: Admin Role Badge (when active) OR Traveler Account Button (with Avatar) + Hamburger Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0" data-no-admin-edit="true">
          {isAdminActive ? (
            <button
              type="button"
              onClick={() => setAdminMode(isDashboardMode ? 'live_editor' : 'dashboard')}
              className="bg-gradient-to-r from-[#0F2438] to-[#163B65] hover:brightness-110 text-[#E5C887] font-black text-[clamp(0.7rem,2.8vw,0.85rem)] px-2.5 sm:px-3.5 h-8 sm:h-9 rounded-full flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 border-2 border-[#C6A052] shadow-sm leading-none"
              title={
                isSuperAdmin
                  ? t('المدير العام — اضغط للتبديل', 'General Manager — Click to switch mode')
                  : t('مدير مساعد — اضغط للتبديل', 'Sub-Admin — Click to switch mode')
              }
            >
              <Crown className="w-3.5 h-3.5 text-[#E5C887] shrink-0" />
              <span>
                {isSuperAdmin
                  ? t('المدير العام', 'General Manager')
                  : t('مدير مساعد', 'Sub-Admin')}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (activeTraveler) {
                  handleTravelerTabClick('account');
                } else {
                  onOpenTravelerProfile();
                }
              }}
              className={`bg-[#C6A052]/15 hover:bg-[#C6A052]/25 text-[#0F2438] font-bold text-[clamp(0.7rem,2.8vw,0.85rem)] ${
                activeTraveler?.avatarUrl ? 'ps-1.5 pe-2.5 sm:ps-1.5 sm:pe-3' : 'px-2.5 sm:px-3'
              } h-8 sm:h-9 rounded-full flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 border border-[#C6A052]/60 leading-none`}
              title={t('حسابي - بيانات الحساب', 'My Account - Account Info')}
            >
              {activeTraveler?.avatarUrl ? (
                <img
                  src={getDisplayableDriveImageUrl(activeTraveler.avatarUrl)}
                  alt={travelerShortFullName}
                  loading="lazy"
                  decoding="async"
                  className="w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full object-cover border border-[#C6A052] shrink-0 bg-white"
                />
              ) : activeTraveler?.accountType === 'b2b_partner' ? (
                <Building2 className="w-3.5 h-3.5 text-[#9E7B33] shrink-0" />
              ) : activeTraveler?.verified ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-[#9E7B33] shrink-0" />
              )}
              <span className="max-w-[95px] sm:max-w-[140px] truncate">
                {activeTraveler ? travelerShortFullName : t('حسابي', 'My Account')}
              </span>
              {chatUnreadCount > 0 && (
                <span className="min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[9.5px] font-black flex items-center justify-center tabular-nums">
                  {chatUnreadCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden w-8 h-8 sm:w-9 sm:h-9 bg-slate-100 hover:bg-slate-200 text-[#0F2438] rounded-full flex items-center justify-center shrink-0 transition cursor-pointer"
            aria-label={t('القائمة', 'Menu')}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Slim Sleek Persistent Client Sub-Navbar + Live Notification Bell */}
      {activeTraveler && !isDashboardMode && (() => {
        const notifications = activeTraveler.notifications || [];
        const unreadCount = notifications.filter((n) => !n.read).length;
        const issuedCount = activeTraveler.issuedDocuments?.length || 0;
        return (
          <div
            data-no-admin-edit="true"
            className="bg-slate-50/95 border-t border-slate-200/90 px-2 sm:px-4"
          >
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 py-1.5">
              <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => handleTabClick(0)}
                  className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    !travelerSection && currentTab === 0
                      ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F2438] hover:bg-white'
                  }`}
                >
                  <Home className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('الرئيسية', 'Home')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTravelerTabClick('account')}
                  className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    travelerSection === 'account'
                      ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F2438] hover:bg-white'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('بيانات الحساب', 'Account Info')}</span>
                  {hasUnsavedTravelerDraft && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleTravelerTabClick('orders')}
                  className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    travelerSection === 'orders'
                      ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F2438] hover:bg-white'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('طلباتي', 'My Orders')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTravelerTabClick('documents')}
                  className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    travelerSection === 'documents'
                      ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F2438] hover:bg-white'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('مستنداتي الصادرة والمحفظة', 'Issued Docs & Wallet')}</span>
                  {issuedCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white text-[9.5px] font-black tabular-nums">
                      {issuedCount}
                    </span>
                  )}
                  {hasUnsavedTravelerDraft && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleTravelerTabClick('chat')}
                  className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    travelerSection === 'chat'
                      ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                      : chatUnreadCount > 0
                      ? 'bg-red-50 text-red-900 border border-red-200 hover:bg-red-100'
                      : 'text-slate-600 hover:text-[#0F2438] hover:bg-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('المحادثة الفورية', 'Live Chat')}</span>
                  {chatUnreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[9.5px] font-black tabular-nums">
                      {chatUnreadCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleTabClick(1)}
                  className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    !travelerSection && currentTab === 1
                      ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F2438] hover:bg-white'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('الخدمات', 'Services')}</span>
                </button>
              </div>

              {/* Live Client Notification Bell */}
              <div className="relative shrink-0" ref={notifDropdownRef}>
                <button
                  type="button"
                  onClick={() => setNotifDropdownOpen((prev) => !prev)}
                  className={`relative px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-black flex items-center gap-1.5 transition cursor-pointer border ${
                    unreadCount > 0
                      ? 'bg-amber-50 border-amber-300 text-[#0F2438] hover:bg-amber-100'
                      : 'bg-white border-slate-200 text-[#0F2438] hover:bg-slate-100'
                  }`}
                  aria-label={t('إشعارات الطلبات والمستندات', 'Order & Document Notifications')}
                  title={t('إشعارات الطلبات والمستندات', 'Order & Document Notifications')}
                >
                  <Bell className={`w-3.5 h-3.5 ${unreadCount > 0 ? 'text-amber-600' : 'text-[#0F2438]'}`} />
                  <span className="hidden sm:inline">{t('الإشعارات', 'Alerts')}</span>
                  {unreadCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifDropdownOpen && (
                  <div
                    className={`absolute top-full ${
                      isAr ? 'left-0' : 'right-0'
                    } mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in duration-150`}
                  >
                    <div className="bg-[#0F2438] text-white px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-[#C6A052]/50">
                      <span className="text-xs font-black flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-[#E5C887]" />
                        <span>{t('الإشعارات اللحظية', 'Live Notifications')}</span>
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void markClientNotificationsReadCloud(activeTraveler.phone)}
                          className="text-[10.5px] font-bold text-[#E5C887] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>{t('تحديد كمقروء', 'Mark all read')}</span>
                        </button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-5 text-center text-xs text-slate-500">
                          {t(
                            'لا توجد إشعارات جديدة حالياً. سيصلك تنبيه فوري هنا عند أي تحديث لطلبك.',
                            'No notifications yet. Live updates appear here as soon as your order changes.'
                          )}
                        </div>
                      ) : (
                        notifications.slice(0, 12).map((notif) => (
                          <button
                            key={notif.id}
                            type="button"
                            onClick={() => {
                              void markClientNotificationsReadCloud(activeTraveler.phone, notif.id);
                              setNotifDropdownOpen(false);
                              handleTravelerTabClick(
                                notif.type === 'deliverable' ? 'documents' : 'orders'
                              );
                            }}
                            className={`w-full text-start p-3 transition flex items-start gap-2.5 cursor-pointer ${
                              notif.read
                                ? 'bg-white hover:bg-slate-50'
                                : 'bg-emerald-50/60 hover:bg-emerald-50'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                notif.type === 'deliverable'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-sky-100 text-[#0284C7]'
                              }`}
                            >
                              {notif.type === 'deliverable' ? (
                                <FileCheck2 className="w-4 h-4" />
                              ) : (
                                <Bell className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-black text-[#0F2438] truncate">
                                  {lang === 'en' ? notif.titleEn : notif.titleAr}
                                </span>
                                {!notif.read && (
                                  <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                                )}
                              </div>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                {lang === 'en' ? notif.bodyEn : notif.bodyAr}
                              </p>
                              <span className="text-[10px] text-slate-400 block tabular-nums">
                                {notif.createdAt?.slice(0, 16).replace('T', ' ')}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Active Admin Session Control Bar */}
      {isAdminActive && session && (
        <div
          data-no-admin-edit="true"
          className="bg-[#0F2438] text-white px-2.5 sm:px-4 py-1.5 border-t border-[#C6A052]/50"
        >
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#E5C887]">
              <Crown className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[160px] sm:max-w-xs">
                {isSuperAdmin
                  ? t('جلسة المدير العام نشطة', 'General Manager Session')
                  : t(`مدير مساعد: ${session.name}`, `Sub-Admin: ${session.name}`)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAdminMode('dashboard')}
                className={`px-2.5 py-1 rounded-lg font-black flex items-center gap-1 transition cursor-pointer ${
                  isDashboardMode
                    ? 'bg-[#C6A052] text-[#0A1926]'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                <span>{t('لوحة الإدارة الشاملة', 'Full Admin Dashboard')}</span>
              </button>

              <button
                type="button"
                onClick={() => setAdminMode('live_editor')}
                className={`px-2.5 py-1 rounded-lg font-black flex items-center gap-1 transition cursor-pointer ${
                  isLiveEditorMode
                    ? 'bg-[#C6A052] text-[#0A1926]'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isEditUnlocked && hasPermission('edit_content')
                    ? t('معاينة الموقع والتعديل المباشر', 'Live Site Editor')
                    : t('معاينة الموقع (وضع آمن)', 'Preview Site (Safe)')}
                </span>
              </button>

              <button
                type="button"
                onClick={logoutAdmin}
                className="px-2.5 py-1 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-bold flex items-center gap-1 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>{t('خروج من الإدارة', 'Logout')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Circular Quick-Action Buttons Stacked Under Hamburger Menu Position */}
      {!mobileMenuOpen && (
        <div className="absolute top-full mt-2.5 end-2.5 sm:end-4 z-30 flex flex-col items-center gap-2 pointer-events-none">
          <button
            type="button"
            onClick={toggleLang}
            className="pointer-events-auto w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 hover:bg-[#0F2438] text-[#0F2438] hover:text-[#E5C887] border border-[#C6A052]/70 shadow-md backdrop-blur-md flex items-center justify-center transition-all active:scale-95 cursor-pointer text-[11px] font-black leading-none"
            title={isAr ? 'Switch to English' : 'التحويل إلى العربية'}
            aria-label={isAr ? 'Switch to English' : 'التحويل إلى العربية'}
          >
            {isAr ? <span>EN</span> : <span className="text-[10.5px]">عربي</span>}
          </button>

          <button
            type="button"
            onClick={() => dialPhoneNumber()}
            className="pointer-events-auto w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0F2438]/95 hover:bg-[#163B65] text-[#E5C887] border border-[#C6A052]/70 shadow-md backdrop-blur-md flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            title={t(`اتصال هاتفي مباشر ${siteConfig.phoneNumber}`, `Call ${siteConfig.phoneNumber}`)}
            aria-label={t('اتصال هاتفي مباشر', 'Direct Phone Call')}
          >
            <Phone className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Floating Refresh Toast */}
      {showRefreshToast && (
        <div className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0F2438] text-white text-xs font-bold px-4 py-2 rounded-full shadow-2xl border border-[#C6A052]/50 flex items-center gap-2 animate-in fade-in slide-in-from-top duration-200 pointer-events-none">
          <RotateCw className="w-3.5 h-3.5 text-[#E5C887] animate-spin" />
          <span>{t('جاري تحديث البيانات...', 'Refreshing data...')}</span>
        </div>
      )}

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-t border-slate-200 px-4 py-3 space-y-2 animate-in slide-in-from-top duration-150 shadow-md">
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              if (activeTraveler) {
                handleTravelerTabClick('account');
              } else {
                onOpenTravelerProfile();
              }
            }}
            className="w-full text-start px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black text-[#0F2438] bg-[#C6A052]/20 hover:bg-[#C6A052]/30 transition flex items-center justify-between border border-[#C6A052]/60"
          >
            <span className="flex items-center gap-2">
              {activeTraveler?.avatarUrl ? (
                <img
                  src={getDisplayableDriveImageUrl(activeTraveler.avatarUrl)}
                  alt={travelerShortFullName}
                  loading="lazy"
                  decoding="async"
                  className="w-6 h-6 rounded-full object-cover border border-[#C6A052] shrink-0"
                />
              ) : (
                <UserCheck className="w-4 h-4 text-[#9E7B33]" />
              )}
              <span>
                {activeTraveler
                  ? t(`ملف المسافر: ${travelerShortFullName}`, `Traveler Profile: ${travelerShortFullName}`)
                  : t('حسابي / ملف المسافر', 'My Account / Traveler Profile')}
              </span>
            </span>
            <span
              className={`text-[11px] font-bold ${
                activeTraveler?.verified ? 'text-emerald-800' : 'text-amber-800'
              }`}
            >
              {activeTraveler
                ? activeTraveler.verified
                  ? t('حساب موثق ✓', 'Verified ✓')
                  : t('غير موثق', 'Unverified')
                : t('دخول', 'Sign In')}
            </span>
          </button>

          {tabs.map((tab) => {
            const isTabSelected = !travelerSection && currentTab === tab.index;
            return (
              <button
                key={tab.index}
                onClick={() => handleTabClick(tab.index)}
                className={`w-full text-start px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-between ${
                  isTabSelected ? 'bg-[#0F2438] text-white' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}

          <a
            href="/privacy.html"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full text-start px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-between text-slate-700 hover:bg-slate-50"
          >
            <span>{t('سياسة الخصوصية', 'Privacy Policy')}</span>
          </a>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                toggleLang();
                setMobileMenuOpen(false);
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold text-[#0F2438] bg-slate-100 hover:bg-slate-200 transition flex items-center justify-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>{isAr ? 'English (EN)' : 'العربية (AR)'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                handleHardRefresh();
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-1.5 border border-dashed border-slate-200"
            >
              <RotateCw className="w-3.5 h-3.5 text-[#0F2438]" />
              <span>{t('تحديث الصفحة', 'Reload Page')}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{t(`خدمة العملاء: ${siteConfig.phoneNumber}`, `Support: ${siteConfig.phoneNumber}`)}</span>
            <span className="text-[#0284C7] font-semibold">{t('متاح 24 ساعة', 'Available 24/7')}</span>
          </div>
        </div>
      )}
    </header>
  );
};

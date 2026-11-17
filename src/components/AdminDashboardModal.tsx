import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  Copy,
  Check,
  UserPlus,
  Search,
  Send,
  CheckCircle2,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  Download,
  Eye,
  Trash2,
  Save,
  Megaphone,
  Settings,
  Users,
  FileText,
  KeyRound,
  RotateCcw,
  MessageCircle,
  AlertTriangle,
} from 'lucide-react';
import { TravelerProfile, VisaOrderStatus } from '../types/travel';
import {
  VISA_ORDER_STATUSES,
  TRAVELERS_UPDATED_EVENT,
  buildActivationMagicLink,
  buildAdminForwardActivationMessage,
  deleteTravelerProfile,
  exportAllDataBackupJson,
  formatPhoneForDisplay,
  getAllTravelers,
  normalizePhone,
  registerOrLoginTraveler,
  updateAdminPin,
  updateTravelerProfileDetails,
  verifyAdminPin,
} from '../utils/travelerStore';
import {
  AnnouncementStyle,
  DEFAULT_SITE_CONFIG,
  SiteConfig,
  getSiteConfig,
  resetSiteConfig,
  saveSiteConfig,
} from '../utils/siteConfigStore';
import { translateOrderStatus } from '../data/travelData';
import { openWhatsApp } from '../utils/communication';
import { useLanguage } from '../contexts/LanguageContext';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AdminTab = 'clients' | 'content' | 'settings';

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
  const { lang, isAr, dir, t } = useLanguage();
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  // Lock screen state
  const [pinInput, setPinInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinError, setPinError] = useState('');

  // Navigation tab
  const [activeTab, setActiveTab] = useState<AdminTab>('clients');

  // Tab 1: Clients & Documents Directory
  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Tab 1: Selected Client Folder view
  const [selectedClientPhone, setSelectedClientPhone] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassportFullName, setEditPassportFullName] = useState('');
  const [editPassportNumber, setEditPassportNumber] = useState('');
  const [editPassportExpiry, setEditPassportExpiry] = useState('');
  const [editNationality, setEditNationality] = useState('');
  const [editOrderStatus, setEditOrderStatus] = useState<VisaOrderStatus>('تم استلام الأوراق');
  const [editAdminNotes, setEditAdminNotes] = useState('');
  const [folderSavedMsg, setFolderSavedMsg] = useState('');
  const [confirmDeletePhone, setConfirmDeletePhone] = useState<string | null>(null);
  const [previewDocImage, setPreviewDocImage] = useState<{ label: string; dataUrl: string } | null>(
    null
  );

  // Tab 2: Announcements & Site Content
  const [siteDraft, setSiteDraft] = useState<SiteConfig>(() => getSiteConfig());
  const [contentSavedMsg, setContentSavedMsg] = useState('');

  // Tab 3: Admin Settings (Change PIN + Export)
  const [currentPinDraft, setCurrentPinDraft] = useState('');
  const [newPinDraft, setNewPinDraft] = useState('');
  const [confirmPinDraft, setConfirmPinDraft] = useState('');
  const [pinChangeFeedback, setPinChangeFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [backupMsg, setBackupMsg] = useState('');

  const loadTravelers = () => {
    const map = getAllTravelers();
    const list = Object.values(map).sort(
      (a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
    );
    setTravelers(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadTravelers();
      setSiteDraft(getSiteConfig());
      setPinError('');
      setContentSavedMsg('');
      setFolderSavedMsg('');
      setPinChangeFeedback(null);
      setBackupMsg('');
    } else {
      setPinInput('');
      setPreviewDocImage(null);
      setConfirmDeletePhone(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const onUpdate = () => loadTravelers();
    window.addEventListener(TRAVELERS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(TRAVELERS_UPDATED_EVENT, onUpdate);
  }, []);

  // Keep selected client folder draft populated when selectedClientPhone changes
  const selectedClient = selectedClientPhone
    ? travelers.find((tr) => tr.phone === selectedClientPhone) || null
    : null;

  useEffect(() => {
    if (selectedClient) {
      setEditName(selectedClient.name || '');
      setEditPassportFullName(selectedClient.passportFullName || '');
      setEditPassportNumber(selectedClient.passportNumber || '');
      setEditPassportExpiry(selectedClient.passportExpiryDate || '');
      setEditNationality(selectedClient.nationality || '');
      setEditOrderStatus(selectedClient.orderStatus || 'تم استلام الأوراق');
      setEditAdminNotes(selectedClient.adminNotes || '');
      setFolderSavedMsg('');
      setConfirmDeletePhone(null);
    }
  }, [selectedClientPhone, travelers.length]);

  if (!isOpen) return null;

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdminPin(pinInput)) {
      setIsUnlocked(true);
      setPinError('');
      loadTravelers();
      setSiteDraft(getSiteConfig());
    } else {
      setPinError(t('الرمز السري للإدارة غير صحيح.', 'Incorrect Admin PIN.'));
    }
  };

  const handleAdminAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || normalizePhone(newPhone).length < 8) return;
    registerOrLoginTraveler(newName, newPhone);
    setNewName('');
    setNewPhone('');
    loadTravelers();
  };

  const handleCopyActivationMsg = async (client: TravelerProfile) => {
    const msg = buildAdminForwardActivationMessage(client.name, client.phone, client.otp, lang);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedPhone(client.phone);
      setTimeout(() => setCopiedPhone(null), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleSendActivationWhatsApp = (client: TravelerProfile) => {
    const msg = buildAdminForwardActivationMessage(client.name, client.phone, client.otp, lang);
    const phoneDigits = normalizePhone(client.phone);
    openWhatsApp(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`);
  };

  const handleDirectWhatsAppChat = (client: TravelerProfile) => {
    const phoneDigits = normalizePhone(client.phone);
    const hello =
      lang === 'en'
        ? `Hello ${client.name}, Masarik Tourism team is reaching out regarding your file.`
        : `السلام عليكم ${client.name}، معكم فريق مسارك للإنجاز السياحي بخصوص ملفكم.`;
    openWhatsApp(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(hello)}`);
  };

  const handleOneClickVerifyAndSendOtp = (client: TravelerProfile) => {
    if (!client.verified) {
      updateTravelerProfileDetails(client.phone, {
        verified: true,
        verifiedAt: new Date().toISOString(),
      });
      loadTravelers();
    }
    handleSendActivationWhatsApp(client);
  };

  const handleToggleVerified = (client: TravelerProfile) => {
    updateTravelerProfileDetails(client.phone, {
      verified: !client.verified,
      verifiedAt: !client.verified ? new Date().toISOString() : undefined,
    });
    loadTravelers();
  };

  const handleSaveClientFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    updateTravelerProfileDetails(selectedClient.phone, {
      name: editName.trim() || selectedClient.name,
      passportFullName: editPassportFullName.trim(),
      passportNumber: editPassportNumber.trim().toUpperCase(),
      passportExpiryDate: editPassportExpiry,
      nationality: editNationality.trim(),
      orderStatus: editOrderStatus,
      adminNotes: editAdminNotes.trim(),
    });
    loadTravelers();
    setFolderSavedMsg(
      t('تم حفظ وتحديث ملف العميل بنجاح.', 'Client folder updated and saved successfully.')
    );
    setTimeout(() => setFolderSavedMsg(''), 3000);
  };

  const handleConfirmDeleteClient = (phone: string) => {
    deleteTravelerProfile(phone);
    setConfirmDeletePhone(null);
    if (selectedClientPhone === phone) {
      setSelectedClientPhone(null);
    }
    loadTravelers();
  };

  const handleSaveSiteContent = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = saveSiteConfig(siteDraft);
    setSiteDraft(updated);
    setContentSavedMsg(
      t(
        'تم حفظ وتطبيق الإعلان وتعديلات المحتوى مباشرة على الموقع.',
        'Announcement & site content changes applied live across the website.'
      )
    );
    setTimeout(() => setContentSavedMsg(''), 3500);
  };

  const handleResetSiteContent = () => {
    const defaults = resetSiteConfig();
    setSiteDraft(defaults);
    setContentSavedMsg(
      t('تمت استعادة الإعدادات الافتراضية للمحتوى.', 'Site content reset to defaults.')
    );
    setTimeout(() => setContentSavedMsg(''), 3000);
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeFeedback(null);
    if (newPinDraft.trim() !== confirmPinDraft.trim()) {
      setPinChangeFeedback({
        ok: false,
        text: t('الرمز السري الجديد وتأكيده غير متطابقين.', 'New PIN and confirmation do not match.'),
      });
      return;
    }
    const res = updateAdminPin(currentPinDraft, newPinDraft, lang);
    if (!res.ok) {
      setPinChangeFeedback({
        ok: false,
        text: res.error || t('تعذر تغيير الرمز السري.', 'Could not update Admin PIN.'),
      });
      return;
    }
    setCurrentPinDraft('');
    setNewPinDraft('');
    setConfirmPinDraft('');
    setPinChangeFeedback({
      ok: true,
      text: t('تم تغيير الرمز السري للإدارة وحفظه بنجاح.', 'Admin PIN updated and saved.'),
    });
  };

  const handleExportBackup = () => {
    const json = exportAllDataBackupJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `masarik-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setBackupMsg(
      t(
        'تم تصدير وتحميل النسخة الاحتياطية الكاملة بنجاح.',
        'Full JSON backup exported and downloaded successfully.'
      )
    );
    setTimeout(() => setBackupMsg(''), 3500);
  };

  const filteredClients = travelers.filter((tr) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      tr.name.toLowerCase().includes(q) ||
      tr.phone.includes(q) ||
      formatPhoneForDisplay(tr.phone).includes(q) ||
      (tr.passportNumber || '').toLowerCase().includes(q)
    );
  });

  const pendingCount = travelers.filter((tr) => !tr.verified).length;
  const verifiedCount = travelers.filter((tr) => tr.verified).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden text-start relative"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        {/* Header */}
        <div className="bg-[#0A1926] text-white px-4 sm:px-5 py-3.5 sm:py-4 flex items-center justify-between border-b-2 border-[#C6A052] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-[#E5C887] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate">
                {t('لوحة تحكم الإدارة — مسارك للإنجاز السياحي', 'Admin Dashboard — Masarik Tourism')}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-300 truncate">
                {t(
                  'إدارة ملفات العملاء، الجوازات والمستندات، الإعلانات وإعدادات النظام',
                  'Manage client folders, passport docs, site alerts & admin settings'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label={t('إغلاق لوحة الإدارة', 'Close Admin Dashboard')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* LOCK SCREEN (PIN ONLY) */}
        {!isUnlocked ? (
          <form onSubmit={handlePinSubmit} className="p-6 sm:p-8 max-w-sm mx-auto w-full space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h4 className="text-base font-black text-[#0F2438]">
                {t('الدخول السري للإدارة', 'Protected Admin Access')}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {t('أدخل الرمز السري للإدارة للمتابعة', 'Enter your Admin PIN to unlock')}
              </p>
            </div>

            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder={t('الرمز السري', 'Admin PIN')}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-center text-base font-bold tracking-widest text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C6A052]"
            />

            {pinError && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800 text-center">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="w-full min-h-[44px] py-2.5 px-4 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer"
            >
              {t('فتح لوحة تحكم الإدارة', 'Unlock Dashboard')}
            </button>
          </form>
        ) : (
          /* UNLOCKED 3-TAB DASHBOARD */
          <div className="flex flex-col flex-1 min-h-0">
            {/* 3 Navigation Tabs */}
            <div className="bg-slate-100 px-3 sm:px-5 py-2 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('clients');
                  setSelectedClientPhone(null);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'clients'
                    ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>{t('بيانات وملفات العملاء', 'Clients & Documents')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('content')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'content'
                    ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <Megaphone className="w-4 h-4 shrink-0" />
                <span>{t('الإعلانات والتنبيهات وتعديل المحتوى', 'Announcements & Content')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'settings'
                    ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>{t('إعدادات الإدارة', 'Admin Settings')}</span>
              </button>
            </div>

            {/* Tab Content Area */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
              {/* TAB 1: CLIENTS & DOCUMENTS DIRECTORY */}
              {activeTab === 'clients' && !selectedClient && (
                <>
                  {/* KPI Summary */}
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center tabular-nums">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[11px] text-slate-500 block">
                        {t('إجمالي العملاء', 'Total Clients')}
                      </span>
                      <span className="text-lg font-black text-[#0F2438]">{travelers.length}</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <span className="text-[11px] text-amber-800 block">
                        {t('غير موثق', 'Unverified')}
                      </span>
                      <span className="text-lg font-black text-amber-900">{pendingCount}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                      <span className="text-[11px] text-emerald-800 block">
                        {t('حسابات موثقة', 'Verified')}
                      </span>
                      <span className="text-lg font-black text-emerald-900">{verifiedCount}</span>
                    </div>
                  </div>

                  {/* Quick Add Client */}
                  <form
                    onSubmit={handleAdminAddClient}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-black text-[#0F2438]">
                      <UserPlus className="w-4 h-4 text-[#C6A052]" />
                      <span>
                        {t(
                          'إضافة عميل جديد وتوليد كود OTP ورابط تفعيل',
                          'Quick Add Client & Generate OTP + Magic Link'
                        )}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t('اسم العميل الكامل', 'Client Full Name')}
                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
                      />
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="01012345678"
                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438] tabular-nums"
                      />
                      <button
                        type="submit"
                        className="min-h-[38px] px-3 py-2 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap"
                      >
                        {t('إضافة وتوليد OTP', 'Add & Generate OTP')}
                      </button>
                    </div>
                  </form>

                  {/* Search */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t(
                        'ابحث بالاسم أو رقم الواتساب أو رقم جواز السفر...',
                        'Search by name, WhatsApp number, or passport number...'
                      )}
                      className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 text-xs text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  {/* Client Cards List */}
                  {filteredClients.length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6 text-center text-xs text-slate-500">
                      {t(
                        'لا توجد ملفات عملاء تطابق البحث حالياً.',
                        'No client profiles match your search.'
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredClients.map((client) => {
                        const docsCount = client.documents?.length || 0;
                        return (
                          <div
                            key={client.phone}
                            className="bg-white border border-slate-200 hover:border-[#C6A052]/70 rounded-2xl p-4 space-y-3 shadow-xs transition"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-black text-[#0F2438]">
                                    {client.name}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold flex items-center gap-1 border ${
                                      client.verified
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : 'bg-amber-50 border-amber-200 text-amber-800'
                                    }`}
                                  >
                                    {client.verified ? (
                                      <>
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>{t('موثق', 'Verified')}</span>
                                      </>
                                    ) : (
                                      <span>{t('غير موثق', 'Unverified')}</span>
                                    )}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10.5px] font-bold text-[#0F2438]">
                                    {translateOrderStatus(client.orderStatus, lang)}
                                  </span>
                                </div>

                                <div className="text-xs text-slate-600 tabular-nums flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                  <span>
                                    {t('واتساب:', 'WhatsApp:')}{' '}
                                    <strong className="text-[#0F2438]">
                                      {formatPhoneForDisplay(client.phone)}
                                    </strong>
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {t('رقم الجواز:', 'Passport No:')}{' '}
                                    <strong className="text-[#0F2438] uppercase">
                                      {client.passportNumber || t('غير مسجل', 'Not set')}
                                    </strong>
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {t('المستندات:', 'Docs:')}{' '}
                                    <strong className="text-[#0284C7]">{docsCount}</strong>
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDirectWhatsAppChat(client)}
                                  className="px-2.5 py-1.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                                  title={t('محادثة واتساب مباشرة', 'Direct WhatsApp Chat')}
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>{t('واتساب', 'WhatsApp')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setSelectedClientPhone(client.phone)}
                                  className="px-3 py-1.5 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[11px] font-black flex items-center gap-1.5 transition cursor-pointer"
                                >
                                  <FolderOpen className="w-3.5 h-3.5" />
                                  <span>{t('فتح ملف العميل', 'Open Folder')}</span>
                                </button>
                              </div>
                            </div>

                            {/* One-Click Verify / Send OTP Control for Unverified Clients */}
                            {!client.verified && (
                              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-amber-50/60 -mx-1 px-3 py-2 rounded-xl">
                                <span className="text-[11px] font-bold text-amber-900 tabular-nums">
                                  {t(`كود OTP الجاهز: ${client.otp}`, `Pending OTP: ${client.otp}`)}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOneClickVerifyAndSendOtp(client)}
                                    className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white text-[11px] font-black flex items-center gap-1.5 transition cursor-pointer"
                                  >
                                    <Send className="w-3 h-3" />
                                    <span>
                                      {t(
                                        'تفعيل الحساب / إرسال كود OTP',
                                        'Verify & Send OTP'
                                      )}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVerified(client)}
                                    className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-950 text-[11px] font-bold transition cursor-pointer"
                                  >
                                    {t('توثيق فوري فقط', 'Verify Now')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* TAB 1: FULL CLIENT FOLDER VIEW */}
              {activeTab === 'clients' && selectedClient && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSelectedClientPhone(null)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <BackArrow className="w-4 h-4" />
                      <span>{t('العودة لقائمة العملاء', 'Back to Clients Directory')}</span>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleVerified(selectedClient)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          selectedClient.verified
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                        }`}
                      >
                        {selectedClient.verified
                          ? t('حساب موثق ✓ (اضغط لإلغاء التوثيق)', 'Verified ✓ (Click to Revoke)')
                          : t('غير موثق (اضغط للتفعيل الفوري)', 'Unverified (Click to Verify)')}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDirectWhatsAppChat(selectedClient)}
                        className="px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{t('فتح شات واتساب', 'Open WhatsApp')}</span>
                      </button>
                    </div>
                  </div>

                  {/* OTP & Magic Activation Link Box */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-black text-[#0F2438]">
                        {t('تفعيل الحساب وكود OTP المباشر', 'Account Verification & Magic Link')}
                      </span>
                      <span className="font-bold text-[#0284C7] tabular-nums">
                        OTP: {selectedClient.otp}
                      </span>
                    </div>
                    <div
                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-600 truncate"
                      dir="ltr"
                    >
                      {buildActivationMagicLink(
                        selectedClient.phone,
                        selectedClient.otp,
                        selectedClient.name
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyActivationMsg(selectedClient)}
                        className="min-h-[38px] px-3 py-2 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {copiedPhone === selectedClient.phone ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{t('تم نسخ رسالة التفعيل!', 'Copied!')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#E5C887]" />
                            <span>{t('نسخ رسالة التفعيل (OTP + رابط)', 'Copy OTP + Magic Link')}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendActivationWhatsApp(selectedClient)}
                        className="min-h-[38px] px-3 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{t('إرسال الكود لواتساب العميل', 'Send OTP to Client WhatsApp')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Editable Client Info & Order Stage */}
                  <form
                    onSubmit={handleSaveClientFolder}
                    className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
                  >
                    <h4 className="text-xs sm:text-sm font-black text-[#0F2438]">
                      {t('تعديل بيانات العميل وحالة الطلب', 'Edit Client Details & Order Stage')}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('الاسم المسجل', 'Client Name')}
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('رقم جواز السفر', 'Passport Number')}
                        </label>
                        <input
                          type="text"
                          value={editPassportNumber}
                          onChange={(e) => setEditPassportNumber(e.target.value.toUpperCase())}
                          placeholder="A12345678"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums uppercase"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('الاسم بالجواز (لاتيني/عربي)', 'Full Name as on Passport')}
                        </label>
                        <input
                          type="text"
                          value={editPassportFullName}
                          onChange={(e) => setEditPassportFullName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('تاريخ انتهاء الجواز', 'Passport Expiry Date')}
                        </label>
                        <input
                          type="date"
                          value={editPassportExpiry}
                          onChange={(e) => setEditPassportExpiry(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('الجنسية', 'Nationality')}
                        </label>
                        <input
                          type="text"
                          value={editNationality}
                          onChange={(e) => setEditNationality(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('مرحلة طلب التأشيرة / تساهيل', 'Visa / Tasheer Order Stage')}
                        </label>
                        <select
                          value={editOrderStatus}
                          onChange={(e) => setEditOrderStatus(e.target.value as VisaOrderStatus)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-[#0F2438]"
                        >
                          {VISA_ORDER_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {translateOrderStatus(st, lang)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="text-xs">
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('ملاحظة الإدارة (تظهر داخل ملف المسافر)', 'Admin Note (Visible to Client)')}
                      </label>
                      <input
                        type="text"
                        value={editAdminNotes}
                        onChange={(e) => setEditAdminNotes(e.target.value)}
                        placeholder={t(
                          'مثال: موعد تساهيل يوم الثلاثاء 10 صباحاً - فرع شيراتون',
                          'e.g. Tasheer appointment Tuesday 10 AM'
                        )}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                      />
                    </div>

                    {folderSavedMsg && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                        {folderSavedMsg}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="submit"
                        className="min-h-[40px] px-4 py-2 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>{t('حفظ تعديلات ملف العميل', 'Save Client Folder')}</span>
                      </button>

                      {/* Inline Delete Confirmation */}
                      {confirmDeletePhone === selectedClient.phone ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-red-700">
                            {t('تأكيد الحذف؟', 'Confirm delete?')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleConfirmDeleteClient(selectedClient.phone)}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                          >
                            {t('حذف نهائي', 'Yes, Delete')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePhone(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                          >
                            {t('إلغاء', 'Cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePhone(selectedClient.phone)}
                          className="px-3 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('حذف ملف العميل', 'Delete Client')}</span>
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Client Uploaded Passport Photos & Documents Gallery */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <h4 className="text-xs sm:text-sm font-black text-[#0F2438]">
                      {t(
                        `مستندات وصور العميل المرفوعة (${selectedClient.documents?.length || 0})`,
                        `Uploaded Passport Photos & Documents (${selectedClient.documents?.length || 0})`
                      )}
                    </h4>

                    {selectedClient.documents && selectedClient.documents.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedClient.documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5"
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={doc.dataUrl}
                                alt={doc.label}
                                className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-black text-[#0F2438] block truncate">
                                  {doc.label}
                                </span>
                                <span className="text-[11px] text-slate-500 block truncate">
                                  {doc.fileName}
                                </span>
                                <span className="text-[10px] text-slate-400 block tabular-nums">
                                  {doc.uploadedAt?.slice(0, 10)}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewDocImage({ label: doc.label, dataUrl: doc.dataUrl })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{t('معاينة', 'Inspect')}</span>
                              </button>

                              <a
                                href={doc.dataUrl}
                                download={doc.fileName || `${selectedClient.phone}-${doc.docType}.jpg`}
                                className="px-2.5 py-1.5 rounded-lg bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[11px] font-bold flex items-center justify-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>{t('تحميل', 'Download')}</span>
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white border border-dashed border-slate-300 rounded-xl p-5 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5">
                        <FileText className="w-5 h-5 text-slate-400" />
                        <span>
                          {t(
                            'لم يقم العميل برفع أي صور أو مستندات بعد.',
                            'This client has not uploaded any passport scans or documents yet.'
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: ANNOUNCEMENTS, ALERTS & SITE CONTENT CONTROL */}
              {activeTab === 'content' && (
                <form onSubmit={handleSaveSiteContent} className="space-y-5">
                  {/* Announcement Banner Manager */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-black text-[#0F2438]">
                          {t(
                            'شريط الإعلانات والتنبيهات العاجلة أعلى الموقع',
                            'Top Site Announcement & Urgent Alert Banner'
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {t(
                            'يظهر فوراً أعلى شريط التصفح لجميع زوار المنصة عند تفعيله',
                            'Displays at the top of the navbar for all visitors when enabled'
                          )}
                        </p>
                      </div>

                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={siteDraft.announcementEnabled}
                          onChange={(e) =>
                            setSiteDraft((prev) => ({
                              ...prev,
                              announcementEnabled: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#0F2438] cursor-pointer"
                        />
                        <span
                          className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                            siteDraft.announcementEnabled
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {siteDraft.announcementEnabled
                            ? t('مفعّل الآن (ON)', 'Enabled (ON)')
                            : t('متوقف (OFF)', 'Disabled (OFF)')}
                        </span>
                      </label>
                    </div>

                    {/* Style Selector */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[#0F2438]">
                        {t('نمط ولون التنبيه:', 'Banner Style:')}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            {
                              id: 'gold',
                              label: t('عرض ذهبي مميز', 'Gold Promo'),
                              cls: 'bg-[#C6A052] text-[#0A1926]',
                            },
                            {
                              id: 'red',
                              label: t('تنبيه عاجل أحمر', 'Red Urgent Alert'),
                              cls: 'bg-red-700 text-white',
                            },
                            {
                              id: 'green',
                              label: t('إشعار أخضر', 'Green Info'),
                              cls: 'bg-emerald-700 text-white',
                            },
                          ] as { id: AnnouncementStyle; label: string; cls: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setSiteDraft((prev) => ({ ...prev, announcementStyle: opt.id }))
                            }
                            className={`px-3 py-2 rounded-xl text-xs font-black border-2 transition cursor-pointer ${opt.cls} ${
                              siteDraft.announcementStyle === opt.id
                                ? 'border-[#0F2438] ring-2 ring-[#0284C7]'
                                : 'border-transparent opacity-80 hover:opacity-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-[#0F2438] mb-1">
                          {t('نص الإعلان بالعربية', 'Announcement Text (Arabic)')}
                        </label>
                        <input
                          type="text"
                          value={siteDraft.announcementTextAr}
                          onChange={(e) =>
                            setSiteDraft((prev) => ({
                              ...prev,
                              announcementTextAr: e.target.value,
                            }))
                          }
                          placeholder="متاح الآن حجز مواعيد تساهيل VIP وعادي"
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-[#0F2438] mb-1">
                          {t('نص الإعلان بالإنجليزية', 'Announcement Text (English)')}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={siteDraft.announcementTextEn}
                          onChange={(e) =>
                            setSiteDraft((prev) => ({
                              ...prev,
                              announcementTextEn: e.target.value,
                            }))
                          }
                          placeholder="VFS Tasheer Standard & VIP Appointments Available Now"
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                        />
                      </div>
                    </div>

                    {/* Live Preview Strip */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 block">
                        {t('معاينة حية لشكل الشريط:', 'Live Banner Preview:')}
                      </span>
                      <div
                        className={`rounded-xl px-3 py-2 text-xs font-black text-center flex items-center justify-center gap-2 ${
                          siteDraft.announcementStyle === 'red'
                            ? 'bg-red-700 text-white'
                            : siteDraft.announcementStyle === 'green'
                            ? 'bg-emerald-700 text-white'
                            : 'bg-[#C6A052] text-[#0A1926]'
                        }`}
                      >
                        {siteDraft.announcementStyle === 'red' ? (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Megaphone className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {lang === 'en'
                            ? siteDraft.announcementTextEn || DEFAULT_SITE_CONFIG.announcementTextEn
                            : siteDraft.announcementTextAr || DEFAULT_SITE_CONFIG.announcementTextAr}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Site Content Overrides */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                    <h4 className="text-sm font-black text-[#0F2438]">
                      {t('تعديل سريع لبيانات التواصل والمحتوى الرئيسي', 'Quick Site Content Overrides')}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('رقم الهاتف والواتساب الرسمي', 'Contact Phone / WhatsApp Number')}
                        </label>
                        <input
                          type="tel"
                          dir="ltr"
                          value={siteDraft.phoneNumber}
                          onChange={(e) =>
                            setSiteDraft((prev) => ({ ...prev, phoneNumber: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('ساعات العمل (عربي)', 'Working Hours (Arabic)')}
                        </label>
                        <input
                          type="text"
                          value={siteDraft.workingHoursAr}
                          onChange={(e) =>
                            setSiteDraft((prev) => ({ ...prev, workingHoursAr: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('ساعات العمل (إنجليزي)', 'Working Hours (English)')}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={siteDraft.workingHoursEn}
                          onChange={(e) =>
                            setSiteDraft((prev) => ({ ...prev, workingHoursEn: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('العنوان الفرعي المميز بالرئيسية (عربي)', 'Featured Hero Subtitle (Arabic)')}
                        </label>
                        <input
                          type="text"
                          value={siteDraft.heroHighlightAr}
                          onChange={(e) =>
                            setSiteDraft((prev) => ({ ...prev, heroHighlightAr: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('العنوان الفرعي المميز بالرئيسية (إنجليزي)', 'Featured Hero Subtitle (English)')}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={siteDraft.heroHighlightEn}
                          onChange={(e) =>
                            setSiteDraft((prev) => ({ ...prev, heroHighlightEn: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                        />
                      </div>
                    </div>
                  </div>

                  {contentSavedMsg && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                      {contentSavedMsg}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="submit"
                      className="min-h-[42px] px-5 py-2.5 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>{t('حفظ وتطبيق التعديلات على الموقع', 'Save & Publish Changes')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetSiteContent}
                      className="min-h-[42px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{t('استعادة القيم الافتراضية', 'Reset Defaults')}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 3: ADMIN SETTINGS */}
              {activeTab === 'settings' && (
                <div className="space-y-5">
                  {/* Change Admin Access PIN */}
                  <form
                    onSubmit={handleChangePinSubmit}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-center gap-2 text-sm font-black text-[#0F2438]">
                      <KeyRound className="w-4 h-4 text-[#C6A052]" />
                      <span>{t('تغيير الرمز السري لدخول الإدارة (PIN)', 'Change Admin Access PIN')}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('الرمز السري الحالي', 'Current PIN')}
                        </label>
                        <input
                          type="password"
                          required
                          value={currentPinDraft}
                          onChange={(e) => setCurrentPinDraft(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('الرمز السري الجديد', 'New PIN')}
                        </label>
                        <input
                          type="password"
                          required
                          value={newPinDraft}
                          onChange={(e) => setNewPinDraft(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-600 mb-1">
                          {t('تأكيد الرمز الجديد', 'Confirm New PIN')}
                        </label>
                        <input
                          type="password"
                          required
                          value={confirmPinDraft}
                          onChange={(e) => setConfirmPinDraft(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
                        />
                      </div>
                    </div>

                    {pinChangeFeedback && (
                      <div
                        className={`p-2.5 rounded-xl border text-xs font-bold ${
                          pinChangeFeedback.ok
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        {pinChangeFeedback.text}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="min-h-[40px] px-4 py-2 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs font-black transition cursor-pointer"
                    >
                      {t('تحديث وحفظ الرمز السري', 'Update Admin PIN')}
                    </button>
                  </form>

                  {/* Export / Backup Data */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                    <h4 className="text-sm font-black text-[#0F2438]">
                      {t('نسخ احتياطي وتصدير بيانات العملاء (JSON)', 'Export & Backup All Client Records')}
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {t(
                        'قم بتنزيل ملف JSON يحتوي على جميع ملفات العملاء المسجلين وأرقام جوازاتهم وصور المستندات وإعدادات الموقع للنسخ الاحتياطي الآمن.',
                        'Download a structured JSON backup file containing all registered client records, passport numbers, documents, and site settings.'
                      )}
                    </p>

                    {backupMsg && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                        {backupMsg}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleExportBackup}
                      className="min-h-[42px] px-4 py-2.5 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {t(
                          `تصدير النسخة الاحتياطية (${travelers.length} عميل)`,
                          `Download Full JSON Backup (${travelers.length} clients)`
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full-Size Document Lightbox Preview */}
        {previewDocImage && (
          <div
            className="absolute inset-0 z-30 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-4"
            onClick={() => setPreviewDocImage(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0F2438] text-white px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-bold truncate">{previewDocImage.label}</span>
                <button
                  type="button"
                  onClick={() => setPreviewDocImage(null)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                  aria-label={t('إغلاق المعاينة', 'Close Preview')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[70vh] overflow-auto">
                <img
                  src={previewDocImage.dataUrl}
                  alt={previewDocImage.label}
                  className="max-h-[62vh] rounded-xl object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

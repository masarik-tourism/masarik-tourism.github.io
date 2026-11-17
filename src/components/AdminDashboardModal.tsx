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
} from 'lucide-react';
import { TravelerProfile, VisaOrderStatus } from '../types/travel';
import {
  VISA_ORDER_STATUSES,
  TRAVELERS_UPDATED_EVENT,
  buildActivationMagicLink,
  buildAdminForwardActivationMessage,
  formatPhoneForDisplay,
  getAllTravelers,
  normalizePhone,
  registerOrLoginTraveler,
  updateTravelerProfileDetails,
  verifyAdminPin,
} from '../utils/travelerStore';
import { translateOrderStatus } from '../data/travelData';
import { openWhatsApp } from '../utils/communication';
import { useLanguage } from '../contexts/LanguageContext';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
  const { lang, dir, t } = useLanguage();
  const [pinInput, setPinInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinError, setPinError] = useState('');

  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const loadTravelers = () => {
    const map = getAllTravelers();
    const list = Object.values(map).sort(
      (a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
    );
    setTravelers(list);
    const notes: Record<string, string> = {};
    list.forEach((tr) => {
      notes[tr.phone] = tr.adminNotes || '';
    });
    setNoteDrafts(notes);
  };

  useEffect(() => {
    if (isOpen) {
      loadTravelers();
      setPinError('');
    } else {
      setPinInput('');
    }
  }, [isOpen]);

  useEffect(() => {
    const onUpdate = () => loadTravelers();
    window.addEventListener(TRAVELERS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(TRAVELERS_UPDATED_EVENT, onUpdate);
  }, []);

  if (!isOpen) return null;

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdminPin(pinInput)) {
      setIsUnlocked(true);
      setPinError('');
      loadTravelers();
    } else {
      setPinError(t('رمز الإدارة غير صحيح.', 'Incorrect Admin PIN.'));
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
      // Ignore clipboard errors
    }
  };

  const handleSendToClientWhatsApp = (client: TravelerProfile) => {
    const msg = buildAdminForwardActivationMessage(client.name, client.phone, client.otp, lang);
    const phoneDigits = normalizePhone(client.phone);
    openWhatsApp(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`);
  };

  const handleStatusChange = (phone: string, status: VisaOrderStatus) => {
    updateTravelerProfileDetails(phone, { orderStatus: status });
    loadTravelers();
  };

  const handleSaveAdminNote = (phone: string) => {
    updateTravelerProfileDetails(phone, { adminNotes: (noteDrafts[phone] || '').trim() });
    loadTravelers();
  };

  const handleToggleVerified = (client: TravelerProfile) => {
    updateTravelerProfileDetails(client.phone, {
      verified: !client.verified,
      verifiedAt: !client.verified ? new Date().toISOString() : undefined,
    });
    loadTravelers();
  };

  const filtered = travelers.filter((tr) => {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden text-start"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        {/* Header */}
        <div className="bg-[#0A1926] text-white px-5 py-4 flex items-center justify-between border-b-2 border-[#C6A052] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-[#E5C887] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                {t('لوحة الإدارة — محمد يوسف', 'Admin Panel — Mohamed Youssef')}
              </h3>
              <p className="text-xs text-slate-300">
                {t(
                  'إدارة طلبات التفعيل عبر واتساب وتحديث مراحل التأشيرات وتساهيل',
                  'Manage WhatsApp activations, OTP links, and visa/Tasheer stages'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            aria-label={t('إغلاق لوحة الإدارة', 'Close Admin Panel')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isUnlocked ? (
          <form onSubmit={handlePinSubmit} className="p-6 max-w-sm mx-auto w-full space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h4 className="text-base font-black text-[#0F2438]">
                {t('الدخول السري للإدارة', 'Admin Access')}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {t('أدخل الرقم السري لإدارة مسارك للمتابعة', 'Enter Masarik Admin PIN to continue')}
              </p>
            </div>

            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder={t('الرقم السري', 'Admin PIN')}
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
              {t('فتح لوحة الإدارة', 'Unlock Admin Panel')}
            </button>
          </form>
        ) : (
          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* Summary Line */}
            <div className="grid grid-cols-3 gap-3 text-center tabular-nums">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[11px] text-slate-500 block">
                  {t('إجمالي العملاء', 'Total Clients')}
                </span>
                <span className="text-lg font-black text-[#0F2438]">{travelers.length}</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <span className="text-[11px] text-amber-800 block">
                  {t('بانتظار التفعيل', 'Pending Verification')}
                </span>
                <span className="text-lg font-black text-amber-900">{pendingCount}</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <span className="text-[11px] text-emerald-800 block">
                  {t('حسابات موثقة', 'Verified Accounts')}
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
                    'إضافة عميل جديد وتوليد كود ورابط تفعيل فوري',
                    'Add Client & Generate OTP + Magic Activation Link'
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('اسم العميل', 'Client Name')}
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
                  {t('توليد OTP ورابط تفعيل', 'Generate OTP & Link')}
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
                  'ابحث بالاسم أو رقم الواتساب أو رقم الجواز...',
                  'Search by name, WhatsApp number, or passport number...'
                )}
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 text-xs text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
              />
            </div>

            {/* Client List */}
            {filtered.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6 text-center text-xs text-slate-500">
                {t(
                  'لا توجد طلبات مسجلة تطابق البحث حالياً.',
                  'No registered travelers match your search.'
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((client) => {
                  const magicUrl = buildActivationMagicLink(client.phone, client.otp, client.name);
                  const isCopied = copiedPhone === client.phone;
                  return (
                    <div
                      key={client.phone}
                      className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-[#0F2438]">{client.name}</span>
                            <span
                              className={`text-[11px] font-bold flex items-center gap-1 ${
                                client.verified ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {client.verified ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{t('حساب موثق ✓', 'Verified ✓')}</span>
                                </>
                              ) : (
                                <span>{t('بانتظار التفعيل', 'Unverified')}</span>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 tabular-nums flex flex-wrap items-center gap-2">
                            <span>{formatPhoneForDisplay(client.phone)}</span>
                            <span>·</span>
                            <span>OTP: {client.otp}</span>
                            {client.passportNumber && (
                              <>
                                <span>·</span>
                                <span>
                                  {t('جواز:', 'Passport:')} {client.passportNumber}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleVerified(client)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-[#0F2438] cursor-pointer"
                          >
                            {client.verified
                              ? t('إلغاء التوثيق', 'Revoke Verification')
                              : t('توثيق يدوي', 'Verify Manually')}
                          </button>
                        </div>
                      </div>

                      <div
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-600 truncate"
                        dir="ltr"
                      >
                        {magicUrl}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyActivationMsg(client)}
                          className="min-h-[40px] px-3 py-2 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{t('تم نسخ رسالة التفعيل!', 'Activation Message Copied!')}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[#E5C887]" />
                              <span>{t('نسخ رسالة التفعيل (OTP + رابط)', 'Copy Activation (OTP + Link)')}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSendToClientWhatsApp(client)}
                          className="min-h-[40px] px-3 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{t('إرسال التفعيل لواتساب العميل', 'Send Activation to Client WhatsApp')}</span>
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {t('حالة طلب التأشيرة / تساهيل', 'Visa / Tasheer Order Status')}
                          </label>
                          <select
                            value={client.orderStatus}
                            onChange={(e) =>
                              handleStatusChange(client.phone, e.target.value as VisaOrderStatus)
                            }
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#0F2438]"
                          >
                            {VISA_ORDER_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {translateOrderStatus(st, lang)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {t('ملاحظة تظهر للعميل', 'Client-Visible Note')}
                          </label>
                          <input
                            type="text"
                            value={noteDrafts[client.phone] ?? ''}
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({
                                ...prev,
                                [client.phone]: e.target.value,
                              }))
                            }
                            placeholder={t(
                              'مثال: موعد تساهيل يوم الثلاثاء 10 ص',
                              'e.g. Tasheer appointment Tuesday 10 AM'
                            )}
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
                          />
                        </div>

                        <div className="sm:col-span-2 sm:self-end">
                          <button
                            type="button"
                            onClick={() => handleSaveAdminNote(client.phone)}
                            className="w-full min-h-[34px] px-3 py-2 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs font-black transition cursor-pointer"
                          >
                            {t('حفظ', 'Save')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

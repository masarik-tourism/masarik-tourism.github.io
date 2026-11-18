import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  X,
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
  Sparkles,
  Lock,
  UserCog,
  LogOut,
  FileUp,
  Loader2,
  ExternalLink,
  HardDrive,
  RefreshCw,
  QrCode,
} from 'lucide-react';
import {
  AdminPermission,
  AppointmentDetails,
  SubAdminAccount,
  TravelerProfile,
  VisaOrderStatus,
} from '../types/travel';
import { AppointmentQrPassModal } from './AppointmentQrPassModal';
import {
  VISA_ORDER_STATUSES,
  TRAVELERS_UPDATED_EVENT,
  adminCreateClientCloud,
  approveAndDeliverDocumentCloud,
  buildActivationMagicLink,
  buildAdminForwardActivationMessage,
  buildOrderCodeFromPhone,
  cleanupCompletedOrderAttachmentsCloud,
  computeStorageUsageStats,
  deleteTravelerProfile,
  exportAllDataBackupJson,
  formatPhoneForDisplay,
  getAllTravelers,
  getOrderStatusStageIndex,
  getRelationshipLabel,
  getTravelerDisplayNames,
  normalizeOrderStatusValue,
  normalizePhone,
  previewOldCompletedAttachmentsCleanup,
  removeIssuedDeliverableCloud,
  updateAdminPin,
  updateTravelerProfileDetails,
} from '../utils/travelerStore';
import {
  MAX_PDF_BYTES,
  buildDescriptiveFilename,
  downloadCloudFile,
  getDisplayableDriveImageUrl,
  getDriveViewUrl,
} from '../utils/firebaseStorageHelper';
import {
  ALL_ADMIN_PERMISSIONS,
  ADMIN_AUTH_UPDATED_EVENT,
  PERMISSION_LABELS,
  createSubAdmin,
  deleteSubAdmin,
  getSubAdmins,
  updateSubAdminPermissions,
} from '../utils/adminAuthStore';
import {
  AnnouncementStyle,
  DEFAULT_SITE_CONFIG,
  SiteConfig,
  getSiteConfig,
  resetSiteConfig,
  saveSiteConfig,
} from '../utils/siteConfigStore';
import {
  deleteCmsCustomItem,
  resetAllCmsOverrides,
  restoreCmsElement,
  useCmsState,
} from '../utils/cmsStore';
import { translateOrderStatus } from '../data/travelData';
import { openWhatsApp } from '../utils/communication';
import { useLanguage } from '../contexts/LanguageContext';
import { useAdmin } from '../contexts/AdminContext';

type DashboardTab = 'clients' | 'content' | 'settings';

export const AdminDashboardWorkspace: React.FC = () => {
  const { lang, isAr, dir, t } = useLanguage();
  const { session, isSuperAdmin, hasPermission, setAdminMode, logoutAdmin } = useAdmin();
  const cmsState = useCmsState();
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const canManageClients = hasPermission('manage_clients');
  const canActivateOtp = hasPermission('activate_otp');
  const canEditContent = hasPermission('edit_content');
  const canDeleteRecords = hasPermission('delete_records');

  const getDefaultTab = (): DashboardTab => {
    if (canManageClients || canActivateOtp) return 'clients';
    if (canEditContent) return 'content';
    return 'settings';
  };

  const [activeTab, setActiveTab] = useState<DashboardTab>(getDefaultTab);

  // Tab 1: Clients & Documents
  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Tab 1: Client Folder Detail
  const [selectedClientPhone, setSelectedClientPhone] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPassportFullName, setEditPassportFullName] = useState('');
  const [editPassportNumber, setEditPassportNumber] = useState('');
  const [editPassportExpiry, setEditPassportExpiry] = useState('');
  const [editNationality, setEditNationality] = useState('');
  const [editOrderStatus, setEditOrderStatus] = useState<VisaOrderStatus>('تم استلام الطلب');
  const [editAdminNotes, setEditAdminNotes] = useState('');
  const [editApptServiceType, setEditApptServiceType] = useState('');
  const [editApptDate, setEditApptDate] = useState('');
  const [editApptTime, setEditApptTime] = useState('');
  const [editApptLocation, setEditApptLocation] = useState('');
  const [editApptReference, setEditApptReference] = useState('');
  const [showAdminQrPreview, setShowAdminQrPreview] = useState(false);
  const [folderSavedMsg, setFolderSavedMsg] = useState('');
  const [stageUpdatedPhone, setStageUpdatedPhone] = useState<string | null>(null);
  const [confirmDeletePhone, setConfirmDeletePhone] = useState<string | null>(null);
  const [previewDocImage, setPreviewDocImage] = useState<{
    label: string;
    dataUrl: string;
    downloadName?: string;
  } | null>(null);

  // Final Completion Deliverable Upload State (Admin -> Client Account)
  const [deliverableTypeChoice, setDeliverableTypeChoice] = useState('تذكرة طيران');
  const [customDeliverableType, setCustomDeliverableType] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');
  const [deliverableFile, setDeliverableFile] = useState<File | null>(null);
  const [deliverablePreviewUrl, setDeliverablePreviewUrl] = useState<string | null>(null);
  const [isSendingDeliverable, setIsSendingDeliverable] = useState(false);
  const [deliverableFeedback, setDeliverableFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [confirmDeleteDeliverableId, setConfirmDeleteDeliverableId] = useState<string | null>(null);
  const [replacingDeliverable, setReplacingDeliverable] = useState<{
    id: string;
    docTypeLabel: string;
  } | null>(null);

  // Storage Quota Monitor & Old Completed Attachments Cleanup
  const [cleanupAgeDays, setCleanupAgeDays] = useState<60 | 90>(60);
  const [confirmCleanupStep, setConfirmCleanupStep] = useState(false);
  const [isCleaningStorage, setIsCleaningStorage] = useState(false);
  const [cleanupFeedback, setCleanupFeedback] = useState<string | null>(null);

  // Tab 2: Announcements & Site Content
  const [siteDraft, setSiteDraft] = useState<SiteConfig>(() => getSiteConfig());
  const [contentSavedMsg, setContentSavedMsg] = useState('');
  const [confirmResetCms, setConfirmResetCms] = useState(false);

  // Tab 3: Sub-Admins & Security Settings
  const [subAdmins, setSubAdmins] = useState<SubAdminAccount[]>(() => getSubAdmins());
  const [subName, setSubName] = useState('');
  const [subPin, setSubPin] = useState('');
  const [subPerms, setSubPerms] = useState<AdminPermission[]>(['manage_clients', 'activate_otp']);
  const [subAdminMsg, setSubAdminMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(null);

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
    loadTravelers();
    setSiteDraft(getSiteConfig());
    setSubAdmins(getSubAdmins());
    const onTravelersUpdate = () => loadTravelers();
    const onAuthUpdate = () => setSubAdmins(getSubAdmins());
    window.addEventListener(TRAVELERS_UPDATED_EVENT, onTravelersUpdate);
    window.addEventListener(ADMIN_AUTH_UPDATED_EVENT, onAuthUpdate);
    return () => {
      window.removeEventListener(TRAVELERS_UPDATED_EVENT, onTravelersUpdate);
      window.removeEventListener(ADMIN_AUTH_UPDATED_EVENT, onAuthUpdate);
    };
  }, []);

  const selectedClient = selectedClientPhone
    ? travelers.find((tr) => tr.phone === selectedClientPhone) || null
    : null;

  useEffect(() => {
    if (selectedClient) {
      const names = getTravelerDisplayNames(selectedClient);
      setEditFirstName(names.firstName);
      setEditLastName(names.lastName);
      setEditPassportFullName(selectedClient.passportFullName || '');
      setEditPassportNumber(selectedClient.passportNumber || '');
      setEditPassportExpiry(selectedClient.passportExpiryDate || '');
      setEditNationality(selectedClient.nationality || '');
      setEditOrderStatus(normalizeOrderStatusValue(selectedClient.orderStatus));
      setEditAdminNotes(selectedClient.adminNotes || '');
      setEditApptServiceType(
        selectedClient.appointmentDetails?.serviceType || selectedClient.preferredVisaType || ''
      );
      setEditApptDate(selectedClient.appointmentDetails?.appointmentDate || '');
      setEditApptTime(selectedClient.appointmentDetails?.appointmentTime || '');
      setEditApptLocation(selectedClient.appointmentDetails?.location || '');
      setEditApptReference(selectedClient.appointmentDetails?.referenceNumber || '');
      setShowAdminQrPreview(false);
      setFolderSavedMsg('');
      setConfirmDeletePhone(null);
      setDeliverableFile(null);
      setDeliverablePreviewUrl(null);
      setDeliverableNotes('');
      setCustomDeliverableType('');
      setDeliverableFeedback(null);
      setConfirmDeleteDeliverableId(null);
      setReplacingDeliverable(null);
    }
  }, [selectedClientPhone, travelers.length]);

  const handleAdminAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName.trim() || normalizePhone(newPhone).length < 8) return;
    await adminCreateClientCloud(newFirstName, newLastName, newPhone);
    setNewFirstName('');
    setNewLastName('');
    setNewPhone('');
    loadTravelers();
  };

  const handleCopyActivationMsg = async (client: TravelerProfile) => {
    const displayName = getTravelerDisplayNames(client).fullDisplayName;
    const msg = buildAdminForwardActivationMessage(displayName, client.phone, client.otp, lang);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedPhone(client.phone);
      setTimeout(() => setCopiedPhone(null), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleSendActivationWhatsApp = (client: TravelerProfile) => {
    const displayName = getTravelerDisplayNames(client).fullDisplayName;
    const msg = buildAdminForwardActivationMessage(displayName, client.phone, client.otp, lang);
    const phoneDigits = client.phoneNormalized || normalizePhone(client.phone);
    openWhatsApp(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`);
  };

  const handleDirectWhatsAppChat = (client: TravelerProfile) => {
    const displayName = getTravelerDisplayNames(client).fullDisplayName;
    const phoneDigits = client.phoneNormalized || normalizePhone(client.phone);
    const hello =
      lang === 'en'
        ? `Hello ${displayName}, Masarik Tourism team is reaching out regarding your file.`
        : `السلام عليكم ${displayName}، معكم فريق مسارك للإنجاز السياحي بخصوص ملفكم.`;
    openWhatsApp(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(hello)}`);
  };

  const handleOneClickVerifyAndSendOtp = (client: TravelerProfile) => {
    if (!canActivateOtp) return;
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
    if (!canActivateOtp) return;
    updateTravelerProfileDetails(client.phone, {
      verified: !client.verified,
      verifiedAt: !client.verified ? new Date().toISOString() : undefined,
    });
    loadTravelers();
  };

  const handleOneClickOrderStageUpdate = (
    client: TravelerProfile,
    nextStatus: VisaOrderStatus
  ) => {
    if (!canManageClients) return;
    const normalized = normalizeOrderStatusValue(nextStatus);
    updateTravelerProfileDetails(client.phone, {
      orderStatus: normalized,
    });
    if (selectedClientPhone === client.phone) {
      setEditOrderStatus(normalized);
      setFolderSavedMsg(
        t(
          `تم تحديث مرحلة الطلب إلى: ${translateOrderStatus(normalized, lang)}`,
          `Stage updated to: ${translateOrderStatus(normalized, lang)}`
        )
      );
      setTimeout(() => setFolderSavedMsg(''), 2500);
    }
    setStageUpdatedPhone(client.phone);
    setTimeout(() => {
      setStageUpdatedPhone((prev) => (prev === client.phone ? null : prev));
    }, 1800);
    loadTravelers();
  };

  const handleSaveClientFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !canManageClients) return;
    const cleanFirst = editFirstName.trim();
    const cleanLast = editLastName.trim();
    const combinedName = `${cleanFirst} ${cleanLast}`.trim() || selectedClient.name;

    const cleanApptDate = editApptDate.trim();
    const cleanApptTime = editApptTime.trim();
    const cleanApptType = editApptServiceType.trim();
    const cleanApptLocation = editApptLocation.trim();
    const cleanApptRef = editApptReference.trim();

    const nextAppointmentDetails: AppointmentDetails | undefined =
      cleanApptDate || cleanApptTime || cleanApptLocation || cleanApptRef
        ? {
            serviceType:
              cleanApptType ||
              selectedClient.preferredVisaType ||
              'موعد خدمة سياحية',
            appointmentDate: cleanApptDate,
            appointmentTime: cleanApptTime,
            ...(cleanApptLocation ? { location: cleanApptLocation } : {}),
            ...(cleanApptRef ? { referenceNumber: cleanApptRef } : {}),
            updatedAt: new Date().toISOString(),
          }
        : undefined;

    updateTravelerProfileDetails(selectedClient.phone, {
      firstName: cleanFirst,
      lastName: cleanLast,
      name: combinedName,
      passportFullName: editPassportFullName.trim(),
      passportNumber: editPassportNumber.trim().toUpperCase(),
      passportExpiryDate: editPassportExpiry,
      nationality: editNationality.trim(),
      orderStatus: editOrderStatus,
      adminNotes: editAdminNotes.trim(),
      appointmentDetails: nextAppointmentDetails,
    });
    loadTravelers();
    setFolderSavedMsg(
      t('تم حفظ وتحديث ملف العميل وبيانات الموعد بنجاح.', 'Client folder & appointment details saved successfully.')
    );
    setTimeout(() => setFolderSavedMsg(''), 3000);
  };

  const handleConfirmDeleteClient = (phone: string) => {
    if (!canDeleteRecords) return;
    deleteTravelerProfile(phone);
    setConfirmDeletePhone(null);
    if (selectedClientPhone === phone) {
      setSelectedClientPhone(null);
    }
    loadTravelers();
  };

  const handleSelectDeliverableFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDeliverableFeedback(null);
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf && file.size > MAX_PDF_BYTES) {
      e.target.value = '';
      if (deliverablePreviewUrl) {
        URL.revokeObjectURL(deliverablePreviewUrl);
      }
      setDeliverableFile(null);
      setDeliverablePreviewUrl(null);
      setDeliverableFeedback({
        ok: false,
        text: t(
          'حجم ملف PDF يتجاوز الحد الأقصى المسموح (5 ميجابايت). يرجى تقليل حجم الملف ثم المحاولة مرة أخرى.',
          'PDF exceeds the maximum 5 MB limit. Please compress the file and try again.'
        ),
      });
      return;
    }

    if (deliverablePreviewUrl) {
      URL.revokeObjectURL(deliverablePreviewUrl);
    }
    setDeliverableFile(file);
    if (file.type.startsWith('image/')) {
      setDeliverablePreviewUrl(URL.createObjectURL(file));
    } else {
      setDeliverablePreviewUrl(null);
    }
  };

  const handleStartReplaceDeliverable = (docId: string, docTypeLabel: string) => {
    setReplacingDeliverable({ id: docId, docTypeLabel });
    const presetValues = [
      'تذكرة طيران',
      'موعد تساهيل',
      'كشف طبي جامكا',
      'تأشيرة',
      'شهادة تطعيم',
      'حجز فندق مؤكد',
      'تأمين طبي وإيصال إنجاز',
    ];
    if (presetValues.includes(docTypeLabel)) {
      setDeliverableTypeChoice(docTypeLabel);
      setCustomDeliverableType('');
    } else {
      setDeliverableTypeChoice('__custom__');
      setCustomDeliverableType(docTypeLabel);
    }
    setDeliverableFeedback(null);
  };

  const handleApproveAndDeliverDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !canManageClients) return;
    setDeliverableFeedback(null);

    const effectiveDocType =
      deliverableTypeChoice === '__custom__'
        ? customDeliverableType.trim()
        : deliverableTypeChoice.trim();

    if (!effectiveDocType) {
      setDeliverableFeedback({
        ok: false,
        text: t('يرجى اختيار أو كتابة نوع المستند أولاً.', 'Please specify the document type first.'),
      });
      return;
    }
    if (!deliverableFile) {
      setDeliverableFeedback({
        ok: false,
        text: t(
          'يرجى اختيار ملف المستند (PDF بحد أقصى 5 ميجابايت أو صورة) أولاً.',
          'Please select a PDF (max 5 MB) or image file first.'
        ),
      });
      return;
    }

    const wasReplacing = Boolean(replacingDeliverable);
    setIsSendingDeliverable(true);
    try {
      const res = await approveAndDeliverDocumentCloud(selectedClient.phone, {
        file: deliverableFile,
        docTypeLabel: effectiveDocType,
        notes: deliverableNotes.trim() || undefined,
        adminName: session?.name || 'المدير العام',
        ...(replacingDeliverable ? { replaceDocId: replacingDeliverable.id } : {}),
      });
      if (!res.ok) {
        setDeliverableFeedback({
          ok: false,
          text:
            res.error ||
            t(
              'تعذر رفع المستند. يرجى المحاولة مرة أخرى.',
              'Could not upload deliverable document. Please try again.'
            ),
        });
        return;
      }

      if (deliverablePreviewUrl) {
        URL.revokeObjectURL(deliverablePreviewUrl);
      }
      setDeliverableFile(null);
      setDeliverablePreviewUrl(null);
      setDeliverableNotes('');
      setCustomDeliverableType('');
      setReplacingDeliverable(null);
      setEditOrderStatus('تم تنفيذ الطلب');
      loadTravelers();
      setDeliverableFeedback({
        ok: true,
        text: wasReplacing
          ? t(
              `تم استبدال وتحديث المستند (${effectiveDocType}) في حساب العميل بنجاح وحذف النسخة القديمة لتوفير المساحة.`,
              `Document (${effectiveDocType}) replaced cleanly in client account and old file deleted.`
            )
          : t(
              `تم اعتماد وإرسال المستند (${effectiveDocType}) للعميل وتحديث حالة الطلب تلقائياً إلى "تم تنفيذ الطلب".`,
              `Document (${effectiveDocType}) approved & sent to client! Order status updated to "Order Executed & Completed".`
            ),
      });
    } finally {
      setIsSendingDeliverable(false);
    }
  };

  const handleRemoveIssuedDeliverable = async (docId: string) => {
    if (!selectedClient || !canManageClients) return;
    await removeIssuedDeliverableCloud(selectedClient.phone, docId);
    setConfirmDeleteDeliverableId(null);
    if (replacingDeliverable?.id === docId) {
      setReplacingDeliverable(null);
    }
    loadTravelers();
  };

  const handleRunStorageCleanup = async () => {
    if (!canManageClients && !isSuperAdmin) return;
    setIsCleaningStorage(true);
    setCleanupFeedback(null);
    try {
      const res = await cleanupCompletedOrderAttachmentsCloud(cleanupAgeDays);
      setConfirmCleanupStep(false);
      loadTravelers();
      const freedText = formatStorageSize(res.freedBytes);
      setCleanupFeedback(
        res.deletedFilesCount > 0
          ? t(
              `تم تنظيف ${res.deletedFilesCount} مرفق من ${res.cleanedOrdersCount} طلب مكتمل أقدم من ${cleanupAgeDays} يوماً، وتحرير مساحة (${freedText}) مع الحفاظ التام على سجلات العملاء.`,
              `Cleaned ${res.deletedFilesCount} attachment(s) from ${res.cleanedOrdersCount} completed orders older than ${cleanupAgeDays} days (freed ${freedText}) while keeping all client records intact.`
            )
          : t(
              `لا توجد مرفقات طلبات مكتملة أقدم من ${cleanupAgeDays} يوماً تحتاج إلى حذف حالياً.`,
              `No completed order attachments older than ${cleanupAgeDays} days found to clean.`
            )
      );
      setTimeout(() => setCleanupFeedback(null), 6000);
    } finally {
      setIsCleaningStorage(false);
    }
  };

  const handleSaveSiteContent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditContent) return;
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
    if (!canEditContent) return;
    const defaults = resetSiteConfig();
    setSiteDraft(defaults);
    setContentSavedMsg(
      t('تمت استعادة الإعدادات الافتراضية للمحتوى.', 'Site content reset to defaults.')
    );
    setTimeout(() => setContentSavedMsg(''), 3000);
  };

  const handleToggleNewSubPerm = (perm: AdminPermission) => {
    setSubPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleAddSubAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setSubAdminMsg(null);
    const res = createSubAdmin(subName, subPin, subPerms, lang);
    if (!res.ok) {
      setSubAdminMsg({
        ok: false,
        text: res.error || t('تعذر إضافة المدير المساعد.', 'Could not add sub-admin.'),
      });
      return;
    }
    setSubName('');
    setSubPin('');
    setSubPerms(['manage_clients', 'activate_otp']);
    setSubAdmins(getSubAdmins());
    setSubAdminMsg({
      ok: true,
      text: t('تم إضافة المدير المساعد وتعيين صلاحياته بنجاح.', 'Sub-admin added successfully.'),
    });
  };

  const handleToggleExistingSubPerm = (sa: SubAdminAccount, perm: AdminPermission) => {
    if (!isSuperAdmin) return;
    const next = sa.permissions.includes(perm)
      ? sa.permissions.filter((p) => p !== perm)
      : [...sa.permissions, perm];
    setSubAdmins(updateSubAdminPermissions(sa.id, next));
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
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
      text: t('تم تغيير الرمز السري للمدير العام بنجاح.', 'General Manager PIN updated.'),
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
        'تم تصدير وتحميل النسخة الاحتياطية الكاملة بنجاح (العملاء + تعديلات الموقع).',
        'Full JSON backup exported (clients + live CMS edits).'
      )
    );
    setTimeout(() => setBackupMsg(''), 3500);
  };

  const formatStorageSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ${isAr ? 'جيجابايت' : 'GB'}`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} ${isAr ? 'ميجابايت' : 'MB'}`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} ${isAr ? 'كيلوبايت' : 'KB'}`;
  };

  const filteredClients = travelers.filter((tr) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const orderCode = (tr.orderCode || buildOrderCodeFromPhone(tr.phone)).toLowerCase();
    return (
      tr.name.toLowerCase().includes(q) ||
      tr.phone.includes(q) ||
      formatPhoneForDisplay(tr.phone).includes(q) ||
      orderCode.includes(q) ||
      (tr.passportNumber || '').toLowerCase().includes(q)
    );
  });

  const pendingCount = travelers.filter((tr) => !tr.verified).length;
  const verifiedCount = travelers.filter((tr) => tr.verified).length;
  const overrideTextCount = Object.keys(cmsState.textOverrides).length;
  const storageStats = computeStorageUsageStats(travelers);
  const cleanupPreview = previewOldCompletedAttachmentsCleanup(travelers, cleanupAgeDays);

  return (
    <div className="min-h-screen bg-[#F1F5F9] pb-24 md:pb-16 text-[#0F2438]" dir={dir}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-5 space-y-5">
        {/* Full-Page Workspace Hero Header */}
        <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] text-white rounded-2xl p-4 sm:p-6 border border-[#C6A052]/60 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#C6A052]/20 border border-[#C6A052] text-[#E5C887] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#C6A052] text-[#0A1926] text-[11px] font-black">
                  {isSuperAdmin
                    ? t('المدير العام', 'General Manager')
                    : t(`مدير مساعد · ${session?.name || ''}`, `Sub-Admin · ${session?.name || ''}`)}
                </span>
                <h1 className="text-base sm:text-xl font-black text-white">
                  {t('لوحة الإدارة الشاملة — مسارك للإنجاز السياحي', 'Full Admin Workspace — Masarik Tourism')}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {(session?.permissions || []).map((p) => (
                  <span
                    key={p}
                    className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10.5px] font-bold text-[#E5C887]"
                  >
                    {lang === 'en' ? PERMISSION_LABELS[p].en : PERMISSION_LABELS[p].ar}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAdminMode('live_editor')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center gap-2 shadow-sm transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {canEditContent
                  ? t('معاينة الموقع والتعديل المباشر', 'Live Site Editor')
                  : t('معاينة الموقع', 'Preview Website')}
              </span>
            </button>

            <button
              type="button"
              onClick={logoutAdmin}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-red-600/90 text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('خروج من الإدارة', 'Logout')}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
          {(canManageClients || canActivateOtp) && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('clients');
                setSelectedClientPhone(null);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'clients'
                  ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>{t('بيانات وملفات العملاء', 'Clients & Documents')}</span>
            </button>
          )}

          {canEditContent && (
            <button
              type="button"
              onClick={() => setActiveTab('content')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'content'
                  ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Megaphone className="w-4 h-4 shrink-0" />
              <span>{t('الإعلانات وتعديلات الموقع', 'Announcements & Site CMS')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>
              {isSuperAdmin
                ? t('إعدادات الإدارة والمديرين', 'Admin Settings & Sub-Admins')
                : t('إعدادات الحساب والنسخ الاحتياطي', 'Settings & Backup')}
            </span>
          </button>
        </div>

        {/* TAB 1: CLIENTS & DOCUMENTS */}
        {activeTab === 'clients' && (canManageClients || canActivateOtp) && !selectedClient && (
          <div className="space-y-5">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-3 text-center tabular-nums">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <span className="text-xs text-slate-500 block font-semibold">
                  {t('إجمالي العملاء', 'Total Clients')}
                </span>
                <span className="text-2xl font-black text-[#0F2438]">{travelers.length}</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-xs">
                <span className="text-xs text-amber-800 block font-semibold">
                  {t('بانتظار التفعيل', 'Unverified')}
                </span>
                <span className="text-2xl font-black text-amber-900">{pendingCount}</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-xs">
                <span className="text-xs text-emerald-800 block font-semibold">
                  {t('حسابات موثقة', 'Verified')}
                </span>
                <span className="text-2xl font-black text-emerald-900">{verifiedCount}</span>
              </div>
            </div>

            {/* Storage Monitor & Smart Cleanup Card (15 GB Google Drive Free Quota) */}
            {(isSuperAdmin || canManageClients) && (
              <div
                className={`bg-white rounded-2xl p-4 sm:p-5 border-2 shadow-xs space-y-4 ${
                  storageStats.isNearLimit ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        storageStats.isNearLimit
                          ? 'bg-red-600 text-white'
                          : 'bg-[#0F2438] text-[#E5C887]'
                      }`}
                    >
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                          {t(
                            'مراقبة مساحة الملفات (من أصل 15 جيجابايت - Google Drive)',
                            'Storage Monitor (15 GB Google Drive Free Limit)'
                          )}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-black tabular-nums ${
                            storageStats.isNearLimit
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {storageStats.usagePercent}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                        {t(
                          `المساحة المستخدمة حالياً: ${formatStorageSize(storageStats.usedBytes)} من أصل 15 جيجابايت · إجمالي الملفات: ${storageStats.totalFilesCount} (${storageStats.deliverablesCount} مستند تنفيذ + ${storageStats.vaultFilesCount} ملف عميل)`,
                          `Used: ${formatStorageSize(storageStats.usedBytes)} / 15 GB · Total files: ${storageStats.totalFilesCount} (${storageStats.deliverablesCount} deliverables + ${storageStats.vaultFilesCount} client vault files)`
                        )}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl shrink-0">
                    {t(
                      'Google Drive المجاني · PDF <= 5 ميجا · ضغط الصور < 500 ك.ب',
                      'Google Drive Free · PDF <= 5 MB · Images < 500 KB'
                    )}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        storageStats.usagePercent >= 80
                          ? 'bg-red-600'
                          : storageStats.usagePercent >= 60
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.max(storageStats.usedBytes > 0 ? 2 : 0, storageStats.usagePercent)}%` }}
                    />
                  </div>
                </div>

                {/* >= 80% Auto Warning Banner */}
                {storageStats.isNearLimit && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-xs font-black text-red-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      {t(
                        'تنبيه تحذيري: مساحة التخزين السحابي تجاوزت 80% من الحد المجاني (15 GB على Google Drive). يُنصح بتنظيف مرفقات الطلبات القديمة المكتملة الآن.',
                        'Warning: Cloud storage usage exceeded 80% of the 15 GB Google Drive free quota. Clean up old completed order attachments below.'
                      )}
                    </span>
                  </div>
                )}

                {/* Smart 1-Click Cleanup Tool for Old Completed Orders */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-xs font-black text-[#0F2438] block">
                      {t('تنظيف مرفقات الطلبات القديمة المكتملة', 'Clean Up Old Completed Order Attachments')}
                    </span>
                    <p className="text-[11px] text-slate-600 leading-relaxed tabular-nums">
                      {t(
                        `العناصر المؤهلة (أقدم من ${cleanupAgeDays} يوماً): ${cleanupPreview.eligibleOrdersCount} طلب مكتمل (${cleanupPreview.eligibleFilesCount} ملف · ~${formatStorageSize(cleanupPreview.estimatedFreedBytes)}) — تُحذف المرفقات فقط مع الاحتفاظ الكامل ببيانات وسجلات العملاء.`,
                        `Eligible (> ${cleanupAgeDays} days): ${cleanupPreview.eligibleOrdersCount} completed orders (${cleanupPreview.eligibleFilesCount} files · ~${formatStorageSize(cleanupPreview.estimatedFreedBytes)}) — removes attachments only while keeping all client records.`
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="inline-flex rounded-xl border border-slate-300 bg-white p-0.5 text-[11px] font-black">
                      <button
                        type="button"
                        onClick={() => {
                          setCleanupAgeDays(60);
                          setConfirmCleanupStep(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                          cleanupAgeDays === 60
                            ? 'bg-[#0F2438] text-[#E5C887]'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {t('أقدم من 60 يوم', '60+ Days')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCleanupAgeDays(90);
                          setConfirmCleanupStep(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                          cleanupAgeDays === 90
                            ? 'bg-[#0F2438] text-[#E5C887]'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {t('أقدم من 90 يوم', '90+ Days')}
                      </button>
                    </div>

                    {confirmCleanupStep ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isCleaningStorage}
                          onClick={() => void handleRunStorageCleanup()}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                        >
                          {isCleaningStorage && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>{t('تأكيد حذف المرفقات القديمة', 'Confirm Cleanup')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCleanupStep(false)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                        >
                          {t('إلغاء', 'Cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCleanupStep(true)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t('تنظيف المرفقات القديمة الآن', 'Clean Up Now')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {cleanupFeedback && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{cleanupFeedback}</span>
                  </div>
                )}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(
                  'ابحث بالاسم أو رقم الطلب (MSK-...) أو رقم الواتساب أو رقم جواز السفر...',
                  'Search by name, Order Code (MSK-...), WhatsApp number, or passport number...'
                )}
                className="w-full ps-10 pe-4 py-3 rounded-2xl border border-slate-300 bg-white text-xs sm:text-sm text-[#0F2438] shadow-xs focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
              />
            </div>

            {/* Client Directory Grid */}
            {filteredClients.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs sm:text-sm text-slate-500">
                {t('لا توجد ملفات عملاء تطابق البحث حالياً.', 'No client records match your search.')}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredClients.map((client) => {
                  const docsCount = client.documents?.length || 0;
                  const clientDisplayName = getTravelerDisplayNames(client).fullDisplayName;
                  return (
                    <div
                      key={client.phone}
                      onClick={() => {
                        if (canManageClients) setSelectedClientPhone(client.phone);
                      }}
                      className={`bg-white border border-slate-200 hover:border-[#C6A052]/80 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs transition flex flex-col justify-between ${
                        canManageClients ? 'cursor-pointer hover:shadow-md' : ''
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0">
                            {client.avatarUrl ? (
                              <img
                                src={client.avatarUrl}
                                alt={clientDisplayName}
                                loading="lazy"
                                decoding="async"
                                className="w-11 h-11 rounded-full object-cover border-2 border-[#C6A052] shrink-0 bg-slate-100"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-full bg-[#0F2438] text-[#E5C887] border border-[#C6A052]/60 flex items-center justify-center text-sm font-black shrink-0">
                                {clientDisplayName.slice(0, 1) || 'م'}
                              </div>
                            )}

                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm sm:text-base font-black text-[#0F2438]">
                                  {clientDisplayName}
                                </span>
                                <span
                                  className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10.5px] font-black text-[#0F2438] tabular-nums"
                                  dir="ltr"
                                >
                                  {client.orderCode || buildOrderCodeFromPhone(client.phone)}
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
                              </div>

                              <div className="text-xs text-slate-600 tabular-nums flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <span>
                                  {t('واتساب:', 'WhatsApp:')}{' '}
                                  <strong className="text-[#0F2438]">
                                    {formatPhoneForDisplay(client.phone)}
                                  </strong>{' '}
                                  <span className="text-[10.5px] text-slate-400">
                                    (+{client.phoneNormalized || normalizePhone(client.phone)})
                                  </span>
                                </span>
                                {canManageClients && (
                                  <>
                                    <span>·</span>
                                    <span>
                                      {t('الجواز:', 'Passport:')}{' '}
                                      <strong className="text-[#0F2438] uppercase">
                                        {client.passportNumber || t('غير مسجل', 'Not set')}
                                      </strong>
                                    </span>
                                    <span>·</span>
                                    <span>
                                      {t('المستندات:', 'Docs:')}{' '}
                                      <strong className="text-[#0284C7]">{docsCount}</strong>
                                    </span>
                                    {(client.familyMembers?.length || 0) > 0 && (
                                      <>
                                        <span>·</span>
                                        <span className="px-2 py-0.5 rounded-full bg-[#C6A052]/20 border border-[#C6A052]/50 text-[#0F2438] text-[10.5px] font-black">
                                          {t(
                                            `أفراد العائلة: ${client.familyMembers?.length}`,
                                            `Family: ${client.familyMembers?.length}`
                                          )}
                                        </span>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold shrink-0 inline-flex items-center gap-1 ${
                              client.orderStatus === 'تم تنفيذ الطلب' ||
                              client.orderStatus === 'مكتمل'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-slate-100 border-slate-200 text-[#0F2438]'
                            }`}
                          >
                            {(client.orderStatus === 'تم تنفيذ الطلب' ||
                              client.orderStatus === 'مكتمل') && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            )}
                            <span>{translateOrderStatus(client.orderStatus, lang)}</span>
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {canManageClients && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-50 border border-slate-200/90 rounded-xl p-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 px-1">
                              <span className="text-[10.5px] font-black text-slate-600">
                                {t('تحديث حالة الطلب بضغطة واحدة:', '1-Click Stage Update:')}
                              </span>
                              {stageUpdatedPhone === client.phone && (
                                <span className="text-[10.5px] font-black text-emerald-700">
                                  {t('تم التحديث ✓', 'Updated ✓')}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                              {VISA_ORDER_STATUSES.map((st, idx) => {
                                const activeIdx = getOrderStatusStageIndex(client.orderStatus);
                                const isCurrent = idx === activeIdx;
                                const isPast = idx < activeIdx;
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOneClickOrderStageUpdate(client, st);
                                    }}
                                    className={`px-2 py-1.5 rounded-lg text-[10.5px] font-bold border transition cursor-pointer text-center leading-tight min-h-[34px] ${
                                      isCurrent
                                        ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438] shadow-xs'
                                        : isPast
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-[#C6A052] hover:text-[#0F2438]'
                                    }`}
                                  >
                                    <span className="block tabular-nums">
                                      {idx + 1}. {translateOrderStatus(st, lang)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirectWhatsAppChat(client);
                            }}
                            className="px-3 py-2 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>{t('واتساب', 'WhatsApp')}</span>
                          </button>

                          {canManageClients ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedClientPhone(client.phone);
                              }}
                              className="flex-1 px-3 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>{t('فتح ملف العميل والمستندات', 'Open Client Folder')}</span>
                            </button>
                          ) : (
                            <span className="flex-1 px-3 py-2 rounded-xl bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center gap-1.5">
                              <Lock className="w-3.5 h-3.5" />
                              <span>{t('ملف المستندات مقفل', 'Client Files Locked')}</span>
                            </span>
                          )}
                        </div>

                        {canActivateOtp && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`flex flex-wrap items-center justify-between gap-2 border px-3 py-2 rounded-xl ${
                              client.verified
                                ? 'bg-slate-50 border-slate-200'
                                : 'bg-amber-50 border-amber-200/80'
                            }`}
                          >
                            <span className="text-[11px] font-bold text-[#0F2438] tabular-nums">
                              {t('كود التفعيل:', 'OTP:')} {client.otp}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOneClickVerifyAndSendOtp(client);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white text-[11px] font-black flex items-center gap-1 transition cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                <span>
                                  {t(
                                    'إرسال الكود يدوياً بضغطة واحدة عبر واتساب',
                                    'Send OTP Manually via WhatsApp (1-Click)'
                                  )}
                                </span>
                              </button>
                              {!client.verified && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleVerified(client);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 text-[11px] font-bold cursor-pointer"
                                >
                                  {t('توثيق فوري', 'Verify Now')}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Add Client Form placed cleanly below Registered Clients Directory */}
            <form
              onSubmit={handleAdminAddClient}
              className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs"
            >
              <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-[#0F2438]">
                <UserPlus className="w-4 h-4 text-[#C6A052]" />
                <span>
                  {t(
                    'إضافة عميل جديد وتوليد كود OTP ورابط تفعيل مباشر',
                    'Add Client & Generate OTP + Magic Activation Link'
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <input
                  type="text"
                  required
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder={t('الاسم الأول', 'First Name')}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm text-[#0F2438]"
                />
                <input
                  type="text"
                  required
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder={t('الاسم الأخير', 'Last Name')}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm text-[#0F2438]"
                />
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="01012345678"
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm text-[#0F2438] tabular-nums"
                />
                <button
                  type="submit"
                  className="min-h-[42px] px-4 py-2.5 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer"
                >
                  {t('إضافة وتوليد OTP', 'Add & Generate OTP')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 1: FULL CLIENT FOLDER VIEW */}
        {activeTab === 'clients' && canManageClients && selectedClient && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedClientPhone(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <BackArrow className="w-4 h-4" />
                  <span>{t('العودة لقائمة العملاء', 'Back to Clients Directory')}</span>
                </button>

                <div className="flex items-center gap-2.5">
                  {selectedClient.avatarUrl ? (
                    <img
                      src={selectedClient.avatarUrl}
                      alt={getTravelerDisplayNames(selectedClient).fullDisplayName}
                      loading="lazy"
                      decoding="async"
                      className="w-10 h-10 rounded-full object-cover border-2 border-[#C6A052] shrink-0 bg-slate-100"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#0F2438] text-[#E5C887] border border-[#C6A052]/60 flex items-center justify-center text-xs font-black shrink-0">
                      {getTravelerDisplayNames(selectedClient).fullDisplayName.slice(0, 1) || 'م'}
                    </div>
                  )}
                  <div className="leading-tight">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-black text-[#0F2438]">
                        {getTravelerDisplayNames(selectedClient).fullDisplayName}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-md bg-[#FAF8F2] border border-[#E5C887] text-[10.5px] font-black text-[#0F2438] tabular-nums"
                        dir="ltr"
                      >
                        {selectedClient.orderCode || buildOrderCodeFromPhone(selectedClient.phone)}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums block" dir="ltr">
                      +{selectedClient.phoneNormalized || normalizePhone(selectedClient.phone)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canActivateOtp && (
                  <button
                    type="button"
                    onClick={() => handleToggleVerified(selectedClient)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      selectedClient.verified
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    {selectedClient.verified
                      ? t('حساب موثق ✓ (إلغاء)', 'Verified ✓ (Revoke)')
                      : t('غير موثق (تفعيل فوري)', 'Unverified (Verify Now)')}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDirectWhatsAppChat(selectedClient)}
                  className="px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t('محادثة واتساب', 'Open WhatsApp')}</span>
                </button>
              </div>
            </div>

            {/* OTP Box (only when activate_otp permission exists) */}
            {canActivateOtp && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-black text-[#0F2438] block">
                      {t('كود ورابط التفعيل المباشر عبر واتساب', 'WhatsApp OTP & Direct Activation Link')}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {t(
                        'بديل يدوي فوري للمدير العام بجانب الرد الآلي التلقائي للعميل',
                        'Quick manual fallback for management alongside automatic client replies'
                      )}
                    </span>
                  </div>
                  <span className="font-bold text-[#0284C7] tabular-nums">
                    {t('كود التفعيل:', 'OTP:')} {selectedClient.otp}
                  </span>
                </div>
                <div
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-600 truncate"
                  dir="ltr"
                >
                  {buildActivationMagicLink(
                    selectedClient.phone,
                    selectedClient.otp,
                    getTravelerDisplayNames(selectedClient).fullDisplayName
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyActivationMsg(selectedClient)}
                    className="min-h-[40px] px-3 py-2 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedPhone === selectedClient.phone ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{t('تم النسخ!', 'Copied!')}</span>
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
                    className="min-h-[40px] px-3 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {t(
                        'إرسال الكود يدوياً بضغطة واحدة عبر واتساب',
                        'Send OTP Manually via WhatsApp (1-Click)'
                      )}
                    </span>
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left/Start: Editable Details & Status */}
              <form
                onSubmit={handleSaveClientFolder}
                className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3"
              >
                <h4 className="text-sm font-black text-[#0F2438]">
                  {t('بيانات العميل وحالة الطلب', 'Client Details & Visa Stage')}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('الاسم الأول (حسب الجواز)', 'First Name')}
                    </label>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('الاسم الأخير (حسب الجواز)', 'Last Name')}
                    </label>
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('الاسم بالجواز', 'Full Name as on Passport')}
                    </label>
                    <input
                      type="text"
                      value={editPassportFullName}
                      onChange={(e) => setEditPassportFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('تاريخ انتهاء الجواز', 'Passport Expiry')}
                    </label>
                    <input
                      type="date"
                      value={editPassportExpiry}
                      onChange={(e) => setEditPassportExpiry(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-600 mb-1.5">
                      {t('مرحلة طلب التأشيرة / تساهيل (تحديث فوري بضغطة واحدة)', 'Order Stage (1-Click Live Update)')}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {VISA_ORDER_STATUSES.map((st, idx) => {
                        const isActive =
                          normalizeOrderStatusValue(editOrderStatus) === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleOneClickOrderStageUpdate(selectedClient, st)}
                            className={`px-2.5 py-2.5 rounded-xl border text-[11px] font-black transition cursor-pointer text-center min-h-[42px] ${
                              isActive
                                ? 'bg-[#0F2438] text-[#E5C887] border-[#C6A052] shadow-xs'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-[#0F2438]'
                            }`}
                          >
                            {idx + 1}. {translateOrderStatus(st, lang)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block font-bold text-slate-600 mb-1">
                    {t('ملاحظة الإدارة للعميل', 'Client-Visible Admin Note')}
                  </label>
                  <input
                    type="text"
                    value={editAdminNotes}
                    onChange={(e) => setEditAdminNotes(e.target.value)}
                    placeholder={t(
                      'مثال: موعد تساهيل يوم الثلاثاء 10 صباحاً',
                      'e.g. Tasheer appointment Tuesday 10 AM'
                    )}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                  />
                </div>

                {/* Appointment QR Pass Entry Section */}
                <div className="bg-white border border-[#E5C887] rounded-xl p-3 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[#0F2438] font-black">
                      <QrCode className="w-4 h-4 text-[#9E7B33]" />
                      <span>
                        {t('بيانات بطاقة الموعد والباركود (Appointment QR Pass)', 'Appointment QR Pass Details')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdminQrPreview(true)}
                      className="px-2.5 py-1 rounded-lg bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>{t('معاينة بطاقة QR', 'Preview QR Pass')}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('نوع الخدمة / الموعد', 'Service / Appointment Type')}
                      </label>
                      <input
                        type="text"
                        value={editApptServiceType}
                        onChange={(e) => setEditApptServiceType(e.target.value)}
                        placeholder={t('موعد تساهيل (VFS) / كشف طبي جامكا / تذكرة طيران', 'Tasheer VFS / GAMCA / Flight Ticket')}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('تاريخ الموعد', 'Appointment Date')}
                      </label>
                      <input
                        type="date"
                        value={editApptDate}
                        onChange={(e) => setEditApptDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('وقت الموعد', 'Appointment Time')}
                      </label>
                      <input
                        type="time"
                        value={editApptTime}
                        onChange={(e) => setEditApptTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('المركز / المطار / الموقع (اختياري)', 'Location / Branch (Optional)')}
                      </label>
                      <input
                        type="text"
                        value={editApptLocation}
                        onChange={(e) => setEditApptLocation(e.target.value)}
                        placeholder={t('مثال: فرع تساهيل المنصورة / مطار القاهرة', 'e.g. Tasheer Mansoura / Cairo Airport')}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('رقم الحجز / المرجع (اختياري)', 'Booking Ref / PNR (Optional)')}
                      </label>
                      <input
                        type="text"
                        value={editApptReference}
                        onChange={(e) => setEditApptReference(e.target.value)}
                        placeholder="VFS-849201"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums uppercase"
                      />
                    </div>
                  </div>
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
                    <span>{t('حفظ تعديلات الملف', 'Save Folder')}</span>
                  </button>

                  {canDeleteRecords && (
                    confirmDeletePhone === selectedClient.phone ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleConfirmDeleteClient(selectedClient.phone)}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                        >
                          {t('تأكيد الحذف', 'Confirm Delete')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePhone(null)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                        >
                          {t('إلغاء', 'Cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePhone(selectedClient.phone)}
                        className="px-3 py-2 rounded-xl border border-red-200 bg-white text-red-700 hover:bg-red-50 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t('حذف العميل', 'Delete Client')}</span>
                      </button>
                    )
                  )}
                </div>
              </form>

              {/* Right/End: Documents Gallery */}
              <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-[#0F2438]">
                    {t(
                      `صور الجواز والمستندات المرفوعة (${selectedClient.documents?.length || 0})`,
                      `Uploaded Passport Scans & Documents (${selectedClient.documents?.length || 0})`
                    )}
                  </h4>

                  {selectedClient.avatarUrl && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDocImage({
                            label: `${getTravelerDisplayNames(selectedClient).fullDisplayName} — ${t('الصورة الشخصية', 'Personal Photo')}`,
                            dataUrl: selectedClient.avatarUrl || '',
                            downloadName: buildDescriptiveFilename(
                              'Photo',
                              getTravelerDisplayNames(selectedClient).firstName,
                              getTravelerDisplayNames(selectedClient).lastName
                            ),
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-[#0F2438] flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{t('الصورة الشخصية', 'Avatar')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadCloudFile(
                            selectedClient.avatarUrl || '',
                            buildDescriptiveFilename(
                              'Photo',
                              getTravelerDisplayNames(selectedClient).firstName,
                              getTravelerDisplayNames(selectedClient).lastName
                            )
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>{t('تحميل الشخصية', 'Download Photo')}</span>
                      </button>
                    </div>
                  )}
                </div>

                {selectedClient.documents && selectedClient.documents.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedClient.documents.map((docItem) => {
                      const clientNames = getTravelerDisplayNames(selectedClient);
                      const dlFilename =
                        docItem.docType === 'passport'
                          ? buildDescriptiveFilename(
                              'Passport',
                              clientNames.firstName,
                              clientNames.lastName
                            )
                          : docItem.docType === 'photo'
                          ? buildDescriptiveFilename(
                              'Photo',
                              clientNames.firstName,
                              clientNames.lastName
                            )
                          : docItem.docType === 'receipt'
                          ? buildDescriptiveFilename(
                              'Receipt',
                              clientNames.firstName,
                              clientNames.lastName
                            )
                          : docItem.fileName || `${selectedClient.phone}-${docItem.docType}.jpg`;
                      return (
                        <div
                          key={docItem.id}
                          className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={getDisplayableDriveImageUrl(docItem.dataUrl)}
                              alt={docItem.label}
                              loading="lazy"
                              decoding="async"
                              className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-black text-[#0F2438] block truncate">
                                {docItem.label}
                              </span>
                              <span className="text-[11px] text-slate-500 block truncate">
                                {docItem.fileName}
                              </span>
                              <span className="text-[10px] text-slate-400 block tabular-nums">
                                {docItem.uploadedAt?.slice(0, 10)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewDocImage({
                                  label: docItem.label,
                                  dataUrl: docItem.dataUrl,
                                  downloadName: dlFilename,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t('معاينة', 'Inspect')}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => void downloadCloudFile(docItem.dataUrl, dlFilename)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{t('تحميل', 'Download')}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <FileText className="w-6 h-6 text-slate-400" />
                    <span>
                      {t(
                        'لم يقم العميل برفع أي صور أو مستندات بعد.',
                        'No passport photos or documents uploaded yet.'
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* FINAL COMPLETION DOCUMENT DELIVERY PANEL (ADMIN -> CLIENT ACCOUNT) */}
            <div className="bg-gradient-to-br from-[#FAF8F2] to-white border-2 border-[#C6A052]/70 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#C6A052]/30">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0">
                    <FileUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-black text-[#0F2438]">
                      {t('إرفاق مستند التنفيذ النهائي', 'Attach Final Execution Document')}
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      {t(
                        'ارفع ملف PDF أو صورة عالية الجودة لإرساله فوراً إلى حساب العميل وتحديث الطلب إلى "تم تنفيذ الطلب"',
                        'Upload a PDF or high-quality image to deliver straight to client account and set status to Completed'
                      )}
                    </p>
                  </div>
                </div>

                {(selectedClient.issuedDocuments?.length || 0) > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-900 text-[11px] font-black tabular-nums">
                    {t(
                      `تم تسليم ${selectedClient.issuedDocuments?.length} مستند`,
                      `Delivered: ${selectedClient.issuedDocuments?.length}`
                    )}
                  </span>
                )}
              </div>

              {replacingDeliverable && (
                <div className="p-3 rounded-xl bg-amber-50 border-2 border-amber-300 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-black text-amber-950">
                    <RefreshCw className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      {t(
                        `وضع استبدال المستند: "${replacingDeliverable.docTypeLabel}" — اختر الملف الجديد ليحل محل النسخة السابقة تلقائياً.`,
                        `Replacing document "${replacingDeliverable.docTypeLabel}" — select the new file to overwrite cleanly.`
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplacingDeliverable(null)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold cursor-pointer"
                  >
                    {t('إلغاء الاستبدال', 'Cancel Replace')}
                  </button>
                </div>
              )}

              <form onSubmit={handleApproveAndDeliverDocument} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('نوع المستند', 'Document Type')} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={deliverableTypeChoice}
                      onChange={(e) => setDeliverableTypeChoice(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-bold focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    >
                      <option value="تذكرة طيران">{t('تذكرة طيران', 'Flight Ticket')}</option>
                      <option value="موعد تساهيل">{t('موعد تساهيل', 'Tasheer VFS Appointment')}</option>
                      <option value="كشف طبي جامكا">{t('كشف طبي جامكا', 'GAMCA / Wafid Medical Slip')}</option>
                      <option value="تأشيرة">{t('تأشيرة صادرة', 'Issued Visa')}</option>
                      <option value="شهادة تطعيم">{t('شهادة تطعيم', 'Vaccination Certificate')}</option>
                      <option value="حجز فندق مؤكد">{t('حجز فندق مؤكد', 'Confirmed Hotel Voucher')}</option>
                      <option value="تأمين طبي وإيصال إنجاز">{t('تأمين طبي وإيصال إنجاز', 'Medical Insurance & Enjaz Receipt')}</option>
                      <option value="__custom__">{t('كتابة نوع مستند آخر...', 'Enter Custom Document Type...')}</option>
                    </select>
                  </div>

                  {deliverableTypeChoice === '__custom__' ? (
                    <div>
                      <label className="block font-bold text-[#0F2438] mb-1.5">
                        {t('اكتب اسم / نوع المستند', 'Custom Document Type')}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={customDeliverableType}
                        onChange={(e) => setCustomDeliverableType(e.target.value)}
                        placeholder={t('مثال: تصديق وزارة الخارجية', 'e.g. MOFA Attested Contract')}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block font-bold text-[#0F2438] mb-1.5">
                        {t('ملاحظة مرفقة مع المستند (اختياري)', 'Optional Note for Client')}
                      </label>
                      <input
                        type="text"
                        value={deliverableNotes}
                        onChange={(e) => setDeliverableNotes(e.target.value)}
                        placeholder={t('مثال: الحضور قبل الموعد بـ 30 دقيقة', 'e.g. Arrive 30 mins early')}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                      />
                    </div>
                  )}
                </div>

                {deliverableTypeChoice === '__custom__' && (
                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('ملاحظة مرفقة مع المستند (اختياري)', 'Optional Note for Client')}
                    </label>
                    <input
                      type="text"
                      value={deliverableNotes}
                      onChange={(e) => setDeliverableNotes(e.target.value)}
                      placeholder={t('مثال: الحضور قبل الموعد بـ 30 دقيقة', 'e.g. Arrive 30 mins early')}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>
                )}

                <div className="bg-white border border-dashed border-[#C6A052] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {deliverablePreviewUrl ? (
                      <img
                        src={deliverablePreviewUrl}
                        alt={deliverableFile?.name || 'Preview'}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[#0F2438] shrink-0">
                        <FileText className="w-6 h-6 text-[#0284C7]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-black text-[#0F2438] block truncate">
                        {deliverableFile
                          ? deliverableFile.name
                          : t('اختر ملف المستند (PDF حتى 5 ميجا أو صورة)', 'Select Document File (PDF <= 5MB or Image)')}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        {deliverableFile
                          ? `${formatStorageSize(deliverableFile.size)}${
                              deliverableFile.type.startsWith('image/')
                                ? t(' · سيتم ضغط الصورة تلقائياً < 500 ك.ب', ' · Auto-compressed < 500 KB')
                                : ''
                            }`
                          : t(
                              'حد أقصى 5 ميجابايت لملفات PDF، وضغط تلقائي للصور لأقل من 500 كيلوبايت',
                              'Max 5 MB for PDFs; images are auto-compressed under 500 KB before upload'
                            )}
                      </span>
                    </div>
                  </div>

                  <label className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] font-black flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition">
                    <FileUp className="w-4 h-4 text-[#0284C7]" />
                    <span>{t('اختيار ملف', 'Choose File')}</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={handleSelectDeliverableFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {deliverableFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                      deliverableFeedback.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                  >
                    {deliverableFeedback.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>{deliverableFeedback.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingDeliverable}
                  className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  {isSendingDeliverable ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : replacingDeliverable ? (
                    <RefreshCw className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {isSendingDeliverable
                      ? t('جاري الضغط والرفع والاعتماد...', 'Compressing & Uploading...')
                      : replacingDeliverable
                      ? t('حفظ واستبدال المستند للعميل', 'Save & Replace Client Document')
                      : t('اعتماد وإرسال المستند للعميل', 'Approve & Send Document to Client')}
                  </span>
                </button>
              </form>

              {/* Previously Issued Completion Deliverables */}
              {selectedClient.issuedDocuments && selectedClient.issuedDocuments.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <h5 className="text-xs font-black text-[#0F2438]">
                    {t('المستندات الصادرة والمسلمة للعميل:', 'Delivered Documents in Client Account:')}
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {selectedClient.issuedDocuments.map((delDoc) => {
                      const isPdf =
                        delDoc.mimeType === 'application/pdf' ||
                        delDoc.fileName.toLowerCase().endsWith('.pdf');
                      const isBeingReplaced = replacingDeliverable?.id === delDoc.id;
                      return (
                        <div
                          key={delDoc.id}
                          className={`bg-white border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                            isBeingReplaced ? 'border-amber-400 ring-2 ring-amber-200' : 'border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-black text-[#0F2438] block truncate">
                                {delDoc.docTypeLabel}
                              </span>
                              <span className="text-[10.5px] text-slate-500 block truncate tabular-nums">
                                {delDoc.fileName} · {delDoc.issuedAt.slice(0, 10)}
                                {typeof delDoc.fileSizeBytes === 'number'
                                  ? ` · ${formatStorageSize(delDoc.fileSizeBytes)}`
                                  : ''}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <a
                              href={getDriveViewUrl(
                                delDoc.downloadUrl,
                                delDoc.viewUrl,
                                delDoc.storagePath
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438]"
                              title={t('معاينة وفتح في Google Drive', 'Preview & Open in Drive')}
                            >
                              {isPdf ? <ExternalLink className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                void downloadCloudFile(delDoc.downloadUrl, delDoc.fileName)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[11px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              <span>{t('تحميل', 'Download')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleStartReplaceDeliverable(delDoc.id, delDoc.docTypeLabel)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              title={t('استبدال المستند', 'Replace Document')}
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>{t('استبدال', 'Replace')}</span>
                            </button>
                            {confirmDeleteDeliverableId === delDoc.id ? (
                              <button
                                type="button"
                                onClick={() => void handleRemoveIssuedDeliverable(delDoc.id)}
                                className="px-2 py-1 rounded-lg bg-red-600 text-white text-[10.5px] font-bold cursor-pointer"
                              >
                                {t('تأكيد', 'Confirm')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteDeliverableId(delDoc.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                title={t('حذف', 'Delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Dedicated Family Members & Companions Cloud Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#C6A052]" />
                  <h4 className="text-sm font-black text-[#0F2438]">
                    {t(
                      `أفراد العائلة والمرافقون (${selectedClient.familyMembers?.length || 0})`,
                      `Family Members & Companions (${selectedClient.familyMembers?.length || 0})`
                    )}
                  </h4>
                </div>
              </div>

              {selectedClient.familyMembers && selectedClient.familyMembers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {selectedClient.familyMembers.map((member) => {
                    const memberName = `${member.firstName} ${member.lastName}`.trim();
                    const passportFilename = buildDescriptiveFilename(
                      'Passport',
                      member.firstName,
                      member.lastName
                    );
                    const photoFilename = buildDescriptiveFilename(
                      'Photo',
                      member.firstName,
                      member.lastName
                    );
                    return (
                      <div
                        key={member.id}
                        className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3"
                      >
                        <div className="flex items-center gap-3">
                          {member.personalPhotoUrl ? (
                            <img
                              src={getDisplayableDriveImageUrl(member.personalPhotoUrl)}
                              alt={memberName}
                              loading="lazy"
                              decoding="async"
                              onClick={() =>
                                setPreviewDocImage({
                                  label: `${memberName} — ${t('الصورة الشخصية', 'Personal Photo')}`,
                                  dataUrl: member.personalPhotoUrl,
                                  downloadName: photoFilename,
                                })
                              }
                              className="w-12 h-12 rounded-full object-cover border-2 border-[#C6A052] shrink-0 bg-slate-100 cursor-pointer"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[#0F2438] text-[#E5C887] flex items-center justify-center text-sm font-black shrink-0">
                              {memberName.slice(0, 1) || 'ع'}
                            </div>
                          )}

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs sm:text-sm font-black text-[#0F2438] truncate">
                                {memberName}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-[#C6A052]/20 border border-[#C6A052]/50 text-[10px] font-black text-[#0F2438]">
                                {getRelationshipLabel(member.relationship, lang)}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 tabular-nums uppercase">
                              {t('رقم الجواز:', 'Passport No:')}{' '}
                              <strong className="text-[#0F2438]">{member.passportNumber}</strong>
                              {member.passportExpiryDate && ` · ${member.passportExpiryDate}`}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2 border-t border-slate-100">
                          {member.passportPhotoUrl && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewDocImage({
                                    label: `${memberName} — ${t('صورة جواز السفر', 'Passport Photo')}`,
                                    dataUrl: member.passportPhotoUrl,
                                    downloadName: passportFilename,
                                  })
                                }
                                className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>{t('معاينة الجواز', 'Passport')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void downloadCloudFile(member.passportPhotoUrl, passportFilename)
                                }
                                className="px-2 py-1.5 rounded-lg bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[10.5px] font-black flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>{t('تحميل الجواز', 'DL Passport')}</span>
                              </button>
                            </>
                          )}

                          {member.personalPhotoUrl && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewDocImage({
                                    label: `${memberName} — ${t('الصورة الشخصية', 'Personal Photo')}`,
                                    dataUrl: member.personalPhotoUrl,
                                    downloadName: photoFilename,
                                  })
                                }
                                className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>{t('معاينة الصورة', 'Photo')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void downloadCloudFile(member.personalPhotoUrl, photoFilename)
                                }
                                className="px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-black flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>{t('تحميل الشخصية', 'DL Photo')}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white border border-dashed border-slate-300 rounded-xl p-5 text-center text-xs text-slate-500">
                  {t(
                    'لم يقم العميل بإضافة أفراد عائلة أو مرافقين حتى الآن.',
                    'No family members or companions added by this client yet.'
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ANNOUNCEMENTS, SITE CONTENT & INLINE CMS MANAGER */}
        {activeTab === 'content' && canEditContent && (
          <div className="space-y-5">
            {/* Callout to launch Live Site Editor */}
            <div className="bg-white border-2 border-[#C6A052]/60 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                  {t(
                    'التعديل المباشر لأي جزء في الموقع (Live Site Editor)',
                    'Universal Live Inline Site Editor'
                  )}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {t(
                    'افتح الموقع في وضع التعديل المباشر لتعديل أي عنوان، وصف، عرض سعر، أو إضافة بند جديد في الشبكات بضغطة واحدة.',
                    'Switch to Live Site Editor to edit any heading, paragraph, offer, or add new service cards directly in place.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdminMode('live_editor')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-2 transition cursor-pointer shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t('فتح وضع التعديل المباشر الآن', 'Open Live Site Editor')}</span>
              </button>
            </div>

            <form onSubmit={handleSaveSiteContent} className="space-y-5">
              {/* Announcement Banner Manager */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-[#0F2438]">
                      {t(
                        'شريط الإعلانات والتنبيهات العاجلة أعلى الموقع',
                        'Top Announcement & Urgent Alert Banner'
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {t(
                        'يظهر أعلى الهيدر لجميع زوار المنصة عند تفعيله',
                        'Displays cleanly above the navbar for all site visitors'
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
                        ? t('مفعّل (ON)', 'Enabled (ON)')
                        : t('متوقف (OFF)', 'Disabled (OFF)')}
                    </span>
                  </label>
                </div>

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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1">
                      {t('نص الإعلان (عربي)', 'Announcement Text (Arabic)')}
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
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-[#0F2438]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1">
                      {t('نص الإعلان (إنجليزي)', 'Announcement Text (English)')}
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
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-[#0F2438]"
                    />
                  </div>
                </div>

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

              {/* Quick Site Content Overrides */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
                <h4 className="text-sm font-black text-[#0F2438]">
                  {t('تعديل بيانات التواصل والمحتوى الرئيسي', 'Contact & Hero Content Overrides')}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('رقم الهاتف والواتساب الرسمي', 'Contact Phone / WhatsApp')}
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
                      {t('العنوان الفرعي بالرئيسية (عربي)', 'Featured Hero Subtitle (Arabic)')}
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
                      {t('العنوان الفرعي بالرئيسية (إنجليزي)', 'Featured Hero Subtitle (English)')}
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

                {contentSavedMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                    {contentSavedMsg}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <button
                    type="submit"
                    className="min-h-[42px] px-5 py-2.5 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{t('حفظ وتطبيق التعديلات فوراً', 'Save & Publish Changes')}</span>
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
              </div>
            </form>

            {/* Saved Live CMS Overrides, Custom Items & Deleted Blocks */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-[#0F2438]">
                    {t('سجل التعديلات المباشرة والبنود المضافة', 'Live Inline Edits & Added Items')}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {t(
                      `النصوص المعدلة: ${overrideTextCount} • البنود المضافة: ${cmsState.customItems.length} • العناصر المحذوفة: ${cmsState.deletedKeys.length}`,
                      `Edited texts: ${overrideTextCount} · Added items: ${cmsState.customItems.length} · Deleted blocks: ${cmsState.deletedKeys.length}`
                    )}
                  </p>
                </div>

                {(overrideTextCount > 0 ||
                  cmsState.customItems.length > 0 ||
                  cmsState.deletedKeys.length > 0) &&
                  (confirmResetCms ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          resetAllCmsOverrides();
                          setConfirmResetCms(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer"
                      >
                        {t('تأكيد تصفير كل التعديلات', 'Confirm Reset All')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetCms(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                      >
                        {t('إلغاء', 'Cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmResetCms(true)}
                      className="px-3 py-1.5 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t('استعادة كل المحتوى الأصلي', 'Reset All Inline Edits')}</span>
                    </button>
                  ))}
              </div>

              {cmsState.deletedKeys.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <span className="text-xs font-bold text-amber-900 block">
                    {t('عناصر محذوفة من الموقع (يمكنك استرجاعها):', 'Deleted Site Elements (Restore Anytime):')}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {cmsState.deletedKeys.map((dk) => (
                      <button
                        key={dk}
                        type="button"
                        onClick={() => restoreCmsElement(dk)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-[11px] font-bold text-[#0F2438] hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{t(`استرجاع (${dk})`, `Restore (${dk})`)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cmsState.customItems.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-600 block">
                    {t('الخدمات والعروض المضافة:', 'Custom Added Services & Offers:')}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {cmsState.customItems.map((it) => (
                      <div
                        key={it.id}
                        className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-black text-[#0F2438] block truncate">
                            {lang === 'en' ? it.titleEn : it.titleAr}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {it.priceOfferAr || it.badgeAr || it.gridId}
                          </span>
                        </div>
                        {canDeleteRecords && (
                          <button
                            type="button"
                            onClick={() => deleteCmsCustomItem(it.id)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                            aria-label={t('حذف البند', 'Delete Item')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ADMIN SETTINGS, SUB-ADMINS & PERMISSIONS */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            {/* SUB-ADMINS & GRANULAR PERMISSIONS MANAGER (GENERAL MANAGER EXCLUSIVE) */}
            {isSuperAdmin ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0">
                    <UserCog className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                      {t('إدارة المديرين المساعدين والصلاحيات', 'Sub-Admins & Granular Role Permissions')}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-500">
                      {t(
                        'أضف مديرين مساعدين برمز PIN مخصص وحدد الصلاحيات الدقيقة لكل مدير مساعد',
                        'Create secondary sub-admins with custom PINs and granular permissions'
                      )}
                    </p>
                  </div>
                </div>

                {/* Add Sub-Admin Form */}
                <form
                  onSubmit={handleAddSubAdmin}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-[#0F2438] mb-1">
                        {t('اسم المدير المساعد *', 'Sub-Admin Name *')}
                      </label>
                      <input
                        type="text"
                        required
                        value={subName}
                        onChange={(e) => setSubName(e.target.value)}
                        placeholder={t('مثال: كريم - موظف تساهيل', 'e.g. Kareem - Visa Desk')}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[#0F2438] mb-1">
                        {t('الرمز السري الخاص (PIN) *', 'Custom PIN / Password *')}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        dir="ltr"
                        value={subPin}
                        onChange={(e) => setSubPin(e.target.value)}
                        placeholder="e.g. 4455"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
                      />
                    </div>
                  </div>

                  {/* 4 Granular Permission Checkboxes */}
                  <div className="space-y-2">
                    <span className="text-xs font-black text-[#0F2438] block">
                      {t('تحديد الصلاحيات المسموحة:', 'Assign Allowed Permissions:')}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ALL_ADMIN_PERMISSIONS.map((perm) => {
                        const checked = subPerms.includes(perm);
                        const meta = PERMISSION_LABELS[perm];
                        return (
                          <label
                            key={perm}
                            className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                              checked
                                ? 'bg-white border-[#0F2438] ring-1 ring-[#C6A052]'
                                : 'bg-white/70 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleNewSubPerm(perm)}
                              className="w-4 h-4 mt-0.5 accent-[#0F2438] cursor-pointer shrink-0"
                            />
                            <div className="text-xs">
                              <span className="font-black text-[#0F2438] block">
                                {lang === 'en' ? meta.en : meta.ar}{' '}
                                <span className="text-[10px] font-mono text-slate-400">
                                  ({perm})
                                </span>
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {lang === 'en' ? meta.descEn : meta.descAr}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {subAdminMsg && (
                    <div
                      className={`p-2.5 rounded-xl border text-xs font-bold ${
                        subAdminMsg.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      {subAdminMsg.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="min-h-[42px] px-5 py-2.5 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{t('إضافة المدير المساعد وحفظ الصلاحيات', 'Create Sub-Admin')}</span>
                  </button>
                </form>

                {/* Existing Sub-Admins List */}
                <div className="space-y-3">
                  <h4 className="text-xs sm:text-sm font-black text-[#0F2438]">
                    {t(
                      `المديرون المساعدون المسجلون (${subAdmins.length})`,
                      `Active Sub-Admins (${subAdmins.length})`
                    )}
                  </h4>

                  {subAdmins.length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5 text-center text-xs text-slate-500">
                      {t(
                        'لم تتم إضافة أي مدير مساعد بعد.',
                        'No sub-admins created yet.'
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {subAdmins.map((sa) => (
                        <div
                          key={sa.id}
                          className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-sm font-black text-[#0F2438]">{sa.name}</span>
                              <span className="ms-2 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-bold text-slate-600 tabular-nums">
                                PIN: {sa.pin}
                              </span>
                            </div>

                            {confirmDeleteSubId === sa.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteSubAdmin(sa.id);
                                    setSubAdmins(getSubAdmins());
                                    setConfirmDeleteSubId(null);
                                  }}
                                  className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer"
                                >
                                  {t('تأكيد الحذف', 'Confirm')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSubId(null)}
                                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                                >
                                  {t('إلغاء', 'Cancel')}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSubId(sa.id)}
                                className="px-2.5 py-1.5 rounded-xl bg-white border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t('إزالة', 'Remove')}</span>
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {ALL_ADMIN_PERMISSIONS.map((perm) => {
                              const active = sa.permissions.includes(perm);
                              const meta = PERMISSION_LABELS[perm];
                              return (
                                <button
                                  key={perm}
                                  type="button"
                                  onClick={() => handleToggleExistingSubPerm(sa, perm)}
                                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                                    active
                                      ? 'bg-[#0F2438] text-[#E5C887] border-[#0F2438]'
                                      : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                                  }`}
                                >
                                  {active && <Check className="w-3 h-3 shrink-0" />}
                                  <span>{lang === 'en' ? meta.en : meta.ar}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-950 font-bold">
                <Lock className="w-5 h-5 text-amber-700 shrink-0" />
                <span>
                  {t(
                    'إدارة المديرين المساعدين وتغيير الرمز السري الرئيسي متاحة للمدير العام فقط.',
                    'Sub-Admin management and Master PIN settings are restricted to the General Manager.'
                  )}
                </span>
              </div>
            )}

            {/* Change General Manager PIN (Super Admin Only) */}
            {isSuperAdmin && (
              <form
                onSubmit={handleChangePinSubmit}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs"
              >
                <div className="flex items-center gap-2 text-sm font-black text-[#0F2438]">
                  <KeyRound className="w-4 h-4 text-[#C6A052]" />
                  <span>
                    {t('تغيير الرمز السري للمدير العام (PIN)', 'Change General Manager PIN')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('الرمز الحالي', 'Current PIN')}
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPinDraft}
                      onChange={(e) => setCurrentPinDraft(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      {t('الرمز الجديد', 'New PIN')}
                    </label>
                    <input
                      type="password"
                      required
                      value={newPinDraft}
                      onChange={(e) => setNewPinDraft(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums"
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums"
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
                  {t('تحديث الرمز السري', 'Update PIN')}
                </button>
              </form>
            )}

            {/* Full Backup / Export JSON */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
              <h4 className="text-sm font-black text-[#0F2438]">
                {t(
                  'نسخ احتياطي وتصدير بيانات العملاء والموقع (JSON)',
                  'Export & Backup All Clients & Live Site Data (JSON)'
                )}
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {t(
                  'تنزيل نسخة احتياطية شاملة تتضمن ملفات العملاء، أرقام الجوازات، المستندات، إعدادات الموقع، وكل تعديلات المحرر المباشر.',
                  'Download a complete JSON backup including all clients, passport scans, site configuration, and live inline CMS edits.'
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
                className="min-h-[42px] px-5 py-2.5 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {t(
                    `تصدير النسخة الاحتياطية (${travelers.length} عميل)`,
                    `Download Full Backup (${travelers.length} clients)`
                  )}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full-Size Passport / Document Lightbox */}
      {previewDocImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewDocImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0F2438] text-white px-4 py-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold truncate">{previewDocImage.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    void downloadCloudFile(
                      previewDocImage.dataUrl,
                      previewDocImage.downloadName || 'Masarik_Client_Document.jpg'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('تحميل', 'Download')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDocImage(null)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={getDisplayableDriveImageUrl(previewDocImage.dataUrl)}
                alt={previewDocImage.label}
                loading="lazy"
                decoding="async"
                className="max-h-[68vh] rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {selectedClient && (
        <AppointmentQrPassModal
          isOpen={showAdminQrPreview}
          onClose={() => setShowAdminQrPreview(false)}
          traveler={{
            ...selectedClient,
            firstName: editFirstName.trim() || selectedClient.firstName,
            lastName: editLastName.trim() || selectedClient.lastName,
            passportNumber: editPassportNumber.trim() || selectedClient.passportNumber,
            appointmentDetails:
              editApptDate || editApptTime || editApptServiceType || editApptLocation || editApptReference
                ? {
                    serviceType:
                      editApptServiceType.trim() ||
                      selectedClient.preferredVisaType ||
                      'موعد خدمة سياحية',
                    appointmentDate: editApptDate.trim(),
                    appointmentTime: editApptTime.trim(),
                    location: editApptLocation.trim() || undefined,
                    referenceNumber: editApptReference.trim() || undefined,
                  }
                : selectedClient.appointmentDetails,
          }}
        />
      )}
    </div>
  );
};

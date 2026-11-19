import React, { useEffect, useRef, useState } from 'react';
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
  Unlock,
  UserCog,
  LogOut,
  FileUp,
  Loader2,
  ExternalLink,
  HardDrive,
  RefreshCw,
  QrCode,
  Inbox,
  MessageSquare,
  Bell,
  Plus,
  Volume2,
} from 'lucide-react';
import {
  AdminPermission,
  AppointmentDetails,
  DriveEndpointScope,
  DriveStorageEndpoint,
  SubAdminAccount,
  TravelerProfile,
  VisaOrderStatus,
} from '../types/travel';
import { AppointmentQrPassModal } from './AppointmentQrPassModal';
import {
  VISA_ORDER_STATUSES,
  TRAVELERS_UPDATED_EVENT,
  adminCreateClientCloud,
  adminInstantActivateClientCloud,
  approveAndDeliverDocumentCloud,
  buildActivationMagicLink,
  buildAdminForwardActivationMessage,
  buildOrderCodeFromPhone,
  cleanupCompletedOrderAttachmentsCloud,
  computeStorageUsageStats,
  deleteTravelerProfile,
  digitsOnly,
  exportAllDataBackupJson,
  formatPhoneForDisplay,
  getAllTravelers,
  getOrderStatusStageIndex,
  getRelationshipLabel,
  getTravelerDisplayNames,
  isOtpActiveAndUnexpired,
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
  DEFAULT_PRIMARY_DRIVE_WEBAPP_URL,
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

type DashboardTab = 'requests' | 'messages_otp' | 'ads' | 'settings';
type OrderFilter = 'all' | 'active' | 'with_files' | 'completed';

export const AdminDashboardWorkspace: React.FC = () => {
  const { lang, isAr, dir, t } = useLanguage();
  const {
    session,
    isSuperAdmin,
    isEditUnlocked,
    toggleEditLock,
    unlockEditMode,
    hasPermission,
    setAdminMode,
    logoutAdmin,
  } = useAdmin();
  const cmsState = useCmsState();
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const canManageClients = hasPermission('manage_clients');
  const canActivateOtp = hasPermission('activate_otp');
  const canEditContent = hasPermission('edit_content');
  const canDeleteRecords = hasPermission('delete_records');

  const getDefaultTab = (): DashboardTab => {
    if (canManageClients) return 'requests';
    if (canActivateOtp) return 'messages_otp';
    if (canEditContent) return 'ads';
    return 'settings';
  };

  const [activeTab, setActiveTab] = useState<DashboardTab>(getDefaultTab);

  // Tab 1 & 2: Clients, Orders, Files & OTP
  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [showAllOtpClients, setShowAllOtpClients] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Client Folder Detail
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

  // Tab 3 & 4: Ads, Site Config & CMS
  const [siteDraft, setSiteDraft] = useState<SiteConfig>(() => getSiteConfig());
  const [contentSavedMsg, setContentSavedMsg] = useState('');
  const [settingsSavedMsg, setSettingsSavedMsg] = useState('');
  const [driveSavedMsg, setDriveSavedMsg] = useState('');
  const [driveErrorMsg, setDriveErrorMsg] = useState('');
  const [newDriveLabel, setNewDriveLabel] = useState('');
  const [newDriveUrl, setNewDriveUrl] = useState('');
  const [newDriveScope, setNewDriveScope] = useState<DriveEndpointScope>('all');
  const [confirmResetCms, setConfirmResetCms] = useState(false);

  // Real-time Instant Admin Alert (Audio Chime + Top Banner for Incoming OTP Requests)
  const [alertSoundEnabled, setAlertSoundEnabled] = useState(true);
  const [realtimeAlert, setRealtimeAlert] = useState<{
    phone: string;
    name: string;
    otp: string;
    isPendingVerification: boolean;
    timestamp: string;
  } | null>(null);
  const baselineHydratedRef = useRef(false);
  const mountTimestampRef = useRef(Date.now());
  const seenClientStateRef = useRef<Map<string, { verified: boolean; otpGeneratedAt: string }>>(
    new Map()
  );

  // Tab 4: Sub-Admins & Security Settings
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

  const playAdminAlertChime = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const playTone = (freq: number, startOffset: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + startOffset);
        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.14, now + startOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration);
      };

      playTone(880, 0, 0.22);
      playTone(1174.66, 0.16, 0.28);
      window.setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 650);
    } catch {
      // Autoplay blocked or Web Audio unsupported — visual banner still alerts immediately
    }
  };

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

  // Arm instant audio + visual alert whenever a new pending OTP request arrives live
  useEffect(() => {
    const nextMap = new Map<string, { verified: boolean; otpGeneratedAt: string }>();
    for (const tr of travelers) {
      nextMap.set(tr.phone, {
        verified: Boolean(tr.verified),
        otpGeneratedAt: tr.otpGeneratedAt || '',
      });
    }

    if (!baselineHydratedRef.current) {
      if (travelers.length > 0 || Date.now() - mountTimestampRef.current > 2500) {
        seenClientStateRef.current = nextMap;
        baselineHydratedRef.current = true;
      }
      return;
    }

    let triggeredClient: TravelerProfile | null = null;
    for (const tr of travelers) {
      const prev = seenClientStateRef.current.get(tr.phone);
      const isNewClient = !prev;
      const isFreshOtpRequest =
        Boolean(prev) &&
        !tr.verified &&
        Boolean(tr.otpGeneratedAt) &&
        prev?.otpGeneratedAt !== tr.otpGeneratedAt;

      if (isNewClient || isFreshOtpRequest) {
        triggeredClient = tr;
        break;
      }
    }

    seenClientStateRef.current = nextMap;

    if (triggeredClient) {
      const displayName = getTravelerDisplayNames(triggeredClient).fullDisplayName;
      setRealtimeAlert({
        phone: triggeredClient.phone,
        name: displayName || triggeredClient.phone,
        otp: triggeredClient.otp || '',
        isPendingVerification:
          !triggeredClient.verified || triggeredClient.accountStatus === 'pending_verification',
        timestamp: new Date().toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
      if (alertSoundEnabled) {
        playAdminAlertChime();
      }
    }
  }, [travelers, alertSoundEnabled, isAr]);

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

  const handleOpenClientFromAnyTab = (phone: string) => {
    if (!canManageClients) return;
    setSelectedClientPhone(phone);
    setActiveTab('requests');
  };

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

  const handleAdminInstantActivate = async (client: TravelerProfile) => {
    if (!canActivateOtp) return;
    await adminInstantActivateClientCloud(client.phone);
    loadTravelers();
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
    if (!client.verified) {
      void handleAdminInstantActivate(client);
      return;
    }
    if (!isEditUnlocked) return;
    updateTravelerProfileDetails(client.phone, {
      verified: false,
      verifiedAt: undefined,
      activatedByAdmin: false,
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
      t(
        'تم حفظ وتحديث ملف العميل وبيانات الموعد بنجاح.',
        'Client folder & appointment details saved successfully.'
      )
    );
    setTimeout(() => setFolderSavedMsg(''), 3000);
  };

  const handleConfirmDeleteClient = (phone: string) => {
    if (!canDeleteRecords || !isEditUnlocked) return;
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
    if (!selectedClient || !canManageClients || !isEditUnlocked) return;
    await removeIssuedDeliverableCloud(selectedClient.phone, docId);
    setConfirmDeleteDeliverableId(null);
    if (replacingDeliverable?.id === docId) {
      setReplacingDeliverable(null);
    }
    loadTravelers();
  };

  const handleRunStorageCleanup = async () => {
    if ((!canManageClients && !isSuperAdmin) || !isEditUnlocked) return;
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

  const handleSaveAdsAndOffers = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditContent || !isEditUnlocked) return;
    const updated = saveSiteConfig(siteDraft);
    setSiteDraft(updated);
    setContentSavedMsg(
      t(
        'تم حفظ وتطبيق الإعلان وتعديلات العروض مباشرة على الموقع.',
        'Ads & promotional banner changes published live across the website.'
      )
    );
    setTimeout(() => setContentSavedMsg(''), 3500);
  };

  const handleResetSiteContent = () => {
    if (!canEditContent || !isEditUnlocked) return;
    const defaults = resetSiteConfig();
    setSiteDraft(defaults);
    setContentSavedMsg(
      t('تمت استعادة الإعدادات الافتراضية للإعلانات والعروض.', 'Ads & promo defaults restored.')
    );
    setTimeout(() => setContentSavedMsg(''), 3000);
  };

  const handleSaveSettingsConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditContent || !isEditUnlocked) return;
    const updated = saveSiteConfig(siteDraft);
    setSiteDraft(updated);
    setSettingsSavedMsg(
      t('تم حفظ بيانات التواصل وساعات العمل بنجاح.', 'Contact & working hours saved.')
    );
    setTimeout(() => setSettingsSavedMsg(''), 3500);
  };

  const handleSaveDriveStorageConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!canEditContent && !isSuperAdmin) || !isEditUnlocked) return;
    setDriveErrorMsg('');
    const primaryUrl = (siteDraft.primaryDriveWebAppUrl || '').trim();
    if (!primaryUrl.startsWith('https://')) {
      setDriveErrorMsg(
        t(
          'يجب أن يبدأ رابط Google Drive Web App الأساسي بـ https://',
          'Primary Google Drive Web App URL must start with https://'
        )
      );
      return;
    }
    const updated = saveSiteConfig({
      ...siteDraft,
      primaryDriveWebAppUrl: primaryUrl,
    });
    setSiteDraft(updated);
    setDriveSavedMsg(
      t(
        'تم حفظ روابط التخزين السحابي (Google Drive Web App) ومزامنتها في السحابة بنجاح.',
        'Google Drive Web App endpoints saved & synced to cloud.'
      )
    );
    setTimeout(() => setDriveSavedMsg(''), 4000);
  };

  const handleAddSecondaryDriveEndpoint = () => {
    if ((!canEditContent && !isSuperAdmin) || !isEditUnlocked) return;
    setDriveErrorMsg('');
    const cleanUrl = newDriveUrl.trim();
    const cleanLabel =
      newDriveLabel.trim() ||
      t(
        `حساب Drive إضافي ${(siteDraft.additionalDriveWebApps?.length || 0) + 2}`,
        `Backup Drive ${(siteDraft.additionalDriveWebApps?.length || 0) + 2}`
      );
    if (!cleanUrl.startsWith('https://')) {
      setDriveErrorMsg(
        t(
          'يرجى إدخال رابط Web App صحيح يبدأ بـ https://script.google.com/...',
          'Please enter a valid Web App URL starting with https://'
        )
      );
      return;
    }
    const nextItem: DriveStorageEndpoint = {
      id: `drv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: cleanLabel,
      url: cleanUrl,
      scope: newDriveScope,
      enabled: true,
    };
    const nextEndpoints = [...(siteDraft.additionalDriveWebApps || []), nextItem];
    const updated = saveSiteConfig({
      ...siteDraft,
      additionalDriveWebApps: nextEndpoints,
    });
    setSiteDraft(updated);
    setNewDriveLabel('');
    setNewDriveUrl('');
    setNewDriveScope('all');
    setDriveSavedMsg(
      t('تمت إضافة رابط حساب Drive الإضافي وحفظه فوراً.', 'Secondary Drive account added & saved.')
    );
    setTimeout(() => setDriveSavedMsg(''), 3500);
  };

  const handleToggleDriveEndpoint = (id: string) => {
    if ((!canEditContent && !isSuperAdmin) || !isEditUnlocked) return;
    const nextEndpoints = (siteDraft.additionalDriveWebApps || []).map((ep) =>
      ep.id === id ? { ...ep, enabled: !ep.enabled } : ep
    );
    const updated = saveSiteConfig({
      ...siteDraft,
      additionalDriveWebApps: nextEndpoints,
    });
    setSiteDraft(updated);
  };

  const handleChangeDriveEndpointScope = (id: string, scope: DriveEndpointScope) => {
    if ((!canEditContent && !isSuperAdmin) || !isEditUnlocked) return;
    const nextEndpoints = (siteDraft.additionalDriveWebApps || []).map((ep) =>
      ep.id === id ? { ...ep, scope } : ep
    );
    const updated = saveSiteConfig({
      ...siteDraft,
      additionalDriveWebApps: nextEndpoints,
    });
    setSiteDraft(updated);
  };

  const handleDeleteDriveEndpoint = (id: string) => {
    if ((!canEditContent && !isSuperAdmin) || !isEditUnlocked) return;
    const nextEndpoints = (siteDraft.additionalDriveWebApps || []).filter((ep) => ep.id !== id);
    const updated = saveSiteConfig({
      ...siteDraft,
      additionalDriveWebApps: nextEndpoints,
    });
    setSiteDraft(updated);
  };

  const handleToggleNewSubPerm = (perm: AdminPermission) => {
    setSubPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleAddSubAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !isEditUnlocked) return;
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
    if (!isSuperAdmin || !isEditUnlocked) return;
    const next = sa.permissions.includes(perm)
      ? sa.permissions.filter((p) => p !== perm)
      : [...sa.permissions, perm];
    setSubAdmins(updateSubAdminPermissions(sa.id, next));
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !isEditUnlocked) return;
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

  const filteredRequests = travelers.filter((tr) => {
    const normalizedSt = normalizeOrderStatusValue(tr.orderStatus);
    const isCompleted = normalizedSt === 'تم تنفيذ الطلب';
    const hasFiles = (tr.documents?.length || 0) > 0;

    if (orderFilter === 'active' && isCompleted) return false;
    if (orderFilter === 'with_files' && !hasFiles) return false;
    if (orderFilter === 'completed' && !isCompleted) return false;

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

  const pendingOtpClients = travelers.filter((tr) => !tr.verified);
  const otpQueueClients = showAllOtpClients ? travelers : pendingOtpClients;

  const clientMessagesAndReceipts = travelers.filter(
    (tr) =>
      Boolean(tr.preferredVisaType) ||
      Boolean(tr.adminNotes) ||
      (tr.documents || []).some((d) => d.docType === 'receipt')
  );

  const pendingCount = pendingOtpClients.length;
  const activeOrdersCount = travelers.filter(
    (tr) => normalizeOrderStatusValue(tr.orderStatus) !== 'تم تنفيذ الطلب'
  ).length;
  const withFilesCount = travelers.filter((tr) => (tr.documents?.length || 0) > 0).length;
  const completedCount = travelers.length - activeOrdersCount;
  const messagesBadgeCount = pendingCount + travelers.filter((tr) => !tr.verified || (tr.documents || []).some((d) => d.docType === 'receipt')).length;
  const overrideTextCount = Object.keys(cmsState.textOverrides).length;
  const storageStats = computeStorageUsageStats(travelers);
  const cleanupPreview = previewOldCompletedAttachmentsCleanup(travelers, cleanupAgeDays);

  const SafeLockBanner: React.FC<{ scopeLabelAr: string; scopeLabelEn: string }> = ({
    scopeLabelAr,
    scopeLabelEn,
  }) =>
    isEditUnlocked ? null : (
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start sm:items-center gap-2.5 text-amber-950">
          <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <span className="font-black block">
              {t(
                'وضع المتابعة والاستقبال الآمن مفعّل (قفل التعديل نشط)',
                'Safe Follow-Up Mode Active (Edit Lock Enabled)'
              )}
            </span>
            <span className="text-[11px] text-amber-800">
              {t(
                `لحماية المنصة من التعديلات غير المقصودة، قسم (${scopeLabelAr}) مقفل حالياً للقراءة فقط.`,
                `To prevent accidental edits, (${scopeLabelEn}) is currently read-only.`
              )}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={unlockEditMode}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition"
        >
          <Unlock className="w-3.5 h-3.5" />
          <span>{t('فتح وضع التعديل والإدارة', 'Unlock Edit Mode')}</span>
        </button>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F1F5F9] pb-24 md:pb-16 text-[#0F2438]" dir={dir}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-5 space-y-5">
        {/* Full-Page Workspace Hero Header + Safe Edit Lock Control */}
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
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-black flex items-center gap-1 border ${
                    isEditUnlocked
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                      : 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                  }`}
                >
                  {isEditUnlocked ? (
                    <>
                      <Unlock className="w-3 h-3" />
                      <span>{t('وضع التعديل مفتوح', 'Edit Mode Unlocked')}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" />
                      <span>{t('وضع المتابعة الآمن · قفل التعديل مفعّل', 'Safe Mode · Edit Lock Active')}</span>
                    </>
                  )}
                </span>
              </div>

              <h1 className="text-base sm:text-xl font-black text-white mt-1.5">
                {t('منظومة إدارة العملاء والعمليات — مسارك للإنجاز السياحي', 'CRM & Operations Workspace — Masarik Tourism')}
              </h1>

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
            {/* Prominent Safe Edit Lock Toggle */}
            <button
              type="button"
              onClick={toggleEditLock}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition cursor-pointer ${
                isEditUnlocked
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-400'
                  : 'bg-amber-400 hover:bg-amber-300 text-[#0A1926] border border-amber-200'
              }`}
            >
              {isEditUnlocked ? (
                <>
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>{t('قفل وضع التعديل', 'Lock Edit Mode')}</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 shrink-0" />
                  <span>{t('فتح وضع التعديل والإدارة', 'Unlock Edit & Management')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setAdminMode('live_editor')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center gap-2 shadow-sm transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isEditUnlocked && canEditContent
                  ? t('معاينة الموقع والتعديل المباشر', 'Live Site Editor')
                  : t('معاينة الموقع (وضع آمن)', 'Preview Site (Safe)')}
              </span>
            </button>

            <button
              type="button"
              onClick={logoutAdmin}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-red-600/90 text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('خروج', 'Logout')}</span>
            </button>
          </div>
        </div>

        {/* Real-Time Instant Alert Toast for New Pending OTP Requests */}
        {realtimeAlert && (
          <div className="bg-gradient-to-l from-amber-50 via-white to-amber-50 border-2 border-amber-400 rounded-2xl p-3.5 sm:p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Bell className="w-5 h-5" />
              </div>
              <div className="min-w-0 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-[#0F2438] text-sm">
                    {realtimeAlert.isPendingVerification
                      ? t('طلب تفعيل عميل جديد الآن!', 'New Client Verification Request!')
                      : t('تحديث حساب عميل وارد الآن!', 'Incoming Client Update!')}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[10.5px] font-black tabular-nums">
                    {realtimeAlert.timestamp}
                  </span>
                </div>
                <p className="text-slate-700 font-bold mt-0.5 truncate">
                  {realtimeAlert.name} ·{' '}
                  <span dir="ltr" className="tabular-nums text-[#0F2438]">
                    {formatPhoneForDisplay(realtimeAlert.phone)}
                  </span>
                  {realtimeAlert.otp && (
                    <span className="ms-2 text-[#0284C7] font-black tabular-nums">
                      OTP: {realtimeAlert.otp}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('messages_otp');
                  setSelectedClientPhone(null);
                  setRealtimeAlert(null);
                }}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('معالجة وتفعيل الآن', 'Handle & Activate Now')}</span>
              </button>
              <button
                type="button"
                onClick={() => setAlertSoundEnabled((v) => !v)}
                title={t('تشغيل/كتم تنبيه الصوت', 'Toggle Alert Chime')}
                className={`min-h-[38px] px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                  alertSoundEnabled
                    ? 'bg-white border-amber-300 text-[#0F2438]'
                    : 'bg-slate-100 border-slate-300 text-slate-500'
                }`}
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setRealtimeAlert(null)}
                aria-label={t('إغلاق التنبيه', 'Dismiss Alert')}
                className="min-h-[38px] px-2.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 4-Tab Organized CRM Navigation */}
        <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
          {canManageClients && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('requests');
                setSelectedClientPhone(null);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap min-h-[44px] ${
                activeTab === 'requests'
                  ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Inbox className="w-4 h-4 shrink-0" />
              <span>{t('الطلبات والملفات الواردة', 'Incoming Orders & Files')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-[10.5px] tabular-nums font-black border border-current/20">
                {travelers.length}
              </span>
            </button>
          )}

          {(canActivateOtp || canManageClients) && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('messages_otp');
                setSelectedClientPhone(null);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap min-h-[44px] ${
                activeTab === 'messages_otp'
                  ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>{t('الرسائل وتفعيل الحسابات', 'Messages & Account OTP')}</span>
              {pendingCount > 0 ? (
                <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-600 text-white text-[10.5px] font-black flex items-center justify-center tabular-nums">
                  {pendingCount}
                </span>
              ) : messagesBadgeCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-900 text-[10.5px] font-black tabular-nums">
                  {clientMessagesAndReceipts.length}
                </span>
              ) : null}
            </button>
          )}

          {canEditContent && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('ads');
                setSelectedClientPhone(null);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap min-h-[44px] ${
                activeTab === 'ads'
                  ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Megaphone className="w-4 h-4 shrink-0" />
              <span>{t('إدارة الإعلانات والعروض', 'Ads & Offers Manager')}</span>
              {!isEditUnlocked && <Lock className="w-3.5 h-3.5 opacity-60 shrink-0" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab('settings');
              setSelectedClientPhone(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap min-h-[44px] ${
              activeTab === 'settings'
                ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>{t('الخدمات والإعدادات', 'Services & Settings')}</span>
            {!isEditUnlocked && <Lock className="w-3.5 h-3.5 opacity-60 shrink-0" />}
          </button>
        </div>

        {/* ===================================================================== */}
        {/* TAB 1: INCOMING REQUESTS & UPLOADED CLIENT FILES (DIRECTORY VIEW)     */}
        {/* ===================================================================== */}
        {activeTab === 'requests' && canManageClients && !selectedClient && (
          <div className="space-y-4">
            {/* Compact Real-Time KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center tabular-nums">
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
                <span className="text-[11px] text-slate-500 block font-bold">
                  {t('إجمالي الطلبات', 'Total Requests')}
                </span>
                <span className="text-xl sm:text-2xl font-black text-[#0F2438]">{travelers.length}</span>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 shadow-xs">
                <span className="text-[11px] text-sky-900 block font-bold">
                  {t('طلبات قيد التنفيذ', 'Active Orders')}
                </span>
                <span className="text-xl sm:text-2xl font-black text-sky-900">{activeOrdersCount}</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 shadow-xs">
                <span className="text-[11px] text-amber-900 block font-bold">
                  {t('ملفات وإيصالات مرفوعة', 'With Uploaded Files')}
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-900">{withFilesCount}</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 shadow-xs">
                <span className="text-[11px] text-emerald-900 block font-bold">
                  {t('طلبات مكتملة', 'Completed')}
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-900">{completedCount}</span>
              </div>
            </div>

            {/* Search & Order Filter Pills */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-xs">
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
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: t(`الكل (${travelers.length})`, `All (${travelers.length})`) },
                    { id: 'active', label: t(`جارية (${activeOrdersCount})`, `Active (${activeOrdersCount})`) },
                    { id: 'with_files', label: t(`بها مرفقات (${withFilesCount})`, `With Files (${withFilesCount})`) },
                    { id: 'completed', label: t(`مكتملة (${completedCount})`, `Completed (${completedCount})`) },
                  ] as { id: OrderFilter; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setOrderFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11.5px] font-black transition cursor-pointer tabular-nums ${
                      orderFilter === f.id
                        ? 'bg-[#0F2438] text-[#E5C887]'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Client Order Cards */}
            {filteredRequests.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs sm:text-sm text-slate-500">
                {t('لا توجد طلبات أو ملفات عملاء تطابق البحث حالياً.', 'No client requests match your filter.')}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredRequests.map((client) => {
                  const docsCount = client.documents?.length || 0;
                  const receiptsCount = (client.documents || []).filter((d) => d.docType === 'receipt').length;
                  const clientDisplayName = getTravelerDisplayNames(client).fullDisplayName;
                  return (
                    <div
                      key={client.phone}
                      onClick={() => setSelectedClientPhone(client.phone)}
                      className="bg-white border border-slate-200 hover:border-[#C6A052]/80 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0">
                            {client.avatarUrl ? (
                              <img
                                src={getDisplayableDriveImageUrl(client.avatarUrl)}
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
                                    <span>{t('بانتظار التفعيل', 'Unverified')}</span>
                                  )}
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
                                  {t('الجواز:', 'Passport:')}{' '}
                                  <strong className="text-[#0F2438] uppercase">
                                    {client.passportNumber || t('غير مسجل', 'Not set')}
                                  </strong>
                                </span>
                                <span>·</span>
                                <span>
                                  {t('المرفقات:', 'Files:')}{' '}
                                  <strong className="text-[#0284C7]">{docsCount}</strong>
                                </span>
                                {receiptsCount > 0 && (
                                  <>
                                    <span>·</span>
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10.5px] font-black">
                                      {t(`إيصال دفع (${receiptsCount})`, `Receipt (${receiptsCount})`)}
                                    </span>
                                  </>
                                )}
                                {(client.familyMembers?.length || 0) > 0 && (
                                  <>
                                    <span>·</span>
                                    <span className="px-2 py-0.5 rounded-full bg-[#C6A052]/20 border border-[#C6A052]/50 text-[#0F2438] text-[10.5px] font-black">
                                      {t(
                                        `العائلة: ${client.familyMembers?.length}`,
                                        `Family: ${client.familyMembers?.length}`
                                      )}
                                    </span>
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
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 1 DETAIL: FULL CLIENT FOLDER VIEW                                 */}
        {/* ===================================================================== */}
        {activeTab === 'requests' && canManageClients && selectedClient && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedClientPhone(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <BackArrow className="w-4 h-4" />
                  <span>{t('العودة للطلبات', 'Back to Requests')}</span>
                </button>

                <div className="flex items-center gap-2.5">
                  {selectedClient.avatarUrl ? (
                    <img
                      src={getDisplayableDriveImageUrl(selectedClient.avatarUrl)}
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
                    disabled={selectedClient.verified && !isEditUnlocked}
                    onClick={() => handleToggleVerified(selectedClient)}
                    className={`px-3 py-2 rounded-xl text-xs font-black border transition cursor-pointer flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed ${
                      selectedClient.verified
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700 shadow-xs'
                    }`}
                  >
                    {selectedClient.verified ? (
                      t('حساب موثق ✓', 'Verified ✓')
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('تفعيل الحساب فوراً (بدون OTP)', 'Activate Instantly (No OTP)')}</span>
                      </>
                    )}
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
                    !isEditUnlocked ? (
                      <span
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center gap-1"
                        title={t('افتح وضع التعديل لحذف السجلات', 'Unlock Edit Mode to delete records')}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{t('الحذف مقفل', 'Delete Locked')}</span>
                      </span>
                    ) : confirmDeletePhone === selectedClient.phone ? (
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
                      `صور الجواز والمستندات وإيصالات الدفع (${selectedClient.documents?.length || 0})`,
                      `Uploaded Passports, Receipts & Docs (${selectedClient.documents?.length || 0})`
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
                            {isEditUnlocked && (
                              confirmDeleteDeliverableId === delDoc.id ? (
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
                              )
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

        {/* ===================================================================== */}
        {/* TAB 2: MESSAGES, INCOMING RECEIPTS & ACCOUNT OTP ACTIVATIONS          */}
        {/* ===================================================================== */}
        {activeTab === 'messages_otp' && (canActivateOtp || canManageClients) && (
          <div className="space-y-5">
            {/* Section A: Pending OTP Accounts & Quick WhatsApp/Instant Activation */}
            {canActivateOtp && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                        {t('تفعيل الحسابات وأكواد الـ OTP', 'Account Activations & OTP Queue')}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-black tabular-nums ${
                          pendingCount > 0
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {t(`${pendingCount} بانتظار التفعيل`, `${pendingCount} pending`)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t(
                        'صلاحية كود OTP 24 ساعة بالأرقام فقط (0-9)، ويمكنك إرساله عبر واتساب أو تفعيل الحساب فوراً بدون كود.',
                        'Numeric 6-digit OTPs valid for 24h. Send via WhatsApp or activate accounts instantaneously.'
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAllOtpClients((prev) => !prev)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-xs font-bold cursor-pointer transition"
                  >
                    {showAllOtpClients
                      ? t(`عرض المنتظرين فقط (${pendingCount})`, `Pending Only (${pendingCount})`)
                      : t(`عرض كل العملاء (${travelers.length})`, `Show All Clients (${travelers.length})`)}
                  </button>
                </div>

                {otpQueueClients.length === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center text-xs font-bold text-emerald-900">
                    {t(
                      'جميع الحسابات المسجلة مفعّلة وموثقة حالياً ✓',
                      'All registered traveler accounts are currently verified ✓'
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {otpQueueClients.map((client) => {
                      const displayName = getTravelerDisplayNames(client).fullDisplayName;
                      const otpValid = isOtpActiveAndUnexpired(client);
                      return (
                        <div
                          key={client.phone}
                          className={`rounded-2xl border p-4 space-y-3 ${
                            client.verified
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-amber-50/70 border-amber-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-sm font-black text-[#0F2438] block">
                                {displayName}
                              </span>
                              <span className="text-xs text-slate-600 tabular-nums" dir="ltr">
                                {formatPhoneForDisplay(client.phone)} · +{client.phoneNormalized || normalizePhone(client.phone)}
                              </span>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10.5px] font-black border shrink-0 ${
                                client.verified
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                                  : otpValid
                                  ? 'bg-sky-100 text-sky-900 border-sky-200'
                                  : 'bg-red-100 text-red-800 border-red-200'
                              }`}
                            >
                              {client.verified
                                ? t('موثق ✓', 'Verified ✓')
                                : otpValid
                                ? t('OTP صالح 24 ساعة', '24h Active OTP')
                                : t('OTP منتهي', 'Expired OTP')}
                            </span>
                          </div>

                          <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-slate-600">
                              {t('كود التفعيل:', 'OTP Code:')}
                            </span>
                            <span className="font-black text-[#0284C7] text-sm tracking-widest tabular-nums">
                              {client.otp}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-1.5 truncate" dir="ltr">
                            {buildActivationMagicLink(client.phone, client.otp, displayName)}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyActivationMsg(client)}
                              className="min-h-[38px] px-3 py-1.5 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                            >
                              {copiedPhone === client.phone ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>{t('تم النسخ!', 'Copied!')}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-[#E5C887]" />
                                  <span>{t('نسخ رسالة الكود للواتساب', 'Copy WhatsApp Code Message')}</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOneClickVerifyAndSendOtp(client)}
                              className="min-h-[38px] px-3 py-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer transition"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{t('إرسال الكود عبر واتساب', 'Send OTP WhatsApp')}</span>
                            </button>
                          </div>

                          {!client.verified && (
                            <button
                              type="button"
                              onClick={() => void handleAdminInstantActivate(client)}
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>
                                {t('تفعيل الحساب فوراً (بدون OTP)', 'Activate Account Instantly (No OTP)')}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Section B: Client Notes, Preferred Services & Uploaded Payment Receipts */}
            {canManageClients && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                    {t(
                      `الرسائل، نوع الطلبات، وإيصالات الدفع الواردة (${clientMessagesAndReceipts.length})`,
                      `Client Notes, Visa Requests & Payment Receipts (${clientMessagesAndReceipts.length})`
                    )}
                  </h3>
                </div>

                {clientMessagesAndReceipts.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center text-xs text-slate-500">
                    {t(
                      'لا توجد ملاحظات أو إيصالات دفع واردة حتى الآن.',
                      'No incoming client messages or payment receipts yet.'
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {clientMessagesAndReceipts.map((client) => {
                      const receipts = (client.documents || []).filter((d) => d.docType === 'receipt');
                      const displayName = getTravelerDisplayNames(client).fullDisplayName;
                      return (
                        <div
                          key={client.phone}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs sm:text-sm font-black text-[#0F2438]">
                                {displayName}
                              </span>
                              <span className="text-[11px] font-bold text-slate-500 tabular-nums" dir="ltr">
                                {formatPhoneForDisplay(client.phone)}
                              </span>
                              {client.preferredVisaType && (
                                <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10.5px] font-bold text-[#0284C7]">
                                  {client.preferredVisaType}
                                </span>
                              )}
                              {receipts.length > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-200 text-[10.5px] font-black text-emerald-900">
                                  {t(`إيصال دفع مرفق (${receipts.length})`, `Payment Receipt (${receipts.length})`)}
                                </span>
                              )}
                            </div>
                            {client.adminNotes && (
                              <p className="text-xs text-slate-700 leading-relaxed">
                                {client.adminNotes}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDirectWhatsAppChat(client)}
                              className="px-3 py-2 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>{t('رد واتساب', 'WhatsApp Reply')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenClientFromAnyTab(client.phone)}
                              className="px-3 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1 cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>{t('فتح الملف', 'Open Folder')}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Section C: Quick Add Client Form */}
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
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  dir="ltr"
                  value={newPhone}
                  onChange={(e) => setNewPhone(digitsOnly(e.target.value, 20))}
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

        {/* ===================================================================== */}
        {/* TAB 3: ADS, ANNOUNCEMENTS & OFFERS MANAGER (SAFE LOCK PROTECTED)      */}
        {/* ===================================================================== */}
        {activeTab === 'ads' && canEditContent && (
          <div className="space-y-5">
            <SafeLockBanner
              scopeLabelAr="إدارة الإعلانات والعروض"
              scopeLabelEn="Ads & Offers Manager"
            />

            <fieldset disabled={!isEditUnlocked} className="space-y-5 disabled:opacity-65">
              <form onSubmit={handleSaveAdsAndOffers} className="space-y-5">
                {/* Promotional Announcement Banner Manager */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                        {t(
                          'شريط الإعلانات والعروض الترويجية أعلى الموقع',
                          'Top Promotional Ads & Urgent Alert Banner'
                        )}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {t(
                          'يظهر أعلى شريط التنقل لجميع زوار المنصة عند تفعيله',
                          'Displayed at the top of the platform for all visitors when enabled'
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
                        {t('نص الإعلان / العرض (عربي)', 'Ad / Offer Text (Arabic)')}
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
                        {t('نص الإعلان / العرض (إنجليزي)', 'Ad / Offer Text (English)')}
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

                {/* Featured Hero Promotional Headline */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
                  <h4 className="text-sm font-black text-[#0F2438]">
                    {t('العنوان الترويجي البارز في الصفحة الرئيسية', 'Featured Home Hero Subtitle')}
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('العنوان الفرعي (عربي)', 'Featured Hero Subtitle (Arabic)')}
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

                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('العنوان الفرعي (إنجليزي)', 'Featured Hero Subtitle (English)')}
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
                      <span>{t('حفظ ونشر الإعلانات والعروض', 'Save & Publish Ads & Offers')}</span>
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
            </fieldset>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 4: SERVICES, CMS, STORAGE MONITOR & ADMIN SETTINGS                */}
        {/* ===================================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            <SafeLockBanner
              scopeLabelAr="الخدمات، الأسعار، والإعدادات"
              scopeLabelEn="Services, Pricing & Settings"
            />

            {/* 1. Live Site Editor & Services/CMS Overrides */}
            {canEditContent && (
              <fieldset disabled={!isEditUnlocked} className="space-y-5 disabled:opacity-65">
                <div className="bg-white border-2 border-[#C6A052]/60 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-[#0F2438]">
                      {t(
                        'تعديل الخدمات والأسعار والمحتوى مباشرة (Live Site Editor)',
                        'Live Services, Pricing & Inline Site Editor'
                      )}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {t(
                        'تعديل أي خدمة أو سعر أو وصف أو إضافة عروض جديدة مباشرة على صفحات الموقع.',
                        'Edit service titles, prices, descriptions, or add new items directly in place.'
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

                {/* Contact & Working Hours Form */}
                <form
                  onSubmit={handleSaveSettingsConfig}
                  className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs"
                >
                  <h4 className="text-sm font-black text-[#0F2438]">
                    {t('إعدادات الهاتف وساعات العمل الرسمية', 'Official Contact Phone & Working Hours')}
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('رقم الهاتف والواتساب الرسمي', 'Contact Phone / WhatsApp')}
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        dir="ltr"
                        value={siteDraft.phoneNumber}
                        onChange={(e) =>
                          setSiteDraft((prev) => ({
                            ...prev,
                            phoneNumber: digitsOnly(e.target.value, 20),
                          }))
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
                  </div>

                  {settingsSavedMsg && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                      {settingsSavedMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="min-h-[40px] px-4 py-2 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{t('حفظ بيانات التواصل', 'Save Contact Info')}</span>
                  </button>
                </form>

                {/* Flexible Multi-Account Google Drive Web App Cloud Storage Settings */}
                <form
                  onSubmit={handleSaveDriveStorageConfig}
                  className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4.5 h-4.5 text-[#0284C7] shrink-0" />
                      <div>
                        <h4 className="text-sm font-black text-[#0F2438]">
                          {t(
                            'إعدادات التخزين السحابي المرن (Google Drive Web App)',
                            'Flexible Cloud Storage Endpoints (Google Drive Web App)'
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {t(
                            'أدر رابط Google Drive الأساسي أو أضف حسابات Drive إضافية للتوزيع والنسخ الاحتياطي وتفادي امتلاء المساحة.',
                            'Configure your primary Google Drive Web App endpoint and add secondary Drive accounts for capacity scaling & automatic failover.'
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSiteDraft((prev) => ({
                          ...prev,
                          primaryDriveWebAppUrl: DEFAULT_PRIMARY_DRIVE_WEBAPP_URL,
                        }))
                      }
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t('استعادة الرابط الأساسي الافتراضي', 'Restore Default URL')}</span>
                    </button>
                  </div>

                  <div className="text-xs space-y-1.5">
                    <label className="block font-bold text-slate-700">
                      {t(
                        'رابط Google Drive Web App الأساسي (Primary Endpoint)',
                        'Primary Google Drive Web App URL'
                      )}
                    </label>
                    <input
                      type="url"
                      required
                      dir="ltr"
                      value={siteDraft.primaryDriveWebAppUrl}
                      onChange={(e) =>
                        setSiteDraft((prev) => ({
                          ...prev,
                          primaryDriveWebAppUrl: e.target.value,
                        }))
                      }
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-[#0F2438] text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  {/* Secondary / Multi-Account Google Drive Endpoints */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-[#0F2438]">
                        {t(
                          `حسابات Drive الإضافية / الاحتياطية (${siteDraft.additionalDriveWebApps?.length || 0})`,
                          `Secondary / Backup Drive Endpoints (${siteDraft.additionalDriveWebApps?.length || 0})`
                        )}
                      </span>
                    </div>

                    {(siteDraft.additionalDriveWebApps?.length || 0) > 0 && (
                      <div className="space-y-2">
                        {(siteDraft.additionalDriveWebApps || []).map((ep) => (
                          <div
                            key={ep.id}
                            className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-[#0F2438]">{ep.label}</span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                    ep.enabled
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : 'bg-slate-100 border-slate-200 text-slate-500'
                                  }`}
                                >
                                  {ep.enabled ? t('نشط', 'Active') : t('معطل', 'Disabled')}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-slate-500 truncate" dir="ltr">
                                {ep.url}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <select
                                value={ep.scope}
                                onChange={(e) =>
                                  handleChangeDriveEndpointScope(
                                    ep.id,
                                    e.target.value as DriveEndpointScope
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-[#0F2438]"
                              >
                                <option value="all">
                                  {t('الكل (تخزين احتياطي وتوزيع)', 'All Files (Failover)')}
                                </option>
                                <option value="client_docs">
                                  {t('مستندات العملاء فقط', 'Client Docs Only')}
                                </option>
                                <option value="admin_deliverables">
                                  {t('مستندات التنفيذ فقط (PDF)', 'Admin Deliverables Only')}
                                </option>
                              </select>

                              <button
                                type="button"
                                onClick={() => handleToggleDriveEndpoint(ep.id)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                  ep.enabled
                                    ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                }`}
                              >
                                {ep.enabled ? t('تعطيل', 'Disable') : t('تفعيل', 'Enable')}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteDriveEndpoint(ep.id)}
                                aria-label={t('حذف الحساب', 'Remove Endpoint')}
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Inline Form to Add New Google Drive Account */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                      <input
                        type="text"
                        value={newDriveLabel}
                        onChange={(e) => setNewDriveLabel(e.target.value)}
                        placeholder={t('اسم الحساب (مثل: Drive 2)', 'Label (e.g. Drive 2)')}
                        className="sm:col-span-3 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
                      />
                      <input
                        type="url"
                        dir="ltr"
                        value={newDriveUrl}
                        onChange={(e) => setNewDriveUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="sm:col-span-4 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-[#0F2438]"
                      />
                      <select
                        value={newDriveScope}
                        onChange={(e) => setNewDriveScope(e.target.value as DriveEndpointScope)}
                        className="sm:col-span-3 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#0F2438]"
                      >
                        <option value="all">{t('الكل (احتياطي وتوزيع)', 'All Files')}</option>
                        <option value="client_docs">{t('مستندات العملاء فقط', 'Client Docs')}</option>
                        <option value="admin_deliverables">
                          {t('مستندات التنفيذ (PDF)', 'Admin Deliverables')}
                        </option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddSecondaryDriveEndpoint}
                        className="sm:col-span-2 min-h-[38px] px-3 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('إضافة', 'Add')}</span>
                      </button>
                    </div>
                  </div>

                  {driveErrorMsg && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800">
                      {driveErrorMsg}
                    </div>
                  )}

                  {driveSavedMsg && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                      {driveSavedMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="min-h-[40px] px-4 py-2 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{t('حفظ روابط التخزين السحابي', 'Save Cloud Storage Settings')}</span>
                  </button>
                </form>

                {/* Saved Live CMS Overrides, Custom Items & Deleted Blocks */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-[#0F2438]">
                        {t('سجل تعديلات الخدمات والنصوص والبنود المضافة', 'Services & Live CMS Overrides')}
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
              </fieldset>
            )}

            {/* 2. Storage Monitor & Smart Cleanup Card (15 GB Google Drive Free Quota) */}
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

                {/* Smart 1-Click Cleanup Tool (Locked unless isEditUnlocked) */}
                <fieldset disabled={!isEditUnlocked} className="disabled:opacity-65">
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
                </fieldset>

                {cleanupFeedback && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{cleanupFeedback}</span>
                  </div>
                )}
              </div>
            )}

            {/* 3. SUB-ADMINS & GRANULAR PERMISSIONS MANAGER (GENERAL MANAGER EXCLUSIVE) */}
            {isSuperAdmin ? (
              <fieldset disabled={!isEditUnlocked} className="space-y-5 disabled:opacity-65">
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
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          required
                          dir="ltr"
                          value={subPin}
                          onChange={(e) => setSubPin(digitsOnly(e.target.value, 20))}
                          placeholder="e.g. 4455"
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
                        />
                      </div>
                    </div>

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

                {/* 4. Change General Manager PIN */}
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
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        dir="ltr"
                        required
                        value={currentPinDraft}
                        onChange={(e) => setCurrentPinDraft(digitsOnly(e.target.value, 20))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums [-webkit-text-security:disc]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('الرمز الجديد', 'New PIN')}
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        dir="ltr"
                        required
                        value={newPinDraft}
                        onChange={(e) => setNewPinDraft(digitsOnly(e.target.value, 20))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums [-webkit-text-security:disc]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        {t('تأكيد الرمز الجديد', 'Confirm New PIN')}
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        dir="ltr"
                        required
                        value={confirmPinDraft}
                        onChange={(e) => setConfirmPinDraft(digitsOnly(e.target.value, 20))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums [-webkit-text-security:disc]"
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
              </fieldset>
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

            {/* 5. Full Backup / Export JSON (Read-Only Safe Export) */}
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

import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  KeyRound,
  LogOut,
  Upload,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Save,
  ScanLine,
  Loader2,
  Sparkles,
  Camera,
  RotateCcw,
  Eye,
  EyeOff,
  X,
  ArrowRight,
  ArrowLeft,
  FolderOpen,
  ClipboardList,
  Download,
  Users,
  Plus,
  Edit3,
  Lock,
  Smartphone,
  ShieldAlert,
  CalendarCheck2,
  Check,
  Bell,
  FileCheck2,
  ExternalLink,
  QrCode,
  MapPin,
} from 'lucide-react';
import { AppointmentQrPassModal } from './AppointmentQrPassModal';
import {
  FamilyMember,
  FamilyRelationship,
  PassportAiCheckResult,
  TravelerDocument,
  TravelerProfile,
  TravelerSessionMeta,
} from '../types/travel';
import {
  FAMILY_RELATIONSHIPS,
  TravelerProfileDraft,
  VISA_ORDER_STATUSES,
  buildClientOtpWhatsAppUrl,
  buildOrderCodeFromPhone,
  checkClientAccountAndDeviceCloud,
  commitTravelerProfileDraftCloud,
  compressImageToDataUrl,
  deleteFamilyMemberCloud,
  digitsOnly,
  formatPhoneForDisplay,
  getOrderStatusStageIndex,
  getRelationshipLabel,
  getTravelerDisplayNames,
  initiateTravelerOtpLoginCloud,
  loginWithTrustedDevicePinCloud,
  logoutTravelerSession,
  markClientNotificationsReadCloud,
  normalizeArabicDigits,
  normalizePhone,
  requestAccountSecurityOtpCloud,
  revokeTrustedDeviceCloud,
  saveFamilyMemberCloud,
  setClientPinCloud,
  splitPassportName,
  startTravelerSession,
  subscribePendingClientCloud,
  trustCurrentDeviceCloud,
  verifyAccountSecurityOtpCloud,
  verifyLoginOtpCloud,
} from '../utils/travelerStore';
import {
  getDeviceFingerprint,
  getRemainingTemporaryMinutes,
  isDeviceInTrustedList,
} from '../utils/deviceTrust';
import {
  buildDescriptiveFilename,
  downloadCloudFile,
  getDisplayableDriveImageUrl,
  getDriveViewUrl,
  imageUrlToBase64,
} from '../utils/firebaseStorageHelper';
import { translateOrderStatus } from '../data/travelData';
import { openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useLanguage } from '../contexts/LanguageContext';

export type TravelerSubTab = 'account' | 'orders' | 'documents';

export interface PendingPostAuthFlow {
  phone: string;
  stage: 'pin_setup' | 'device_trust_prompt';
  isPinReset?: boolean;
}

type LoggedOutAuthStage =
  | 'phone_entry'
  | 'register_details'
  | 'pin_login'
  | 'otp_verify'
  | 'pin_setup'
  | 'device_trust_prompt';

type OtpPurpose = 'first_login' | 'untrusted_device' | 'forgot_pin';

interface TravelerWorkspaceScreenProps {
  activeTraveler: TravelerProfile | null;
  sessionMeta?: TravelerSessionMeta | null;
  subTab: TravelerSubTab;
  onChangeSubTab: (tab: TravelerSubTab) => void;
  draft: TravelerProfileDraft;
  onUpdateDraft: (updater: (prev: TravelerProfileDraft) => TravelerProfileDraft) => void;
  onResetDraft: () => void;
  pendingOtpPhone: string | null;
  onSetPendingOtpPhone: (phone: string | null) => void;
  pendingPostAuthFlow?: PendingPostAuthFlow | null;
  onSetPendingPostAuthFlow?: (flow: PendingPostAuthFlow | null) => void;
  magicLinkFeedback?: string | null;
  onClearMagicLinkFeedback?: () => void;
  sessionExpiredAlert?: string | null;
  onClearSessionExpiredAlert?: () => void;
  onNavigateToAiScanner?: () => void;
  onNavigateToServices?: () => void;
  onGoHome?: () => void;
}

export const TravelerWorkspaceScreen: React.FC<TravelerWorkspaceScreenProps> = ({
  activeTraveler,
  sessionMeta,
  subTab,
  onChangeSubTab,
  draft,
  onUpdateDraft,
  onResetDraft,
  pendingOtpPhone,
  onSetPendingOtpPhone,
  pendingPostAuthFlow,
  onSetPendingPostAuthFlow,
  magicLinkFeedback,
  onClearMagicLinkFeedback,
  sessionExpiredAlert,
  onClearSessionExpiredAlert,
  onNavigateToAiScanner,
  onNavigateToServices,
  onGoHome,
}) => {
  const { lang, isAr, dir, t } = useLanguage();
  const BackArrow = isAr ? ArrowRight : ArrowLeft;
  const currentDevice = getDeviceFingerprint();

  // Multi-stage Smart Auth Flow (Trusted Device PIN + Untrusted WhatsApp OTP + Device Trust Prompt)
  const [authStage, setAuthStage] = useState<LoggedOutAuthStage>('phone_entry');
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>('first_login');
  const [trustedPhone, setTrustedPhone] = useState('');
  const [detectedClientName, setDetectedClientName] = useState('');
  const [loginFirstName, setLoginFirstName] = useState('');
  const [loginLastName, setLoginLastName] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [authError, setAuthError] = useState('');
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [isInitiatingOtp, setIsInitiatingOtp] = useState(false);

  // Trusted Device Fast 6-digit PIN Login
  const [pinLoginInput, setPinLoginInput] = useState('');
  const [showPinLogin, setShowPinLogin] = useState(false);
  const [pinLoginError, setPinLoginError] = useState('');
  const [isLoggingInWithPin, setIsLoggingInWithPin] = useState(false);

  // Logged-out Step 2 OTP unlock (with 24h validity countdown & Admin real-time instant activation)
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpInfoBanner, setOtpInfoBanner] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpRemainingMs, setOtpRemainingMs] = useState<number | null>(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Create / Reset Personal 6-digit PIN
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [showSetupPins, setShowSetupPins] = useState(false);
  const [pinSetupError, setPinSetupError] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [isFinalizingTrust, setIsFinalizingTrust] = useState(false);

  // Logged-in Account Security & Devices Section State
  const [remainingTempMinutes, setRemainingTempMinutes] = useState<number | null>(() =>
    getRemainingTemporaryMinutes(sessionMeta || null)
  );
  const [confirmRevokeDeviceId, setConfirmRevokeDeviceId] = useState<string | null>(null);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  const [securityFeedback, setSecurityFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [changePinStep, setChangePinStep] = useState<'idle' | 'otp' | 'new_pin'>('idle');
  const [changePinOtpInput, setChangePinOtpInput] = useState('');
  const [changePinNewInput, setChangePinNewInput] = useState('');
  const [changePinConfirmInput, setChangePinConfirmInput] = useState('');
  const [showChangePins, setShowChangePins] = useState(false);
  const [changePinError, setChangePinError] = useState('');
  const [isProcessingChangePin, setIsProcessingChangePin] = useState(false);

  // Wallet & Account Form controls
  const [docLabel, setDocLabel] = useState(t('صورة جواز السفر', 'Passport Copy'));
  const [docType, setDocType] = useState<TravelerDocument['docType']>('passport');
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isExtractingPassport, setIsExtractingPassport] = useState(false);
  const [passportExtractFeedback, setPassportExtractFeedback] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);
  const [previewLightbox, setPreviewLightbox] = useState<{
    label: string;
    dataUrl: string;
    downloadName?: string;
  } | null>(null);

  // Family Member & Companions Form Controls
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberRelationship, setMemberRelationship] = useState<FamilyRelationship>('spouse');
  const [memberFirstName, setMemberFirstName] = useState('');
  const [memberLastName, setMemberLastName] = useState('');
  const [memberPassportFullName, setMemberPassportFullName] = useState('');
  const [memberPassportNumber, setMemberPassportNumber] = useState('');
  const [memberPassportExpiry, setMemberPassportExpiry] = useState('');
  const [memberNationality, setMemberNationality] = useState('');
  const [memberPassportPhotoUrl, setMemberPassportPhotoUrl] = useState('');
  const [memberPersonalPhotoUrl, setMemberPersonalPhotoUrl] = useState('');
  const [isExtractingMemberPassport, setIsExtractingMemberPassport] = useState(false);
  const [memberOcrFeedback, setMemberOcrFeedback] = useState<string | null>(null);
  const [memberFormError, setMemberFormError] = useState<string | null>(null);
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [familySectionFeedback, setFamilySectionFeedback] = useState<string | null>(null);
  const [confirmDeleteMemberId, setConfirmDeleteMemberId] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [showQrPassModal, setShowQrPassModal] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const accountPassportInputRef = useRef<HTMLInputElement>(null);
  const walletFileInputRef = useRef<HTMLInputElement>(null);
  const memberPassportInputRef = useRef<HTMLInputElement>(null);
  const memberPersonalPhotoInputRef = useRef<HTMLInputElement>(null);
  const otpBoxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pinBoxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const hydratedPendingPhoneRef = useRef<string | null>(null);

  // Sync Magic Link / external pending post-auth stage cleanly
  useEffect(() => {
    if (activeTraveler) {
      hydratedPendingPhoneRef.current = null;
      return;
    }
    if (pendingPostAuthFlow) {
      setTrustedPhone(pendingPostAuthFlow.phone);
      setAuthStage(pendingPostAuthFlow.stage);
      if (pendingPostAuthFlow.isPinReset) {
        setOtpPurpose('forgot_pin');
      }
      setPinSetupError('');
      setNewPinInput('');
      setConfirmPinInput('');
      return;
    }
    if (
      pendingOtpPhone &&
      authStage !== 'otp_verify' &&
      authStage !== 'pin_setup' &&
      authStage !== 'device_trust_prompt'
    ) {
      setTrustedPhone(pendingOtpPhone);
      setAuthStage('otp_verify');
    }
  }, [pendingPostAuthFlow, pendingOtpPhone, activeTraveler, authStage]);

  // Re-hydrate pending_verification state from Firestore when page reloads mid-verification
  useEffect(() => {
    if (activeTraveler || pendingPostAuthFlow || !pendingOtpPhone) return;
    if (hydratedPendingPhoneRef.current === pendingOtpPhone) return;
    hydratedPendingPhoneRef.current = pendingOtpPhone;

    let cancelled = false;
    void checkClientAccountAndDeviceCloud(pendingOtpPhone).then((check) => {
      if (cancelled) return;
      if (!check.exists || !check.profile) {
        onSetPendingOtpPhone(null);
        setAuthStage('phone_entry');
        return;
      }

      const profile = check.profile;
      setTrustedPhone(profile.phone);
      if (profile.name) setDetectedClientName(profile.name);
      if (profile.otpExpiresAt && !profile.otpConsumed) {
        setOtpExpiresAt(profile.otpExpiresAt);
      }

      const stillPending = !profile.verified || profile.accountStatus === 'pending_verification';
      if (stillPending) {
        setOtpPurpose('first_login');
        setAuthStage('otp_verify');
        return;
      }

      if (!check.hasPin) {
        onSetPendingPostAuthFlow?.({
          phone: profile.phone,
          stage: 'pin_setup',
          isPinReset: false,
        });
        setAuthStage('pin_setup');
        return;
      }

      if (check.isTrustedDevice) {
        onSetPendingOtpPhone(null);
        setAuthStage('pin_login');
      } else {
        setOtpPurpose('untrusted_device');
        setAuthStage('otp_verify');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeTraveler,
    pendingPostAuthFlow,
    pendingOtpPhone,
    onSetPendingOtpPhone,
    onSetPendingPostAuthFlow,
  ]);

  // Live 1-second countdown ticker for 24-hour OTP validity window
  useEffect(() => {
    if (activeTraveler || authStage !== 'otp_verify' || !otpExpiresAt) {
      setOtpRemainingMs(null);
      return;
    }
    const updateRemaining = () => {
      const exp = Date.parse(otpExpiresAt);
      if (!Number.isFinite(exp)) {
        setOtpRemainingMs(null);
        return;
      }
      setOtpRemainingMs(Math.max(0, exp - Date.now()));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [activeTraveler, authStage, otpExpiresAt]);

  // Real-time Firestore listener while waiting on OTP screen:
  // If Admin taps "تفعيل الحساب فوراً (بدون OTP)", immediately move client to PIN setup / Device trust!
  useEffect(() => {
    if (activeTraveler || authStage !== 'otp_verify') return;
    const waitPhone = pendingOtpPhone || trustedPhone;
    if (!waitPhone) return;

    return subscribePendingClientCloud(waitPhone, (cloudProfile) => {
      if (cloudProfile.otpExpiresAt && !cloudProfile.otpConsumed) {
        setOtpExpiresAt(cloudProfile.otpExpiresAt);
      }

      if (
        cloudProfile.verified &&
        (cloudProfile.activatedByAdmin || cloudProfile.adminBypassOtpAt) &&
        otpPurpose !== 'forgot_pin'
      ) {
        const verifiedPhone = cloudProfile.phone;
        setTrustedPhone(verifiedPhone);
        if (cloudProfile.name) setDetectedClientName(cloudProfile.name);
        setOtpInput('');
        setOtpError('');

        const hasPin = Boolean(
          cloudProfile.pinHash && /^[a-f0-9]{64}$/.test(cloudProfile.pinHash)
        );
        const trusted = isDeviceInTrustedList(
          cloudProfile.trustedDevices,
          currentDevice.deviceId
        );

        if (!hasPin) {
          onSetPendingPostAuthFlow?.({
            phone: verifiedPhone,
            stage: 'pin_setup',
            isPinReset: false,
          });
          setNewPinInput('');
          setConfirmPinInput('');
          setPinSetupError('');
          setOtpInfoBanner(
            t(
              'تم تفعيل حسابك فوراً من قبل الإدارة! أنشئ رمز الـ PIN الشخصي (6 أرقام).',
              'Your account has been instantly activated by Admin! Create your 6-digit PIN now.'
            )
          );
          setAuthStage('pin_setup');
          return;
        }

        if (!trusted) {
          onSetPendingPostAuthFlow?.({
            phone: verifiedPhone,
            stage: 'device_trust_prompt',
          });
          setAuthStage('device_trust_prompt');
          return;
        }

        void trustCurrentDeviceCloud(verifiedPhone).then(() => {
          onSetPendingOtpPhone(null);
          onSetPendingPostAuthFlow?.(null);
          setAuthStage('phone_entry');
          onChangeSubTab('account');
        });
      }
    });
  }, [
    activeTraveler,
    authStage,
    pendingOtpPhone,
    trustedPhone,
    otpPurpose,
    currentDevice.deviceId,
    onSetPendingPostAuthFlow,
    onSetPendingOtpPhone,
    onChangeSubTab,
    t,
  ]);

  // Live minute ticker for 1-hour temporary session countdown badge
  useEffect(() => {
    setRemainingTempMinutes(getRemainingTemporaryMinutes(sessionMeta || null));
    if (!sessionMeta || sessionMeta.mode !== 'temporary' || !sessionMeta.expiresAt) return;
    const interval = window.setInterval(() => {
      setRemainingTempMinutes(getRemainingTemporaryMinutes(sessionMeta));
    }, 30000);
    return () => window.clearInterval(interval);
  }, [sessionMeta]);

  const handleDirectDownload = async (key: string, url: string, filename: string) => {
    if (!url) return;
    setDownloadingKey(key);
    try {
      await downloadCloudFile(url, filename);
    } finally {
      setDownloadingKey((curr) => (curr === key ? null : curr));
    }
  };

  const resetFamilyForm = () => {
    setShowFamilyForm(false);
    setEditingMemberId(null);
    setMemberRelationship('spouse');
    setMemberFirstName('');
    setMemberLastName('');
    setMemberPassportFullName('');
    setMemberPassportNumber('');
    setMemberPassportExpiry('');
    setMemberNationality('');
    setMemberPassportPhotoUrl('');
    setMemberPersonalPhotoUrl('');
    setMemberOcrFeedback(null);
    setMemberFormError(null);
  };

  const handleOpenAddFamilyMember = () => {
    resetFamilyForm();
    setShowFamilyForm(true);
    setFamilySectionFeedback(null);
  };

  const handleOpenEditFamilyMember = (member: FamilyMember) => {
    setEditingMemberId(member.id);
    setMemberRelationship(member.relationship);
    setMemberFirstName(member.firstName);
    setMemberLastName(member.lastName);
    setMemberPassportFullName(member.passportFullName || '');
    setMemberPassportNumber(member.passportNumber);
    setMemberPassportExpiry(member.passportExpiryDate || '');
    setMemberNationality(member.nationality || '');
    setMemberPassportPhotoUrl(member.passportPhotoUrl);
    setMemberPersonalPhotoUrl(member.personalPhotoUrl);
    setMemberOcrFeedback(null);
    setMemberFormError(null);
    setFamilySectionFeedback(null);
    setShowFamilyForm(true);
  };

  const runMemberPassportOcr = async (base64: string, mimeType: string) => {
    setIsExtractingMemberPassport(true);
    setMemberOcrFeedback(null);
    try {
      const response = await fetch('/api/passport-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          visaType: draft.preferredVisaType,
          lang,
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) return;
      const data = (await response.json()) as { result?: PassportAiCheckResult };
      const extracted = data.result;
      if (!extracted) return;

      const cleanNo = (extracted.passportNumber || '').trim().toUpperCase();
      const extractedFull = (extracted.fullName || '').trim();
      const parts = extractedFull ? splitPassportName(extractedFull) : null;

      if (cleanNo) setMemberPassportNumber(cleanNo);
      if (extractedFull) setMemberPassportFullName(extractedFull);
      if (parts?.firstName) setMemberFirstName(parts.firstName);
      if (parts?.lastName) setMemberLastName(parts.lastName);
      if (extracted.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(extracted.expiryDate)) {
        setMemberPassportExpiry(extracted.expiryDate);
      }
      if (extracted.nationality && extracted.nationality.trim()) {
        setMemberNationality(extracted.nationality.trim());
      }

      if (cleanNo || extractedFull) {
        setMemberOcrFeedback(
          t(
            `تم قراءة بيانات الجواز وتعبئتها تلقائياً (${cleanNo || extractedFull}).`,
            `Passport data auto-filled via AI OCR (${cleanNo || extractedFull}).`
          )
        );
      }
    } catch {
      // Allow manual typing seamlessly
    } finally {
      setIsExtractingMemberPassport(false);
    }
  };

  const handlePickMemberPassportPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMemberFormError(null);
    try {
      const compressed = await compressImageToDataUrl(file, 1100, 0.76);
      setMemberPassportPhotoUrl(compressed.dataUrl);
      void runMemberPassportOcr(compressed.base64, compressed.mimeType);
    } catch {
      setMemberFormError(
        t('تعذر معالجة صورة جواز السفر المختارة.', 'Could not process selected passport photo.')
      );
    }
    if (memberPassportInputRef.current) memberPassportInputRef.current.value = '';
  };

  const handlePickMemberPersonalPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMemberFormError(null);
    try {
      const compressed = await compressImageToDataUrl(file, 520, 0.8);
      setMemberPersonalPhotoUrl(compressed.dataUrl);
    } catch {
      setMemberFormError(
        t('تعذر معالجة الصورة الشخصية المختارة.', 'Could not process selected personal photo.')
      );
    }
    if (memberPersonalPhotoInputRef.current) memberPersonalPhotoInputRef.current.value = '';
  };

  const handleSaveMemberSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeTraveler) return;
    setMemberFormError(null);

    const missing: string[] = [];
    if (!memberFirstName.trim()) missing.push(t('الاسم الأول', 'First Name'));
    if (!memberLastName.trim()) missing.push(t('الاسم الأخير', 'Last Name'));
    if (!memberPassportNumber.trim()) missing.push(t('رقم جواز السفر', 'Passport Number'));
    if (!memberPassportPhotoUrl) missing.push(t('صورة جواز السفر', 'Passport Photo'));
    if (!memberPersonalPhotoUrl) missing.push(t('الصورة الشخصية', 'Personal Photo'));

    if (missing.length > 0) {
      setMemberFormError(
        t(
          `يرجى استكمال البيانات والصور الإلزامية: ${missing.join('، ')}.`,
          `Please complete all required fields & photos: ${missing.join(', ')}.`
        )
      );
      return;
    }

    setIsSavingMember(true);
    try {
      await saveFamilyMemberCloud(activeTraveler.phone, {
        ...(editingMemberId ? { id: editingMemberId } : {}),
        relationship: memberRelationship,
        firstName: memberFirstName.trim(),
        lastName: memberLastName.trim(),
        passportFullName:
          memberPassportFullName.trim() ||
          `${memberFirstName.trim()} ${memberLastName.trim()}`.trim(),
        passportNumber: memberPassportNumber.trim().toUpperCase(),
        passportExpiryDate: memberPassportExpiry,
        nationality: memberNationality.trim(),
        passportPhotoUrl: memberPassportPhotoUrl,
        personalPhotoUrl: memberPersonalPhotoUrl,
      });
      const wasEdit = Boolean(editingMemberId);
      resetFamilyForm();
      setFamilySectionFeedback(
        wasEdit
          ? t('تم تحديث بيانات المرافق ومزامنتها سحابياً بنجاح.', 'Family member updated & synced to cloud.')
          : t('تمت إضافة المرافق وحفظ ملفاته في محفظتك السحابية.', 'Family member added & saved to cloud vault.')
      );
      setTimeout(() => setFamilySectionFeedback(null), 4000);
    } catch {
      setMemberFormError(
        t(
          'حدث خطأ أثناء رفع وحفظ بيانات المرافق. يرجى المحاولة مرة أخرى.',
          'Failed to upload and save family member. Please try again.'
        )
      );
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleConfirmDeleteMember = async (memberId: string) => {
    if (!activeTraveler) return;
    await deleteFamilyMemberCloud(activeTraveler.phone, memberId);
    setConfirmDeleteMemberId(null);
    if (editingMemberId === memberId) {
      resetFamilyForm();
    }
    setFamilySectionFeedback(
      t('تم حذف ملف المرافق من محفظتك السحابية.', 'Family member removed from cloud vault.')
    );
    setTimeout(() => setFamilySectionFeedback(null), 3500);
  };

  // Step 1A: Smart Phone Lookup (Trusted Device -> 6-digit PIN | Untrusted/PIN-less -> OTP | New -> Register)
  const handleCheckPhoneContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setOtpError('');
    setPinLoginError('');
    onClearMagicLinkFeedback?.();
    onClearSessionExpiredAlert?.();

    const normalized = normalizePhone(loginPhone);
    if (normalized.length < 8) {
      setAuthError(
        t(
          'يرجى إدخال رقم واتساب صحيح (مثل: 01012345678).',
          'Please enter a valid WhatsApp number (e.g. 01012345678).'
        )
      );
      return;
    }

    setIsCheckingPhone(true);
    try {
      const check = await checkClientAccountAndDeviceCloud(loginPhone);
      if (!check.validPhone || !check.phone) {
        setAuthError(t('رقم الواتساب غير صالح.', 'Invalid WhatsApp number.'));
        return;
      }

      setTrustedPhone(check.phone);

      if (check.exists && check.profile) {
        setDetectedClientName(check.profile.name || '');

        const isPendingVerification =
          !check.profile.verified || check.profile.accountStatus === 'pending_verification';

        // Strict hold: unverified accounts MUST verify OTP (or receive Admin instant activation) first
        if (isPendingVerification) {
          setOtpPurpose('first_login');
          const res = await initiateTravelerOtpLoginCloud('', '', check.phone);
          if (!res.ok) {
            setAuthError(res.error || t('تعذر بدء تسجيل الدخول.', 'Could not start login.'));
            return;
          }
          setOtpExpiresAt(res.otpExpiresAt || res.profile?.otpExpiresAt || null);
          setOtpInfoBanner(
            t(
              'حسابك معلّق حالياً بانتظار التفعيل بالكود. يرجى إدخال كود التفعيل المكون من 6 أرقام للمتابعة.',
              'Your account is currently pending OTP activation. Enter your 6-digit OTP to continue.'
            )
          );
          onSetPendingOtpPhone(check.phone);
          setOtpInput('');
          setAuthStage('otp_verify');
          return;
        }

        if (check.isTrustedDevice && check.hasPin) {
          setPinLoginInput('');
          setPinLoginError('');
          onSetPendingOtpPhone(null);
          onSetPendingPostAuthFlow?.(null);
          setAuthStage('pin_login');
          return;
        }

        // If Admin already activated this account without OTP and user hasn't created a PIN yet, go straight to PIN setup
        if (check.profile.verified && check.profile.activatedByAdmin && !check.hasPin) {
          onSetPendingOtpPhone(check.phone);
          onSetPendingPostAuthFlow?.({
            phone: check.phone,
            stage: 'pin_setup',
            isPinReset: false,
          });
          setNewPinInput('');
          setConfirmPinInput('');
          setPinSetupError('');
          setOtpInfoBanner(
            t(
              'تم تفعيل حسابك من قبل الإدارة مسبقاً! يرجى تعيين رمز الـ PIN الشخصي (6 أرقام) للدخول.',
              'Your account is already activated by Admin! Create your personal 6-digit PIN to proceed.'
            )
          );
          setAuthStage('pin_setup');
          return;
        }

        // Untrusted device or missing PIN -> issue fresh 6-digit OTP
        setOtpPurpose(check.hasPin ? 'untrusted_device' : 'first_login');
        const res = await initiateTravelerOtpLoginCloud('', '', check.phone);
        if (!res.ok) {
          setAuthError(res.error || t('تعذر بدء تسجيل الدخول.', 'Could not start login.'));
          return;
        }
        setOtpExpiresAt(res.otpExpiresAt || res.profile?.otpExpiresAt || null);
        setOtpInfoBanner('');
        onSetPendingOtpPhone(check.phone);
        setOtpInput('');
        setAuthStage('otp_verify');
        return;
      }

      // Brand new client -> gather passport-matching First & Last Name first
      setDetectedClientName('');
      setAuthStage('register_details');
    } finally {
      setIsCheckingPhone(false);
    }
  };

  // Step 1B: New Client Name Entry -> Issue fresh 6-digit OTP (valid 24h) in Firestore
  const handleInitiateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setOtpError('');
    setOtpInfoBanner('');
    onClearMagicLinkFeedback?.();
    onClearSessionExpiredAlert?.();

    const cleanFirst = loginFirstName.trim();
    const cleanLast = loginLastName.trim();
    const targetPhone = trustedPhone || loginPhone;
    const normalized = normalizePhone(targetPhone);

    if (!cleanFirst || !cleanLast || normalized.length < 8) {
      setAuthError(
        t(
          'يرجى إدخال الاسم الأول والاسم الأخير (حسب الجواز) ورقم واتساب صحيح.',
          'Please enter your First Name, Last Name (as on passport), and a valid WhatsApp number.'
        )
      );
      return;
    }

    setIsInitiatingOtp(true);
    try {
      const res = await initiateTravelerOtpLoginCloud(cleanFirst, cleanLast, targetPhone);
      if (!res.ok || !res.phone) {
        setAuthError(res.error || t('تعذر بدء تسجيل الدخول.', 'Could not start login.'));
        return;
      }
      setTrustedPhone(res.phone);
      setDetectedClientName(`${cleanFirst} ${cleanLast}`.trim());
      setOtpPurpose('first_login');
      setOtpExpiresAt(res.otpExpiresAt || res.profile?.otpExpiresAt || null);
      onSetPendingOtpPhone(res.phone);
      setOtpInput('');
      setAuthStage('otp_verify');
    } finally {
      setIsInitiatingOtp(false);
    }
  };

  // Trusted Device Fast PIN Entry Helpers
  const pinLoginDigits = Array.from({ length: 6 }, (_, i) => {
    const clean = normalizeArabicDigits(pinLoginInput).replace(/\D/g, '');
    return clean[i] || '';
  });

  const handlePinBoxChange = (index: number, rawValue: string) => {
    setPinLoginError('');
    const digits = normalizeArabicDigits(rawValue).replace(/\D/g, '');

    if (!digits) {
      const next = [...pinLoginDigits];
      next[index] = '';
      setPinLoginInput(next.join(''));
      return;
    }

    if (digits.length > 1) {
      const pasted = digits.slice(0, 6);
      setPinLoginInput(pasted);
      const focusIdx = Math.min(5, pasted.length - 1);
      pinBoxRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...pinLoginDigits];
    next[index] = digits;
    setPinLoginInput(next.join(''));
    if (index < 5) {
      pinBoxRefs.current[index + 1]?.focus();
    }
  };

  const handlePinBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!pinLoginDigits[index] && index > 0) {
        e.preventDefault();
        const next = [...pinLoginDigits];
        next[index - 1] = '';
        setPinLoginInput(next.join(''));
        pinBoxRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      pinBoxRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      pinBoxRefs.current[index + 1]?.focus();
    }
  };

  const handlePinBoxPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setPinLoginError('');
    const raw = e.clipboardData.getData('text') || '';
    const digits = normalizeArabicDigits(raw).replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    setPinLoginInput(digits);
    const focusIdx = Math.min(5, digits.length - 1);
    pinBoxRefs.current[focusIdx]?.focus();
  };

  const handlePinLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPhone = trustedPhone || normalizePhone(loginPhone);
    if (!targetPhone) return;
    setPinLoginError('');

    const cleanPin = normalizeArabicDigits(pinLoginInput).replace(/\D/g, '');
    if (cleanPin.length !== 6) {
      setPinLoginError(
        t('يرجى إدخال رمز الـ PIN المكون من 6 أرقام.', 'Please enter your 6-digit PIN.')
      );
      return;
    }

    setIsLoggingInWithPin(true);
    try {
      const res = await loginWithTrustedDevicePinCloud(targetPhone, cleanPin, lang);
      if (!res.ok) {
        if (res.fallbackToOtp) {
          const sec = await requestAccountSecurityOtpCloud(targetPhone);
          onSetPendingOtpPhone(targetPhone);
          setOtpExpiresAt(sec.otpExpiresAt || null);
          setOtpPurpose('untrusted_device');
          setOtpInput('');
          setOtpError(res.error || '');
          setAuthStage('otp_verify');
          return;
        }
        setPinLoginError(
          res.error || t('رمز الـ PIN غير صحيح.', 'Incorrect 6-digit PIN.')
        );
        return;
      }

      setPinLoginInput('');
      setAuthStage('phone_entry');
      onSetPendingOtpPhone(null);
      onSetPendingPostAuthFlow?.(null);
      onChangeSubTab('account');
    } finally {
      setIsLoggingInWithPin(false);
    }
  };

  const handleSwitchPinLoginToForgotOtp = async () => {
    const targetPhone = trustedPhone || normalizePhone(loginPhone);
    if (!targetPhone) return;
    setPinLoginError('');
    setIsLoggingInWithPin(true);
    try {
      const res = await requestAccountSecurityOtpCloud(targetPhone);
      if (!res.ok) {
        setPinLoginError(
          res.error || t('تعذر إرسال طلب استعادة الـ PIN.', 'Could not start PIN recovery.')
        );
        return;
      }
      setOtpPurpose('forgot_pin');
      setOtpExpiresAt(res.otpExpiresAt || null);
      onSetPendingOtpPhone(targetPhone);
      setOtpInput('');
      setOtpError('');
      setAuthStage('otp_verify');
    } finally {
      setIsLoggingInWithPin(false);
    }
  };

  const handleIssueFreshOtpCode = async () => {
    const targetPhone = pendingOtpPhone || trustedPhone || normalizePhone(loginPhone);
    if (!targetPhone) return;
    setOtpError('');
    setIsInitiatingOtp(true);
    try {
      if (otpPurpose === 'forgot_pin') {
        const res = await requestAccountSecurityOtpCloud(targetPhone, { forceNew: true });
        if (res.ok) {
          setOtpExpiresAt(res.otpExpiresAt || null);
          setOtpInput('');
          setOtpInfoBanner(
            t(
              'تم إصدار كود تفعيل جديد (6 أرقام) صالح لمدة 24 ساعة. اطلبه عبر واتساب الآن.',
              'A new 6-digit OTP valid for 24 hours has been issued. Request it via WhatsApp now.'
            )
          );
        }
      } else {
        const res = await initiateTravelerOtpLoginCloud('', '', targetPhone, { forceNew: true });
        if (res.ok) {
          setOtpExpiresAt(res.otpExpiresAt || null);
          setOtpInput('');
          setOtpInfoBanner(
            t(
              'تم إصدار كود تفعيل جديد (6 أرقام) صالح لمدة 24 ساعة. اطلبه عبر واتساب الآن.',
              'A new 6-digit OTP valid for 24 hours has been issued. Request it via WhatsApp now.'
            )
          );
        }
      }
    } finally {
      setIsInitiatingOtp(false);
    }
  };

  const otpDigits = Array.from({ length: 6 }, (_, i) => {
    const clean = normalizeArabicDigits(otpInput).replace(/\D/g, '');
    return clean[i] || '';
  });

  const handleOtpBoxChange = (index: number, rawValue: string) => {
    setOtpError('');
    const digits = normalizeArabicDigits(rawValue).replace(/\D/g, '');

    if (!digits) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpInput(next.join(''));
      return;
    }

    if (digits.length > 1) {
      const pasted = digits.slice(0, 6);
      setOtpInput(pasted);
      const focusIdx = Math.min(5, pasted.length - 1);
      otpBoxRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = digits;
    setOtpInput(next.join(''));
    if (index < 5) {
      otpBoxRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        e.preventDefault();
        const next = [...otpDigits];
        next[index - 1] = '';
        setOtpInput(next.join(''));
        otpBoxRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      otpBoxRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      otpBoxRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setOtpError('');
    const raw = e.clipboardData.getData('text') || '';
    const digits = normalizeArabicDigits(raw).replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    setOtpInput(digits);
    const focusIdx = Math.min(5, digits.length - 1);
    otpBoxRefs.current[focusIdx]?.focus();
  };

  // Step 2: Submit 6-digit OTP -> Routes to PIN Setup (if missing/forgot) OR Device Trust Choice
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPhone = pendingOtpPhone || trustedPhone;
    if (!targetPhone) return;
    setOtpError('');

    const cleanOtp = normalizeArabicDigits(otpInput).replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setOtpError(
        t('يرجى إدخال كود الدخول المكون من 6 أرقام.', 'Please enter the 6-digit login code.')
      );
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const res = await verifyLoginOtpCloud(targetPhone, cleanOtp, lang);
      if (!res.ok) {
        setOtpError(res.error || t('كود الدخول غير صحيح.', 'Invalid login code.'));
        return;
      }

      const verifiedPhone = res.profile?.phone || targetPhone;
      setTrustedPhone(verifiedPhone);
      if (res.profile?.name) setDetectedClientName(res.profile.name);
      setOtpInput('');

      if (res.needsPinSetup || otpPurpose === 'forgot_pin') {
        const flow: PendingPostAuthFlow = {
          phone: verifiedPhone,
          stage: 'pin_setup',
          isPinReset: otpPurpose === 'forgot_pin',
        };
        onSetPendingPostAuthFlow?.(flow);
        setNewPinInput('');
        setConfirmPinInput('');
        setPinSetupError('');
        setAuthStage('pin_setup');
        return;
      }

      if (!res.isDeviceTrusted) {
        const flow: PendingPostAuthFlow = {
          phone: verifiedPhone,
          stage: 'device_trust_prompt',
        };
        onSetPendingPostAuthFlow?.(flow);
        setAuthStage('device_trust_prompt');
        return;
      }

      // Already has PIN & already a trusted device -> refresh trust timestamp & unlock immediately
      await trustCurrentDeviceCloud(verifiedPhone);
      onSetPendingOtpPhone(null);
      onSetPendingPostAuthFlow?.(null);
      setAuthStage('phone_entry');
      onChangeSubTab('account');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Step 3: Save New / Reset 6-Digit Personal PIN
  const handleSaveNewPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPhone = pendingPostAuthFlow?.phone || pendingOtpPhone || trustedPhone;
    if (!targetPhone) return;
    setPinSetupError('');

    const cleanNew = normalizeArabicDigits(newPinInput).replace(/\D/g, '');
    const cleanConfirm = normalizeArabicDigits(confirmPinInput).replace(/\D/g, '');

    if (cleanNew.length !== 6) {
      setPinSetupError(
        t(
          'يجب أن يتكون رمز الـ PIN الشخصي من 6 أرقام بالضبط.',
          'Your personal PIN must be exactly 6 digits.'
        )
      );
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setPinSetupError(
        t(
          'رمزا الـ PIN غير متطابقين. يرجى التأكد وإدخال نفس الـ 6 أرقام.',
          'The two PIN entries do not match. Please enter the same 6 digits.'
        )
      );
      return;
    }

    setIsSavingPin(true);
    try {
      const updated = await setClientPinCloud(targetPhone, cleanNew);
      if (!updated) {
        setPinSetupError(
          t('تعذر حفظ رمز الـ PIN. يرجى المحاولة مرة أخرى.', 'Could not save PIN. Please try again.')
        );
        return;
      }

      setNewPinInput('');
      setConfirmPinInput('');

      // If this device is already trusted (e.g. Forgot PIN recovery on trusted device), unlock immediately!
      if (isDeviceInTrustedList(updated.trustedDevices, currentDevice.deviceId)) {
        await trustCurrentDeviceCloud(targetPhone);
        onSetPendingOtpPhone(null);
        onSetPendingPostAuthFlow?.(null);
        setAuthStage('phone_entry');
        onChangeSubTab('account');
        return;
      }

      // Otherwise prompt user to trust this device permanently or start 1-hour temporary session
      onSetPendingPostAuthFlow?.({
        phone: targetPhone,
        stage: 'device_trust_prompt',
      });
      setAuthStage('device_trust_prompt');
    } finally {
      setIsSavingPin(false);
    }
  };

  // Step 4: Explicit Device Trust Confirmation ("Trust Permanently" vs "Temporary 1-Hour Session")
  const handleChooseTrustCurrentDevice = async () => {
    const targetPhone = pendingPostAuthFlow?.phone || pendingOtpPhone || trustedPhone;
    if (!targetPhone) return;
    setIsFinalizingTrust(true);
    try {
      await trustCurrentDeviceCloud(targetPhone);
      onSetPendingOtpPhone(null);
      onSetPendingPostAuthFlow?.(null);
      setAuthStage('phone_entry');
      onChangeSubTab('account');
    } finally {
      setIsFinalizingTrust(false);
    }
  };

  const handleChooseTemporarySession = () => {
    const targetPhone = pendingPostAuthFlow?.phone || pendingOtpPhone || trustedPhone;
    if (!targetPhone) return;
    startTravelerSession(targetPhone, 'temporary');
    onSetPendingOtpPhone(null);
    onSetPendingPostAuthFlow?.(null);
    setAuthStage('phone_entry');
    onChangeSubTab('account');
  };

  // Account Security & Trusted Devices Handlers (Logged-In)
  const handleRevokeTrustedDevice = async (deviceId: string) => {
    if (!activeTraveler) return;
    setRevokingDeviceId(deviceId);
    setSecurityFeedback(null);
    try {
      await revokeTrustedDeviceCloud(activeTraveler.phone, deviceId);
      setConfirmRevokeDeviceId(null);
      setSecurityFeedback({
        type: 'success',
        text:
          deviceId === currentDevice.deviceId
            ? t(
                'تم إلغاء الثقة من هذا الجهاز وتحويل جلستك الحالية إلى جلسة مؤقتة (لمدة ساعة). عند تسجيل الدخول لاحقاً سيُطلب كود واتساب OTP.',
                'Trust removed from this device and current session switched to a 1-hour temporary session. Future sign-ins will require WhatsApp OTP.'
              )
            : t(
                'تم حذف الجهاز من قائمة الأجهزة الموثوقة بنجاح.',
                'Device successfully removed from your trusted devices list.'
              ),
      });
    } finally {
      setRevokingDeviceId(null);
    }
  };

  const handleTrustCurrentDeviceFromAccount = async () => {
    if (!activeTraveler) return;
    setIsFinalizingTrust(true);
    setSecurityFeedback(null);
    try {
      await trustCurrentDeviceCloud(activeTraveler.phone);
      setSecurityFeedback({
        type: 'success',
        text: t(
          'تم اعتماد هذا الجهاز كجهاز موثوق وحفظ تسجيل الدخول بشكل دائم.',
          'Current device saved as a trusted device for permanent sign-in.'
        ),
      });
    } finally {
      setIsFinalizingTrust(false);
    }
  };

  const handleStartChangePinOtp = async () => {
    if (!activeTraveler) return;
    setChangePinError('');
    setSecurityFeedback(null);
    setIsProcessingChangePin(true);
    try {
      const res = await requestAccountSecurityOtpCloud(activeTraveler.phone);
      if (!res.ok) {
        setSecurityFeedback({
          type: 'error',
          text: res.error || t('تعذر بدء التحقق لتغيير رمز الـ PIN.', 'Failed to initiate PIN change OTP.'),
        });
        return;
      }
      setChangePinOtpInput('');
      setChangePinNewInput('');
      setChangePinConfirmInput('');
      setChangePinStep('otp');
    } finally {
      setIsProcessingChangePin(false);
    }
  };

  const handleVerifyChangePinOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTraveler) return;
    setChangePinError('');
    const cleanOtp = normalizeArabicDigits(changePinOtpInput).replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setChangePinError(
        t('يرجى إدخال كود التحقق المكون من 6 أرقام.', 'Please enter the 6-digit verification code.')
      );
      return;
    }

    setIsProcessingChangePin(true);
    try {
      const res = await verifyAccountSecurityOtpCloud(activeTraveler.phone, cleanOtp, lang);
      if (!res.ok) {
        setChangePinError(res.error || t('كود التحقق غير صحيح.', 'Invalid verification code.'));
        return;
      }
      setChangePinOtpInput('');
      setChangePinStep('new_pin');
    } finally {
      setIsProcessingChangePin(false);
    }
  };

  const handleSubmitNewAccountPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTraveler) return;
    setChangePinError('');

    const cleanNew = normalizeArabicDigits(changePinNewInput).replace(/\D/g, '');
    const cleanConfirm = normalizeArabicDigits(changePinConfirmInput).replace(/\D/g, '');

    if (cleanNew.length !== 6) {
      setChangePinError(
        t('يجب أن يتكون رمز الـ PIN من 6 أرقام بالضبط.', 'PIN must be exactly 6 digits.')
      );
      return;
    }
    if (cleanNew !== cleanConfirm) {
      setChangePinError(
        t('رمزا الـ PIN غير متطابقين.', 'The two PINs do not match.')
      );
      return;
    }

    setIsProcessingChangePin(true);
    try {
      const updated = await setClientPinCloud(activeTraveler.phone, cleanNew);
      if (!updated) {
        setChangePinError(
          t('تعذر تحديث رمز الـ PIN حالياً.', 'Failed to update PIN.')
        );
        return;
      }
      setChangePinStep('idle');
      setChangePinNewInput('');
      setChangePinConfirmInput('');
      setSecurityFeedback({
        type: 'success',
        text: t(
          'تم تحديث رمز الدخول السريع (PIN) بنجاح ومزامنته مع حسابك.',
          'Your 6-digit Quick Login PIN has been updated and synced to your account.'
        ),
      });
    } finally {
      setIsProcessingChangePin(false);
    }
  };

  const handleLogout = () => {
    logoutTravelerSession('manual');
    onSetPendingOtpPhone(null);
    onSetPendingPostAuthFlow?.(null);
    setAuthStage('phone_entry');
    setTrustedPhone('');
    setDetectedClientName('');
    setPinLoginInput('');
    onResetDraft();
    setOtpInput('');
    setAuthError('');
    setOtpError('');
    setPinLoginError('');
    setSaveFeedback(null);
    setPassportExtractFeedback(null);
    onGoHome?.();
  };

  // AI OCR Extraction updating lifted draft immediately (and preserving across navigation)
  const runAutoPassportExtractionIntoDraft = async (base64: string, mimeType: string) => {
    setIsExtractingPassport(true);
    setPassportExtractFeedback(null);
    try {
      const response = await fetch('/api/passport-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          visaType: draft.preferredVisaType,
          lang,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        setPassportExtractFeedback({
          type: 'info',
          text: t(
            'تم إرفاق صورة الجواز في المسودة. يمكنك مراجعة أو كتابة رقم الجواز والاسم يدوياً ثم الضغط على "حفظ البيانات".',
            'Passport scan staged in draft. You can type or adjust passport details above and click Save Data.'
          ),
        });
        return;
      }

      const data = (await response.json()) as { result?: PassportAiCheckResult };
      const extracted = data.result;
      if (!extracted) return;

      const cleanPassportNo = (extracted.passportNumber || '').trim().toUpperCase();
      const extractedFullName = (extracted.fullName || '').trim();
      const nameParts = extractedFullName ? splitPassportName(extractedFullName) : null;

      onUpdateDraft((prev) => ({
        ...prev,
        ...(cleanPassportNo ? { passportNumber: cleanPassportNo } : {}),
        ...(extractedFullName ? { passportFullName: extractedFullName } : {}),
        ...(nameParts?.firstName ? { firstName: nameParts.firstName } : {}),
        ...(nameParts?.lastName ? { lastName: nameParts.lastName } : {}),
        ...(extracted.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(extracted.expiryDate)
          ? { passportExpiryDate: extracted.expiryDate }
          : {}),
        ...(extracted.nationality && extracted.nationality.trim()
          ? { nationality: extracted.nationality.trim() }
          : {}),
        isDirty: true,
      }));

      if (cleanPassportNo || extractedFullName) {
        setPassportExtractFeedback({
          type: 'success',
          text: t(
            `تم قراءة بيانات الجواز وتحديث المسودة تلقائياً (${cleanPassportNo || extractedFullName}). اضغط "حفظ البيانات" للاعتماد النهائي.`,
            `Passport details auto-extracted into draft (${cleanPassportNo || extractedFullName}). Click Save Data to commit.`
          ),
        });
      } else {
        setPassportExtractFeedback({
          type: 'info',
          text: t(
            'تم إرفاق صورة الجواز، ولم يظهر رقم الجواز بوضوح كافٍ. يرجى كتابته يدوياً أو رفع صورة أوضح.',
            'Passport image attached, but passport number was not clearly legible. Please enter it manually or upload a clearer photo.'
          ),
        });
      }
    } catch {
      setPassportExtractFeedback({
        type: 'info',
        text: t(
          'تم إرفاق صورة الجواز في المسودة. يرجى كتابة رقم الجواز يدوياً ثم الضغط على "حفظ البيانات".',
          'Passport image staged in draft. Please enter your passport number manually and click Save Data.'
        ),
      });
    } finally {
      setIsExtractingPassport(false);
    }
  };

  const handleStageAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveFeedback(null);
    try {
      const compressed = await compressImageToDataUrl(file, 520, 0.8);
      onUpdateDraft((prev) => ({
        ...prev,
        pendingAvatarPreviewUrl: compressed.dataUrl,
        isDirty: true,
      }));
    } catch {
      setSaveFeedback({
        type: 'error',
        text: t(
          'تعذر معالجة الصورة الشخصية. يرجى اختيار صورة بصيغة JPG أو PNG.',
          'Could not process personal photo. Please select a valid JPG or PNG file.'
        ),
      });
    }
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleStagePassportPhotoFromAccount = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveFeedback(null);
    try {
      const compressed = await compressImageToDataUrl(file, 1100, 0.76);
      const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      onUpdateDraft((prev) => ({
        ...prev,
        pendingDocuments: [
          {
            id: docId,
            label: t('صورة جواز السفر', 'Passport Copy'),
            docType: 'passport',
            fileName: file.name || 'passport.jpg',
            dataUrl: compressed.dataUrl,
          },
          ...prev.pendingDocuments,
        ],
        isDirty: true,
      }));
      void runAutoPassportExtractionIntoDraft(compressed.base64, compressed.mimeType);
    } catch {
      setSaveFeedback({
        type: 'error',
        text: t(
          'تعذر قراءة صورة جواز السفر. يرجى المحاولة بصورة أوضح.',
          'Could not read passport photo. Please try a valid image.'
        ),
      });
    }
    if (accountPassportInputRef.current) accountPassportInputRef.current.value = '';
  };

  const handleStageWalletDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveFeedback(null);
    try {
      const compressed = await compressImageToDataUrl(file, 1100, 0.76);
      const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      onUpdateDraft((prev) => ({
        ...prev,
        pendingDocuments: [
          {
            id: docId,
            label: docLabel.trim() || t('مستند مسافر', 'Traveler Document'),
            docType,
            fileName: file.name || 'document.jpg',
            dataUrl: compressed.dataUrl,
          },
          ...prev.pendingDocuments,
        ],
        isDirty: true,
      }));

      if (docType === 'passport') {
        void runAutoPassportExtractionIntoDraft(compressed.base64, compressed.mimeType);
      }
    } catch {
      setSaveFeedback({
        type: 'error',
        text: t(
          'تعذر ضغط الصورة المختارة.',
          'Could not compress selected image.'
        ),
      });
    }
    if (walletFileInputRef.current) walletFileInputRef.current.value = '';
  };

  const handleRemoveDocument = (docId: string, isPendingStaged: boolean) => {
    setSaveFeedback(null);
    onUpdateDraft((prev) => {
      if (isPendingStaged) {
        return {
          ...prev,
          pendingDocuments: prev.pendingDocuments.filter((d) => d.id !== docId),
          isDirty: true,
        };
      }
      return {
        ...prev,
        removedDocIds: prev.removedDocIds.includes(docId)
          ? prev.removedDocIds
          : [...prev.removedDocIds, docId],
        isDirty: true,
      };
    });
  };

  // Compute merged document list reflecting uncommitted draft additions & removals
  const committedKeptDocs = (activeTraveler?.documents || []).filter(
    (d) => !draft.removedDocIds.includes(d.id)
  );
  const combinedDocuments = [
    ...draft.pendingDocuments.map((d) => ({ ...d, isStaged: true })),
    ...committedKeptDocs.map((d) => ({ ...d, isStaged: false })),
  ];

  const effectiveAvatarUrl = draft.pendingAvatarPreviewUrl || activeTraveler?.avatarUrl || '';
  const hasPassportScan = combinedDocuments.some((d) => d.docType === 'passport');
  const latestPassportScan = combinedDocuments.find((d) => d.docType === 'passport');

  const handleCommitSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeTraveler) return;
    setSaveFeedback(null);

    const missingFields: string[] = [];
    if (!draft.firstName.trim()) missingFields.push(t('الاسم الأول', 'First Name'));
    if (!draft.lastName.trim()) missingFields.push(t('الاسم الأخير', 'Last Name'));
    if (!draft.passportNumber.trim()) missingFields.push(t('رقم جواز السفر', 'Passport Number'));
    if (!hasPassportScan) missingFields.push(t('صورة جواز السفر', 'Passport Photo'));
    if (!effectiveAvatarUrl) missingFields.push(t('الصورة الشخصية', 'Personal Photo'));

    if (missingFields.length > 0) {
      setSaveFeedback({
        type: 'error',
        text: t(
          `يرجى استكمال الحقول الإلزامية قبل الحفظ: ${missingFields.join('، ')}.`,
          `Please complete required fields before saving: ${missingFields.join(', ')}.`
        ),
      });
      if (subTab !== 'account') {
        onChangeSubTab('account');
      }
      return;
    }

    setIsSavingAll(true);
    try {
      await commitTravelerProfileDraftCloud(activeTraveler.phone, draft);
      onResetDraft();
      setSaveFeedback({
        type: 'success',
        text: t(
          'تم حفظ جميع بياناتك وصورك بنجاح ومزامنتها سحابياً.',
          'All profile details and photos have been saved and synced.'
        ),
      });
      setTimeout(() => setSaveFeedback(null), 4000);
    } catch {
      setSaveFeedback({
        type: 'error',
        text: t(
          'حدث خطأ أثناء الحفظ السحابي. يرجى المحاولة مرة أخرى.',
          'An error occurred while saving to cloud. Please try again.'
        ),
      });
    } finally {
      setIsSavingAll(false);
    }
  };

  // Clean emoji-free WhatsApp follow-up message
  const handleSendWalletSummaryWhatsApp = () => {
    if (!activeTraveler) return;
    const names = getTravelerDisplayNames(activeTraveler);
    const displayName =
      `${draft.firstName || names.firstName} ${draft.lastName || names.lastName}`.trim() ||
      activeTraveler.name;
    const msg =
      lang === 'en'
        ? `Hello Masarik Tourism, I am contacting you regarding my Traveler Profile:
• Name: ${displayName}
• WhatsApp: ${formatPhoneForDisplay(activeTraveler.phone)}
• Passport No: ${draft.passportNumber || activeTraveler.passportNumber || 'Not set'}
• Expiry Date: ${draft.passportExpiryDate || activeTraveler.passportExpiryDate || 'Not set'}
• Documents Saved: ${combinedDocuments.length}
• Current Status: ${translateOrderStatus(activeTraveler.orderStatus, 'en')}
Please advise on the next steps for my application.`
        : `السلام عليكم، أتواصل من حسابي في ملف المسافر بمنصة مسارك للإنجاز السياحي:
• الاسم: ${displayName}
• رقم الواتساب: ${formatPhoneForDisplay(activeTraveler.phone)}
• رقم الجواز: ${draft.passportNumber || activeTraveler.passportNumber || 'غير مسجل'}
• انتهاء الجواز: ${draft.passportExpiryDate || activeTraveler.passportExpiryDate || 'غير مسجل'}
• المستندات بالمحفظة: ${combinedDocuments.length}
• الحالة الحالية: ${translateOrderStatus(activeTraveler.orderStatus, 'ar')}
أرجو متابعة طلبي وإفادتي بالخطوات القادمة.`;
    openWhatsApp(msg);
  };

  // ==================== LOGGED-OUT FULL-PAGE SMART AUTHENTICATION FLOW ====================
  if (!activeTraveler) {
    const activeAuthPhone = pendingPostAuthFlow?.phone || pendingOtpPhone || trustedPhone || '';
    const isPinResetFlow = Boolean(pendingPostAuthFlow?.isPinReset || otpPurpose === 'forgot_pin');

    const resetToPhoneEntry = () => {
      onSetPendingOtpPhone(null);
      onSetPendingPostAuthFlow?.(null);
      setOtpInput('');
      setOtpError('');
      setPinLoginInput('');
      setPinLoginError('');
      setAuthError('');
      setNewPinInput('');
      setConfirmPinInput('');
      setPinSetupError('');
      setAuthStage('phone_entry');
    };

    const headerTitle =
      authStage === 'pin_login'
        ? t('الدخول السريع برمز الـ PIN', 'Quick PIN Sign In')
        : authStage === 'otp_verify'
        ? isPinResetFlow
          ? t('استعادة رمز الـ PIN عبر واتساب', 'Recover PIN via WhatsApp')
          : t('إدخال كود التفعيل عبر واتساب', 'Enter WhatsApp Verification Code')
        : authStage === 'pin_setup'
        ? isPinResetFlow
          ? t('تعيين رمز PIN جديد', 'Set New 6-Digit PIN')
          : t('تأمين حسابك برمز PIN شخصي', 'Create Your 6-Digit Security PIN')
        : authStage === 'device_trust_prompt'
        ? t('حفظ الجهاز الموثوق؟', 'Trust This Device?')
        : authStage === 'register_details'
        ? t('إنشاء ملف مسافر جديد', 'Create New Traveler Profile')
        : t('دخول أو إنشاء ملف المسافر', 'Traveler Profile Sign In');

    const headerSubtitle =
      authStage === 'pin_login'
        ? t(
            'تم التعرف على جهازك الموثوق — أدخل رمز الـ 6 أرقام للدخول الفوري',
            'Trusted device recognized — enter your 6-digit PIN to sign in instantly'
          )
        : authStage === 'otp_verify'
        ? t(
            'تحقق من هويتك بكود الدخول المرسل لرقمك لفتح الحساب',
            'Verify your identity with the WhatsApp OTP code'
          )
        : authStage === 'pin_setup'
        ? t(
            'يُستخدم رمز الـ PIN للدخول السريع لاحقاً من أجهزتك الموثوقة',
            'Your PIN lets you sign in instantly from trusted devices later'
          )
        : authStage === 'device_trust_prompt'
        ? t(
            'حدد ما إذا كنت تستخدم جهازك الشخصي أو جهازاً عاماً مؤقتاً',
            'Choose between permanent trusted access or a 1-hour temporary session'
          )
        : t(
            'بوابة المسافر الموثقة لرفع الجواز ومتابعة حالة التأشيرة',
            'Verified portal for passport wallet and live visa tracking'
          );

    return (
      <div className="min-h-[75vh] bg-[#FAF9F6] pb-24 md:pb-16 pt-6 px-3 sm:px-4" dir={dir}>
        <div className="max-w-lg mx-auto space-y-4">
          {sessionExpiredAlert && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>{sessionExpiredAlert}</span>
              </div>
              {onClearSessionExpiredAlert && (
                <button
                  type="button"
                  onClick={onClearSessionExpiredAlert}
                  className="text-red-700 hover:text-red-950 p-1 cursor-pointer"
                  aria-label={t('إغلاق', 'Close')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {magicLinkFeedback && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-950 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{magicLinkFeedback}</span>
              </div>
              {onClearMagicLinkFeedback && (
                <button
                  type="button"
                  onClick={onClearMagicLinkFeedback}
                  className="text-amber-800 hover:text-amber-950 p-1 cursor-pointer"
                  aria-label={t('إغلاق', 'Close')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Clean Navy/Gold Header */}
            <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] text-white p-5 sm:p-6 border-b-2 border-[#C6A052]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#C6A052]/20 border border-[#C6A052]/60 text-[#E5C887] flex items-center justify-center shrink-0">
                    {authStage === 'pin_login' || authStage === 'pin_setup' ? (
                      <Lock className="w-5 h-5" />
                    ) : authStage === 'otp_verify' ? (
                      <KeyRound className="w-5 h-5" />
                    ) : authStage === 'device_trust_prompt' ? (
                      <Smartphone className="w-5 h-5" />
                    ) : (
                      <UserCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-base sm:text-lg font-black text-white">{headerTitle}</h1>
                    <p className="text-xs text-slate-300 mt-0.5">{headerSubtitle}</p>
                  </div>
                </div>

                {onGoHome && (
                  <button
                    type="button"
                    onClick={onGoHome}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <BackArrow className="w-3.5 h-3.5" />
                    <span>{t('الرئيسية', 'Home')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* STAGE 1: SMART WHATSAPP NUMBER ENTRY */}
            {authStage === 'phone_entry' && (
              <form onSubmit={handleCheckPhoneContinue} className="p-5 sm:p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 leading-relaxed space-y-1.5">
                  <p>
                    {t(
                      'أدخل رقم الواتساب الخاص بك للدخول السريع برمز الـ PIN إذا كان هذا الجهاز موثوقاً، أو للتحقق عبر كود الواتساب في الأجهزة الجديدة.',
                      'Enter your WhatsApp number for instant PIN sign-in on trusted devices, or WhatsApp OTP verification on new devices.'
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#0F2438]">
                    <Smartphone className="w-3.5 h-3.5 text-[#C6A052] shrink-0" />
                    <span>
                      {t('الجهاز الحالي:', 'Current device:')} {currentDevice.label}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                    {t('رقم الواتساب', 'WhatsApp Number')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    dir="ltr"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(digitsOnly(e.target.value, 20))}
                    placeholder="01012345678"
                    autoFocus
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-sm font-bold text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  />
                </div>

                {authError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isCheckingPhone}
                  className="w-full min-h-[46px] py-3 px-4 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
                >
                  {isCheckingPhone && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t('متابعة', 'Continue')}</span>
                </button>
              </form>
            )}

            {/* STAGE 1B: NEW CLIENT NAME DETAILS BEFORE OTP */}
            {authStage === 'register_details' && (
              <form onSubmit={handleInitiateLogin} className="p-5 sm:p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 leading-relaxed flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-[#0F2438] block">
                      {t('حساب مسافر جديد لرقم الواتساب:', 'New Traveler Account for WhatsApp:')}
                    </span>
                    <span className="font-black text-[#0F2438] tabular-nums text-sm" dir="ltr">
                      {formatPhoneForDisplay(activeAuthPhone || loginPhone)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={resetToPhoneEntry}
                    className="text-[11px] font-bold text-[#0284C7] hover:underline cursor-pointer shrink-0"
                  >
                    {t('تغيير الرقم', 'Change')}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الأول (حسب الجواز)', 'First Name (as on passport)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={loginFirstName}
                      onChange={(e) => setLoginFirstName(e.target.value)}
                      placeholder={t('مثال: أحمد', 'e.g. Ahmed')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الأخير (حسب الجواز)', 'Last Name (as on passport)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={loginLastName}
                      onChange={(e) => setLoginLastName(e.target.value)}
                      placeholder={t('مثال: محمد علي', 'e.g. Mohamed Ali')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                    {authError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="submit"
                    disabled={isInitiatingOtp}
                    className="flex-1 min-h-[46px] py-3 px-4 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
                  >
                    {isInitiatingOtp && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{t('متابعة وإصدار كود التفعيل', 'Continue & Request OTP')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetToPhoneEntry}
                    className="min-h-[46px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    {t('رجوع', 'Back')}
                  </button>
                </div>
              </form>
            )}

            {/* STAGE 2A: TRUSTED DEVICE QUICK 6-DIGIT PIN LOGIN */}
            {authStage === 'pin_login' && (
              <div className="p-5 sm:p-6 space-y-5">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2 text-center">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-black">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{t('جهاز موثوق · دخول سريع', 'Trusted Device · Quick Login')}</span>
                  </div>
                  {detectedClientName && (
                    <span className="text-sm font-black text-[#0F2438] block pt-1">
                      {t(`مرحباً بعودتك، ${detectedClientName}`, `Welcome back, ${detectedClientName}`)}
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-600 tabular-nums block" dir="ltr">
                    {formatPhoneForDisplay(activeAuthPhone)} · {currentDevice.label}
                  </span>
                </div>

                <form onSubmit={handlePinLoginSubmit} className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-[#0F2438]">
                      {t('أدخل رمز الدخول السريع (6 أرقام PIN)', 'Enter Your 6-Digit Security PIN')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPinLogin((v) => !v)}
                      className="text-[11px] font-bold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {showPinLogin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPinLogin ? t('إخفاء', 'Hide') : t('إظهار', 'Show')}</span>
                    </button>
                  </div>

                  <div dir="ltr" className="grid grid-cols-6 gap-2 sm:gap-2.5 max-w-sm mx-auto">
                    {pinLoginDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          pinBoxRefs.current[idx] = el;
                        }}
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={digit}
                        onChange={(e) => handlePinBoxChange(idx, e.target.value)}
                        onKeyDown={(e) => handlePinBoxKeyDown(idx, e)}
                        onPaste={handlePinBoxPaste}
                        onFocus={(e) => e.target.select()}
                        autoFocus={idx === 0}
                        aria-label={t(`الخانة ${idx + 1} من رمز PIN`, `PIN digit ${idx + 1}`)}
                        className={`w-full h-12 sm:h-13 rounded-xl border-2 border-slate-300 bg-slate-50 focus:bg-white text-center text-lg sm:text-xl font-black text-[#0F2438] tabular-nums focus:outline-none focus:border-[#C6A052] focus:ring-2 focus:ring-[#C6A052]/30 transition ${
                          showPinLogin ? '' : '[-webkit-text-security:disc]'
                        }`}
                      />
                    ))}
                  </div>

                  {pinLoginError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                      {pinLoginError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoggingInWithPin}
                    className="w-full min-h-[46px] py-2.5 px-4 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    {isLoggingInWithPin && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Lock className="w-4 h-4" />
                    <span>{t('دخول سريع برمز الـ PIN', 'Unlock Account with PIN')}</span>
                  </button>

                  <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={isLoggingInWithPin}
                      onClick={() => void handleSwitchPinLoginToForgotOtp()}
                      className="text-xs font-bold text-[#0284C7] hover:underline flex items-center gap-1.5 cursor-pointer py-1"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>
                        {t(
                          'نسيت رمز الـ PIN؟ التحقق عبر واتساب OTP',
                          'Forgot PIN? Verify via WhatsApp OTP'
                        )}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={resetToPhoneEntry}
                      className="text-xs font-bold text-slate-600 hover:text-[#0F2438] cursor-pointer py-1"
                    >
                      {t('تغيير رقم الواتساب', 'Switch Number')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* STAGE 2B: WHATSAPP OTP VERIFICATION (FIRST TIME / UNTRUSTED DEVICE / FORGOT PIN) */}
            {authStage === 'otp_verify' && (() => {
              const remMs = otpRemainingMs;
              const isExpired = remMs !== null && remMs <= 0;
              const totalSec = remMs !== null ? Math.floor(remMs / 1000) : 24 * 3600;
              const remHours = Math.floor(totalSec / 3600);
              const remMins = Math.floor((totalSec % 3600) / 60);
              const remSecs = totalSec % 60;
              const formattedCountdown = `${String(remHours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;

              return (
                <div className="p-5 sm:p-6 space-y-5">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0F2438] text-[#E5C887] text-[11px] font-black">
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>
                        {otpPurpose === 'forgot_pin'
                          ? t('استعادة رمز الـ PIN عبر واتساب OTP', 'PIN Recovery via WhatsApp OTP')
                          : otpPurpose === 'untrusted_device'
                          ? t('التحقق من جهاز جديد عبر واتساب OTP', 'New Device Verification via WhatsApp OTP')
                          : t('بانتظار التفعيل بكود واتساب OTP', 'Pending Activation via WhatsApp OTP')}
                      </span>
                    </div>
                    <span className="text-base font-black text-[#0F2438] tabular-nums block pt-1" dir="ltr">
                      {formatPhoneForDisplay(activeAuthPhone)}
                    </span>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {t(
                        'يمكنك التفعيل بإدخال الكود الرقمي (6 أرقام 0-9) أدناه، أو عبر رابط التفعيل المباشر في الواتساب، أو انتظار التفعيل الفوري من الإدارة.',
                        'Activate using the 6 numeric digits (0-9) below, via WhatsApp activation link, or instant Admin activation.'
                      )}
                    </p>
                  </div>

                  {/* 24-Hour OTP Validity Live Countdown Banner */}
                  <div
                    className={`rounded-2xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      isExpired
                        ? 'bg-red-50 border-red-200 text-red-900'
                        : 'bg-sky-50 border-sky-200 text-[#0F2438]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Clock
                        className={`w-4.5 h-4.5 shrink-0 mt-0.5 ${
                          isExpired ? 'text-red-600' : 'text-[#0284C7]'
                        }`}
                      />
                      <div className="text-xs leading-snug">
                        <span className="font-black block">
                          {isExpired
                            ? t('انتهت صلاحية كود التفعيل (24 ساعة)', 'OTP Code Validity Expired (24 Hours)')
                            : t('صلاحية الكود المحفوظ (24 ساعة)', '24-Hour OTP Validity Active')}
                        </span>
                        <span className="text-[11px] text-slate-600 block mt-0.5">
                          {isExpired
                            ? t(
                                'اضغط على "إصدار كود جديد" بالأسفل لإرسال كود جديد صالح 24 ساعة.',
                                'Tap "Issue New Code" below to generate a fresh 24-hour OTP.'
                              )
                            : t(
                                'يبقى طلبك محفوظاً خلال الـ 24 ساعة حتى عند إغلاق الصفحة والعودة برقمك.',
                                'Stays active for 24h even if you close and revisit with your phone.'
                              )}
                        </span>
                      </div>
                    </div>

                    {!isExpired && (
                      <div
                        className="px-3 py-1.5 rounded-xl bg-white border border-sky-300 text-xs sm:text-sm font-black text-[#0F2438] tabular-nums shrink-0 text-center"
                        dir="ltr"
                      >
                        {formattedCountdown}
                      </div>
                    )}
                  </div>

                  {otpInfoBanner && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
                      {otpInfoBanner}
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <a
                      href={buildClientOtpWhatsAppUrl(lang)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[48px] py-3 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <WhatsAppIcon className="w-4.5 h-4.5 shrink-0" variant="white" />
                      <span>
                        {t(
                          'طلب الكود عبر واتساب (201128440008)',
                          'Request Code via WhatsApp (201128440008)'
                        )}
                      </span>
                    </a>

                    <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 text-emerald-950">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span className="text-[11px] sm:text-xs font-bold leading-snug">
                          {t(
                            'الرد بالكود يتم آلياً عبر واتساب أو تفعيله من الإدارة مباشرة',
                            'Code sent via WhatsApp or activated live by Admin'
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isInitiatingOtp}
                        onClick={() => void handleIssueFreshOtpCode()}
                        className="text-[11px] font-black text-[#0284C7] hover:underline shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {isInitiatingOtp
                          ? t('جاري الإصدار...', 'Issuing...')
                          : t('إصدار كود جديد', 'Issue New Code')}
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleVerifyOtpSubmit} className="space-y-3.5 pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-[#0F2438]">
                        {t('أدخل كود التفعيل (6 أرقام فقط 0-9)', 'Enter Activation Code (6 Digits 0-9)')}
                      </label>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {t('يدعم اللصق السريع', 'Quick paste supported')}
                      </span>
                    </div>

                    <div dir="ltr" className="grid grid-cols-6 gap-2 sm:gap-2.5 max-w-sm mx-auto">
                      {otpDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            otpBoxRefs.current[idx] = el;
                          }}
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                          maxLength={6}
                          value={digit}
                          onChange={(e) => handleOtpBoxChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpBoxKeyDown(idx, e)}
                          onPaste={handleOtpPaste}
                          onFocus={(e) => e.target.select()}
                          autoFocus={idx === 0}
                          aria-label={t(`الخانة ${idx + 1} من كود التفعيل`, `OTP digit ${idx + 1}`)}
                          className="w-full h-12 sm:h-13 rounded-xl border-2 border-slate-300 bg-slate-50 focus:bg-white text-center text-lg sm:text-xl font-black text-[#0F2438] tabular-nums focus:outline-none focus:border-[#C6A052] focus:ring-2 focus:ring-[#C6A052]/30 transition"
                        />
                      ))}
                    </div>

                    {otpError && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                        {otpError}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={isVerifyingOtp}
                        className="flex-1 min-h-[46px] py-2.5 px-4 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        {isVerifyingOtp && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>{t('تحقق ومتابعة', 'Verify & Continue')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={resetToPhoneEntry}
                        className="min-h-[46px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        {t('تغيير الرقم', 'Change Number')}
                      </button>
                    </div>
                  </form>
                </div>
              );
            })()}

            {/* STAGE 3: CREATE OR RESET 6-DIGIT PERSONAL PIN */}
            {authStage === 'pin_setup' && (
              <form onSubmit={handleSaveNewPinSubmit} className="p-5 sm:p-6 space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-950 leading-relaxed flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black block">
                      {isPinResetFlow
                        ? t('تم التحقق من رقمك! أدخل رمز PIN جديداً', 'Verified! Create a New 6-Digit PIN')
                        : t('تم التحقق بنجاح! أنشئ رمز PIN شخصي لحسابك', 'Verified! Set Your Personal 6-Digit PIN')}
                    </span>
                    <span className="text-[11px] text-emerald-800 block mt-0.5">
                      {t(
                        'ستستخدم هذا الرمز للدخول السريع في المرات القادمة من أجهزتك الموثوقة دون الحاجة لكود واتساب.',
                        'Use this 6-digit PIN to sign in instantly on your trusted devices without needing WhatsApp OTP every time.'
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSetupPins((v) => !v)}
                    className="text-[11px] font-bold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {showSetupPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showSetupPins ? t('إخفاء الأرقام', 'Hide digits') : t('إظهار الأرقام', 'Show digits')}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                      {t('رمز الـ PIN الشخصي (6 أرقام فقط)', 'Personal PIN (6 digits)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      dir="ltr"
                      autoFocus
                      value={newPinInput}
                      onChange={(e) =>
                        setNewPinInput(normalizeArabicDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="••••••"
                      className={`w-full px-4 py-3 rounded-xl border border-slate-300 text-center text-lg font-black tracking-[0.4em] text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                        showSetupPins ? '' : '[-webkit-text-security:disc]'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0F2438] mb-1.5">
                      {t('تأكيد رمز الـ PIN (6 أرقام)', 'Confirm 6-Digit PIN')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      dir="ltr"
                      value={confirmPinInput}
                      onChange={(e) =>
                        setConfirmPinInput(normalizeArabicDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="••••••"
                      className={`w-full px-4 py-3 rounded-xl border border-slate-300 text-center text-lg font-black tracking-[0.4em] text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                        showSetupPins ? '' : '[-webkit-text-security:disc]'
                      }`}
                    />
                  </div>
                </div>

                {pinSetupError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                    {pinSetupError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSavingPin}
                  className="w-full min-h-[46px] py-3 px-4 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
                >
                  {isSavingPin && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Lock className="w-4 h-4" />
                  <span>{t('حفظ رمز الـ PIN والمتابعة', 'Save PIN & Continue')}</span>
                </button>
              </form>
            )}

            {/* STAGE 4: DEVICE TRUST CONFIRMATION ("TRUST PERMANENTLY" VS "TEMPORARY 1 HOUR") */}
            {authStage === 'device_trust_prompt' && (
              <div className="p-5 sm:p-6 space-y-5">
                <div className="bg-[#FAF8F2] border border-[#E5C887] rounded-2xl p-4 space-y-2.5 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#0F2438] text-[#E5C887] mx-auto flex items-center justify-center shadow-xs">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                    {t(
                      'هل هذا الجهاز موثوق لحفظ تسجيل الدخول دائماً؟',
                      'Is this a trusted device to keep your login saved permanently?'
                    )}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {t(
                      'الجهاز الحالي:',
                      'Current device:'
                    )}{' '}
                    <span className="font-black text-[#0F2438]" dir="ltr">
                      {currentDevice.label}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {t(
                      'إذا كان هذا هاتفك أو جهازك الشخصي، اختر حفظه كجهاز موثوق للدخول الفوري بالـ PIN مستقبلاً. وإذا كان جهازاً عاماً أو مشتركاً، اختر الجلسة المؤقتة لتسجيل الخروج التلقائي بعد ساعة واحدة.',
                      'If this is your personal phone or PC, save it as a trusted device for instant PIN login later. For shared devices, use a 1-hour temporary session.'
                    )}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={isFinalizingTrust}
                    onClick={() => void handleChooseTrustCurrentDevice()}
                    className="w-full min-h-[50px] py-3 px-4 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
                  >
                    {isFinalizingTrust ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4.5 h-4.5" />
                    )}
                    <span>
                      {t('نعم، جهاز موثوق (حفظ دائماً)', 'Yes, Trusted Device (Save Permanently)')}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isFinalizingTrust}
                    onClick={handleChooseTemporarySession}
                    className="w-full min-h-[48px] py-3 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>
                      {t('لا، جلسة مؤقتة (لمدة ساعة واحدة)', 'No, Temporary Session (1 Hour Only)')}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== LOGGED-IN FULL-PAGE TRAVELER WORKSPACE ====================
  const names = getTravelerDisplayNames(activeTraveler);
  const headerDisplayName =
    `${draft.firstName || names.firstName} ${draft.lastName || names.lastName}`.trim() ||
    activeTraveler.name;
  const currentStatusIdx = getOrderStatusStageIndex(activeTraveler.orderStatus);

  const familyMembers = activeTraveler.familyMembers || [];
  const issuedDocuments = activeTraveler.issuedDocuments || [];
  const unreadNotifications = (activeTraveler.notifications || []).filter((n) => !n.read);

  const renderIssuedDeliverablesSection = () => {
    const hasCompletedStatus = activeTraveler.orderStatus === 'تم تنفيذ الطلب';
    if (issuedDocuments.length === 0 && !hasCompletedStatus) return null;

    return (
      <div className="bg-white border-2 border-emerald-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                  {t(
                    `مستنداتي الصادرة والمنجزة (${issuedDocuments.length})`,
                    `Issued & Completed Documents (${issuedDocuments.length})`
                  )}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-[11px] font-black text-emerald-900">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{t('تم تنفيذ الطلب', 'Order Completed')}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {t(
                  'مستندات الإنجاز النهائية المعتمدة من مسارك جاهزة للعرض والتحميل الفوري على جهازك في أي وقت.',
                  'Your completed official documents delivered by Masarik are ready to view and download anytime.'
                )}
              </p>
            </div>
          </div>
        </div>

        {issuedDocuments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {issuedDocuments.map((delDoc) => {
              const isPdf =
                delDoc.mimeType === 'application/pdf' ||
                delDoc.fileName.toLowerCase().endsWith('.pdf') ||
                delDoc.downloadUrl.toLowerCase().includes('.pdf');
              const dlKey = `issued-${delDoc.id}`;

              return (
                <div
                  key={delDoc.id}
                  className="bg-emerald-50/45 border border-emerald-200 rounded-2xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-black shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('تم تنفيذ الطلب', 'Order Completed')}</span>
                      </span>
                      <span className="text-[10.5px] font-bold text-slate-500 tabular-nums">
                        {new Date(delDoc.issuedAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10.5px] font-bold text-slate-500 block">
                        {t('نوع المستند', 'Document Type')}
                      </span>
                      <h3 className="text-sm font-black text-[#0F2438] leading-snug">
                        {delDoc.docTypeLabel}
                      </h3>
                      <span className="text-[11px] text-slate-500 block truncate mt-0.5" dir="ltr">
                        {delDoc.fileName}
                      </span>
                    </div>

                    {delDoc.notes && (
                      <div className="bg-white border border-emerald-200/80 rounded-xl p-2.5 text-[11.5px] text-slate-700 leading-relaxed">
                        <span className="font-black text-[#0F2438]">
                          {t('ملاحظة الإدارة:', 'Note:')}{' '}
                        </span>
                        {delDoc.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-emerald-200/70">
                    <button
                      type="button"
                      disabled={downloadingKey === dlKey}
                      onClick={() => void handleDirectDownload(dlKey, delDoc.downloadUrl, delDoc.fileName)}
                      className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      {downloadingKey === dlKey ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <Download className="w-4 h-4 shrink-0" />
                      )}
                      <span>
                        {isPdf
                          ? t('تحميل المستند (PDF)', 'Download Document (PDF)')
                          : t('تحميل المستند', 'Download Document')}
                      </span>
                    </button>

                    {isPdf ? (
                      <a
                        href={getDriveViewUrl(
                          delDoc.downloadUrl,
                          delDoc.viewUrl,
                          delDoc.storagePath
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-emerald-300 text-[#0F2438] text-xs font-black flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
                        title={t('فتح ومعاينة الملف في نافذة جديدة', 'Open preview in new tab')}
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>{t('عرض', 'View')}</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewLightbox({
                            label: `${delDoc.docTypeLabel} — ${t('تم تنفيذ الطلب', 'Completed')}`,
                            dataUrl: delDoc.downloadUrl,
                            downloadName: delDoc.fileName,
                          })
                        }
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-emerald-300 text-[#0F2438] text-xs font-black flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
                      >
                        <Eye className="w-4 h-4" />
                        <span>{t('معاينة', 'Preview')}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-950 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {t(
                'تم تنفيذ طلبك بنجاح! ستظهر ملفات المستندات المرفقة هنا فور رفعها من الإدارة.',
                'Your order is completed! Any uploaded final documents will appear here automatically.'
              )}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderFamilyVaultSection = () => (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
              {t(
                `محفظة أفراد العائلة والمرافقين (${familyMembers.length})`,
                `Family Members & Companions Vault (${familyMembers.length})`
              )}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {t(
                'احفظ جوازات السفر والصور الشخصية لعائلتك سحابياً للوصول والتحميل من أي جهاز واختيارهم بضغطة واحدة عند طلب الخدمات',
                'Store family & companion passports and personal photos in your cloud vault for instant multi-device download and service booking'
              )}
            </p>
          </div>
        </div>

        {!showFamilyForm && (
          <button
            type="button"
            onClick={handleOpenAddFamilyMember}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{t('+ إضافة فرد عائلة / مرافق', '+ Add Family Member / Companion')}</span>
          </button>
        )}
      </div>

      {familySectionFeedback && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{familySectionFeedback}</span>
        </div>
      )}

      {/* Add / Edit Family Member Form */}
      {showFamilyForm && (
        <div className="bg-slate-50 border-2 border-[#C6A052]/60 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <h3 className="text-xs sm:text-sm font-black text-[#0F2438]">
              {editingMemberId
                ? t('تعديل بيانات فرد العائلة / المرافق', 'Edit Family Member / Companion')
                : t('إضافة فرد عائلة / مرافق جديد للمحفظة السحابية', 'Add Family Member / Companion')}
            </h3>
            <button
              type="button"
              onClick={resetFamilyForm}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
              aria-label={t('إلغاء', 'Cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            ref={memberPassportInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickMemberPassportPhoto}
            className="hidden"
          />
          <input
            ref={memberPersonalPhotoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickMemberPersonalPhoto}
            className="hidden"
          />

          {/* Photo Uploads (Passport + Personal Photo) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-[#0F2438]">
                  {t('صورة جواز السفر (مع قراءة OCR تلقائية)', 'Passport Photo (Auto OCR)')}{' '}
                  <span className="text-red-500">*</span>
                </span>
                {memberPassportPhotoUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewLightbox({
                        label: t('معاينة جواز المرافق', 'Companion Passport Preview'),
                        dataUrl: memberPassportPhotoUrl,
                        downloadName: buildDescriptiveFilename(
                          'Passport',
                          memberFirstName,
                          memberLastName
                        ),
                      })
                    }
                    className="text-[11px] font-bold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t('معاينة', 'Preview')}</span>
                  </button>
                )}
              </div>

              {memberPassportPhotoUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={memberPassportPhotoUrl}
                    alt="Passport"
                    loading="lazy"
                    decoding="async"
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0 cursor-pointer"
                    onClick={() =>
                      setPreviewLightbox({
                        label: t('معاينة جواز المرافق', 'Companion Passport Preview'),
                        dataUrl: memberPassportPhotoUrl,
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => memberPassportInputRef.current?.click()}
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#C6A052]/15 hover:bg-[#C6A052]/25 border border-[#C6A052] text-[#0F2438] text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{t('تغيير صورة الجواز', 'Change Passport Photo')}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => memberPassportInputRef.current?.click()}
                  className="w-full min-h-[48px] px-3 py-3 rounded-xl border-2 border-dashed border-[#C6A052] bg-[#FAF8F2] hover:bg-[#F5EFE0] text-[#0F2438] text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-[#9E7B33]" />
                  <span>{t('رفع صورة جواز السفر (إلزامي)', 'Upload Passport Photo (Required)')}</span>
                </button>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-[#0F2438]">
                  {t('الصورة الشخصية للمرافق', 'Personal Photo')} <span className="text-red-500">*</span>
                </span>
                {memberPersonalPhotoUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewLightbox({
                        label: t('الصورة الشخصية للمرافق', 'Companion Personal Photo'),
                        dataUrl: memberPersonalPhotoUrl,
                        downloadName: buildDescriptiveFilename(
                          'Photo',
                          memberFirstName,
                          memberLastName
                        ),
                      })
                    }
                    className="text-[11px] font-bold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t('معاينة', 'Preview')}</span>
                  </button>
                )}
              </div>

              {memberPersonalPhotoUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={memberPersonalPhotoUrl}
                    alt="Avatar"
                    loading="lazy"
                    decoding="async"
                    className="w-16 h-16 rounded-full object-cover border-2 border-[#C6A052] shrink-0 cursor-pointer"
                    onClick={() =>
                      setPreviewLightbox({
                        label: t('الصورة الشخصية للمرافق', 'Companion Personal Photo'),
                        dataUrl: memberPersonalPhotoUrl,
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => memberPersonalPhotoInputRef.current?.click()}
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{t('تغيير الصورة الشخصية', 'Change Personal Photo')}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => memberPersonalPhotoInputRef.current?.click()}
                  className="w-full min-h-[48px] px-3 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-[#0F2438] text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-slate-600" />
                  <span>{t('رفع الصورة الشخصية (إلزامي)', 'Upload Personal Photo (Required)')}</span>
                </button>
              )}
            </div>
          </div>

          {isExtractingMemberPassport && (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-[#0284C7] animate-spin shrink-0" />
              <span>
                {t(
                  'جاري استخراج الاسم ورقم الجواز تلقائياً بالذكاء الاصطناعي...',
                  'Extracting passport details via AI OCR...'
                )}
              </span>
            </div>
          )}

          {memberOcrFeedback && !isExtractingMemberPassport && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{memberOcrFeedback}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold text-[#0F2438] mb-1">
                {t('صلة القرابة', 'Relationship')} <span className="text-red-500">*</span>
              </label>
              <select
                value={memberRelationship}
                onChange={(e) => setMemberRelationship(e.target.value as FamilyRelationship)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] font-bold"
              >
                {FAMILY_RELATIONSHIPS.map((rel) => (
                  <option key={rel} value={rel}>
                    {getRelationshipLabel(rel, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-[#0F2438] mb-1">
                {t('الاسم الأول حسب الجواز', 'First Name (as on passport)')}{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={memberFirstName}
                onChange={(e) => setMemberFirstName(e.target.value)}
                placeholder={t('مثال: سارة', 'e.g. Sara')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
              />
            </div>

            <div>
              <label className="block font-bold text-[#0F2438] mb-1">
                {t('الاسم الأخير حسب الجواز', 'Last Name (as on passport)')}{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={memberLastName}
                onChange={(e) => setMemberLastName(e.target.value)}
                placeholder={t('مثال: أحمد علي', 'e.g. Ahmed Ali')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
              />
            </div>

            <div>
              <label className="block font-bold text-[#0F2438] mb-1">
                {t('رقم جواز السفر', 'Passport Number')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={memberPassportNumber}
                onChange={(e) => setMemberPassportNumber(e.target.value.toUpperCase())}
                placeholder="A12345678"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums uppercase"
              />
            </div>

            <div>
              <label className="block font-bold text-[#0F2438] mb-1">
                {t('تاريخ انتهاء الجواز (اختياري)', 'Passport Expiry (Optional)')}
              </label>
              <input
                type="date"
                value={memberPassportExpiry}
                onChange={(e) => setMemberPassportExpiry(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438] tabular-nums"
              />
            </div>

            <div>
              <label className="block font-bold text-[#0F2438] mb-1">
                {t('الجنسية (اختياري)', 'Nationality (Optional)')}
              </label>
              <input
                type="text"
                value={memberNationality}
                onChange={(e) => setMemberNationality(e.target.value)}
                placeholder={t('مثال: مصري', 'e.g. Egyptian')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
              />
            </div>
          </div>

          {memberFormError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-900">
              {memberFormError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              disabled={isSavingMember}
              onClick={() => void handleSaveMemberSubmit()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] text-xs font-black flex items-center gap-2 transition cursor-pointer"
            >
              {isSavingMember ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {isSavingMember
                  ? t('جاري الرفع والحفظ السحابي...', 'Uploading & Saving...')
                  : editingMemberId
                  ? t('حفظ تعديلات المرافق', 'Save Changes')
                  : t('حفظ المرافق في المحفظة السحابية', 'Save Companion to Cloud Vault')}
              </span>
            </button>

            <button
              type="button"
              onClick={resetFamilyForm}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Family Members Cloud Vault Cards Grid */}
      {familyMembers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {familyMembers.map((member) => {
            const fullName = `${member.firstName} ${member.lastName}`.trim();
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
                className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {member.personalPhotoUrl ? (
                      <img
                        src={getDisplayableDriveImageUrl(member.personalPhotoUrl)}
                        alt={fullName}
                        loading="lazy"
                        decoding="async"
                        onClick={() =>
                          setPreviewLightbox({
                            label: `${fullName} — ${t('الصورة الشخصية', 'Personal Photo')}`,
                            dataUrl: member.personalPhotoUrl,
                            downloadName: photoFilename,
                          })
                        }
                        className="w-14 h-14 rounded-full object-cover border-2 border-[#C6A052] shrink-0 bg-white cursor-pointer"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[#0F2438] text-[#E5C887] border-2 border-[#C6A052]/60 flex items-center justify-center text-base font-black shrink-0">
                        {fullName.slice(0, 1) || 'م'}
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-[#C6A052]/20 border border-[#C6A052]/50 text-[10.5px] font-black text-[#0F2438]">
                        {getRelationshipLabel(member.relationship, lang)}
                      </span>
                      <h3 className="text-sm font-black text-[#0F2438] truncate">{fullName}</h3>
                      <div className="text-[11px] text-slate-600 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>
                          {t('الجواز:', 'Passport:')}{' '}
                          <strong className="text-[#0F2438] uppercase">
                            {member.passportNumber}
                          </strong>
                        </span>
                        {member.passportExpiryDate && (
                          <span>· {member.passportExpiryDate}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Edit / Delete Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditFamilyMember(member)}
                      className="p-2 rounded-lg text-slate-600 hover:text-[#0F2438] hover:bg-slate-200 transition cursor-pointer"
                      title={t('تعديل', 'Edit')}
                      aria-label={t('تعديل', 'Edit')}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {confirmDeleteMemberId === member.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleConfirmDeleteMember(member.id)}
                          className="px-2 py-1 rounded-lg bg-red-600 text-white text-[10.5px] font-bold cursor-pointer"
                        >
                          {t('تأكيد', 'Confirm')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteMemberId(null)}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-[10.5px] font-bold cursor-pointer"
                        >
                          {t('إلغاء', 'Cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteMemberId(member.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title={t('حذف', 'Delete')}
                        aria-label={t('حذف', 'Delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Instant One-Click Download & Preview for Passport & Personal Photo */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80">
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled={!member.passportPhotoUrl || downloadingKey === `fm-pass-${member.id}`}
                      onClick={() =>
                        void handleDirectDownload(
                          `fm-pass-${member.id}`,
                          member.passportPhotoUrl,
                          passportFilename
                        )
                      }
                      className="w-full min-h-[40px] px-2.5 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      {downloadingKey === `fm-pass-${member.id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>{t('تحميل الجواز', 'Download Passport')}</span>
                    </button>
                    {member.passportPhotoUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewLightbox({
                            label: `${fullName} — ${t('صورة جواز السفر', 'Passport Photo')}`,
                            dataUrl: member.passportPhotoUrl,
                            downloadName: passportFilename,
                          })
                        }
                        className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[#0F2438] text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t('معاينة الجواز', 'Preview Passport')}</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled={!member.personalPhotoUrl || downloadingKey === `fm-photo-${member.id}`}
                      onClick={() =>
                        void handleDirectDownload(
                          `fm-photo-${member.id}`,
                          member.personalPhotoUrl,
                          photoFilename
                        )
                      }
                      className="w-full min-h-[40px] px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      {downloadingKey === `fm-photo-${member.id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>{t('تحميل الصورة', 'Download Photo')}</span>
                    </button>
                    {member.personalPhotoUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewLightbox({
                            label: `${fullName} — ${t('الصورة الشخصية', 'Personal Photo')}`,
                            dataUrl: member.personalPhotoUrl,
                            downloadName: photoFilename,
                          })
                        }
                        className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[#0F2438] text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t('معاينة الصورة', 'Preview Photo')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !showFamilyForm && (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6 text-center text-xs text-slate-500">
            {t(
              'لا يوجد أفراد عائلة أو مرافقون مضافون بعد. اضغط على "+ إضافة فرد عائلة / مرافق" لحفظ جوازاتهم وصورهم في محفظتك السحابية.',
              'No family members or companions added yet. Click "+ Add Family Member / Companion" to save their passports and photos in your cloud vault.'
            )}
          </div>
        )
      )}
    </div>
  );

  return (
    <div className="min-h-[80vh] bg-[#FAF9F6] pb-24 md:pb-16 pt-5 px-3 sm:px-4" dir={dir}>
      <div className="max-w-5xl mx-auto space-y-5">
        {magicLinkFeedback && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{magicLinkFeedback}</span>
            </div>
            {onClearMagicLinkFeedback && (
              <button
                type="button"
                onClick={onClearMagicLinkFeedback}
                className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
                aria-label={t('إغلاق', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Traveler Profile Summary Header Card */}
        <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] text-white rounded-3xl p-4 sm:p-6 border border-[#C6A052]/60 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              {effectiveAvatarUrl ? (
                <img
                  src={getDisplayableDriveImageUrl(effectiveAvatarUrl)}
                  alt={headerDisplayName}
                  loading="lazy"
                  decoding="async"
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-[#C6A052] bg-white shadow-sm"
                />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/10 border-2 border-[#C6A052]/70 text-[#E5C887] flex items-center justify-center">
                  <UserCheck className="w-7 h-7" />
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  onChangeSubTab('account');
                  setTimeout(() => avatarInputRef.current?.click(), 80);
                }}
                className="absolute -bottom-1 -end-1 w-6 h-6 rounded-full bg-[#C6A052] text-[#0A1926] flex items-center justify-center border border-white shadow-xs cursor-pointer"
                title={t('تغيير الصورة الشخصية', 'Change Personal Photo')}
                aria-label={t('تغيير الصورة الشخصية', 'Change Personal Photo')}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-xl font-black text-white truncate">
                  {headerDisplayName}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-[11px] font-bold text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('حساب موثق', 'Verified')}</span>
                </span>
                {sessionMeta?.mode === 'temporary' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/60 text-[11px] font-bold text-amber-200 tabular-nums">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t(
                        `جلسة مؤقتة · متبقي ${remainingTempMinutes ?? 60} دقيقة`,
                        `Temporary Session · ${remainingTempMinutes ?? 60}m left`
                      )}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/50 text-[11px] font-bold text-sky-200">
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('جهاز موثوق · دخول دائم', 'Trusted Device')}</span>
                  </span>
                )}
                {draft.isDirty && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/60 text-[11px] font-bold text-amber-200">
                    {t('تعديلات غير محفوظة', 'Unsaved Draft')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 tabular-nums">
                <span dir="ltr">
                  {formatPhoneForDisplay(activeTraveler.phone)} · +
                  {activeTraveler.phoneNormalized || activeTraveler.phone}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/10 border border-[#C6A052]/50 text-[#E5C887] font-black text-[11px]" dir="ltr">
                  {t('رقم الطلب:', 'Order No:')} {activeTraveler.orderCode || buildOrderCodeFromPhone(activeTraveler.phone)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSendWalletSummaryWhatsApp}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
            >
              <WhatsAppIcon className="w-4 h-4" variant="white" />
              <span>{t('متابعة عبر واتساب', 'Follow Up on WhatsApp')}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-red-600/90 text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('خروج', 'Sign Out')}</span>
            </button>
          </div>
        </div>

        {/* Workspace Internal Section Switcher */}
        <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => onChangeSubTab('account')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              subTab === 'account'
                ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-4 h-4 shrink-0" />
            <span>{t('بيانات الحساب', 'Account Info')}</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeSubTab('orders')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              subTab === 'orders'
                ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span>{t('طلباتي وحالة التأشيرة', 'My Orders')}</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeSubTab('documents')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              subTab === 'documents'
                ? 'bg-[#0F2438] text-[#E5C887] shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>
              {t(
                `مستنداتي الصادرة والمحفظة (${combinedDocuments.length + issuedDocuments.length})`,
                `Issued Docs & Wallet (${combinedDocuments.length + issuedDocuments.length})`
              )}
            </span>
          </button>
        </div>

        {/* Live Unread Notifications Strip */}
        {unreadNotifications.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Bell className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-black text-emerald-950 block">
                  {unreadNotifications[0].titleAr && unreadNotifications[0].titleEn
                    ? isAr
                      ? unreadNotifications[0].titleAr
                      : unreadNotifications[0].titleEn
                    : t('تحديث جديد على طلبك', 'New Update on Your Order')}
                </span>
                <p className="text-[11.5px] text-emerald-900 leading-relaxed">
                  {isAr ? unreadNotifications[0].bodyAr : unreadNotifications[0].bodyEn}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  void markClientNotificationsReadCloud(activeTraveler.phone);
                  onChangeSubTab(unreadNotifications[0].type === 'deliverable' ? 'documents' : 'orders');
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer whitespace-nowrap"
              >
                {t('عرض التفاصيل', 'View Details')}
              </button>
              <button
                type="button"
                onClick={() => void markClientNotificationsReadCloud(activeTraveler.phone)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {t('تحديد كمقروء', 'Mark Read')}
              </button>
            </div>
          </div>
        )}

        {saveFeedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center gap-2 ${
              saveFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {saveFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{saveFeedback.text}</span>
          </div>
        )}

        {/* SUB-TAB 1: ACCOUNT INFO & MANDATORY PASSPORT / AVATAR */}
        {subTab === 'account' && (
          <form onSubmit={handleCommitSaveAll} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Mandatory Personal Photo Card */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div>
                  <h2 className="text-sm font-black text-[#0F2438]">
                    {t('الصورة الشخصية', 'Personal Profile Photo')}{' '}
                    <span className="text-red-500">*</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t(
                      'تظهر بجانب اسمك في الهيدر وملفك لدى إدارة مسارك',
                      'Displayed next to your name in the header and admin file'
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-3 py-2">
                  {effectiveAvatarUrl ? (
                    <img
                      src={getDisplayableDriveImageUrl(effectiveAvatarUrl)}
                      alt={headerDisplayName}
                      loading="lazy"
                      decoding="async"
                      className="w-28 h-28 rounded-full object-cover border-4 border-[#C6A052] shadow-sm bg-slate-100"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 gap-1">
                      <Camera className="w-7 h-7" />
                      <span className="text-[11px] font-bold">{t('بدون صورة', 'No Photo')}</span>
                    </div>
                  )}

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleStageAvatar}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {effectiveAvatarUrl
                        ? t('تغيير الصورة الشخصية', 'Change Personal Photo')
                        : t('رفع الصورة الشخصية (إلزامي)', 'Upload Personal Photo (Required)')}
                    </span>
                  </button>

                  {effectiveAvatarUrl && (
                    <div className="w-full grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewLightbox({
                            label: t('الصورة الشخصية لصاحب الحساب', 'Account Holder Photo'),
                            dataUrl: effectiveAvatarUrl,
                            downloadName: buildDescriptiveFilename(
                              'Photo',
                              draft.firstName || names.firstName,
                              draft.lastName || names.lastName
                            ),
                          })
                        }
                        className="min-h-[40px] px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F2438] text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t('معاينة', 'Preview')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={downloadingKey === 'owner-photo'}
                        onClick={() =>
                          void handleDirectDownload(
                            'owner-photo',
                            effectiveAvatarUrl,
                            buildDescriptiveFilename(
                              'Photo',
                              draft.firstName || names.firstName,
                              draft.lastName || names.lastName
                            )
                          )
                        }
                        className="min-h-[40px] px-2.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-[11px] font-black flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-60"
                      >
                        {downloadingKey === 'owner-photo' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>{t('تحميل الصورة', 'Download')}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Mandatory Passport Photo Quick-Upload Box */}
                <div className="pt-4 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-black text-[#0F2438]">
                      {t('صورة جواز السفر', 'Passport Photo')}{' '}
                      <span className="text-red-500">*</span>
                    </h3>
                    {hasPassportScan ? (
                      <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {t('مرفقة', 'Attached')}
                      </span>
                    ) : (
                      <span className="text-[10.5px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        {t('مطلوبة', 'Required')}
                      </span>
                    )}
                  </div>

                  <input
                    ref={accountPassportInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleStagePassportPhotoFromAccount}
                    className="hidden"
                  />

                  {latestPassportScan && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={getDisplayableDriveImageUrl(latestPassportScan.dataUrl)}
                          alt={latestPassportScan.label}
                          loading="lazy"
                          decoding="async"
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer"
                          onClick={() =>
                            setPreviewLightbox({
                              label: latestPassportScan.label,
                              dataUrl: latestPassportScan.dataUrl,
                              downloadName: buildDescriptiveFilename(
                                'Passport',
                                draft.firstName || names.firstName,
                                draft.lastName || names.lastName
                              ),
                            })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-[#0F2438] block truncate">
                            {latestPassportScan.label}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {latestPassportScan.fileName}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewLightbox({
                              label: latestPassportScan.label,
                              dataUrl: latestPassportScan.dataUrl,
                              downloadName: buildDescriptiveFilename(
                                'Passport',
                                draft.firstName || names.firstName,
                                draft.lastName || names.lastName
                              ),
                            })
                          }
                          className="min-h-[38px] px-2 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[#0F2438] text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{t('معاينة', 'Preview')}</span>
                        </button>

                        <button
                          type="button"
                          disabled={downloadingKey === 'owner-passport'}
                          onClick={() =>
                            void handleDirectDownload(
                              'owner-passport',
                              latestPassportScan.dataUrl,
                              buildDescriptiveFilename(
                                'Passport',
                                draft.firstName || names.firstName,
                                draft.lastName || names.lastName
                              )
                            )
                          }
                          className="min-h-[38px] px-2 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-[11px] font-black flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                        >
                          {downloadingKey === 'owner-passport' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>{t('تحميل الجواز', 'Download')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => accountPassportInputRef.current?.click()}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {hasPassportScan
                        ? t('رفع / تحديث صورة الجواز (OCR)', 'Update Passport Scan (OCR)')
                        : t('رفع صورة جواز السفر الآن (إلزامي)', 'Upload Passport Photo (Required)')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Saved Traveler Auto-Fill Profile & Passport Details Form */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                        {t(
                          'بيانات المسافر المحفوظة (للتعبئة التلقائية للطلبات)',
                          'Saved Traveler Profile (Quick Order Auto-Fill)'
                        )}
                      </h2>
                      {Boolean(
                        (draft.passportFullName.trim() || (draft.firstName.trim() && draft.lastName.trim())) &&
                          draft.passportNumber.trim() &&
                          draft.passportExpiryDate &&
                          hasPassportScan
                      ) ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10.5px] font-black text-emerald-800">
                          {t('جاهز للتعبئة التلقائية ✓', 'Auto-Fill Ready ✓')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10.5px] font-black text-amber-800">
                          {t('أكمل بيانات الجواز للتعبئة بضغطة زر', 'Complete to enable 1-click auto-fill')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t(
                        'احفظ الاسم بالإنجليزية، رقم الجواز، تاريخ الانتهاء وصورة الجواز هنا لتعبئة طلباتك الجديدة خلال ثانية واحدة دون إعادة كتابة.',
                        'Save your English name, passport number, expiry date, and passport scan once to auto-fill future orders in 1 second.'
                      )}
                    </p>
                  </div>

                  {onNavigateToAiScanner && (
                    <button
                      type="button"
                      onClick={onNavigateToAiScanner}
                      className="text-xs font-bold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      <span>{t('فتح فاحص الجواز الشامل', 'Open Full AI Scanner')}</span>
                    </button>
                  )}
                </div>

                {isExtractingPassport && (
                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-[#0284C7] animate-spin shrink-0" />
                    <span>
                      {t(
                        'جاري قراءة الاسم ورقم جواز السفر وتاريخ الانتهاء تلقائياً بالذكاء الاصطناعي...',
                        'Extracting first name, last name, passport number & expiry via AI...'
                      )}
                    </span>
                  </div>
                )}

                {passportExtractFeedback && !isExtractingPassport && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                      passportExtractFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>{passportExtractFeedback.text}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الأول (حسب الجواز)', 'First Name (as on passport)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={draft.firstName}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          firstName: e.target.value,
                          isDirty: true,
                        }))
                      }
                      placeholder={t('الاسم الأول', 'First Name')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الأخير (حسب الجواز)', 'Last Name (as on passport)')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={draft.lastName}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          lastName: e.target.value,
                          isDirty: true,
                        }))
                      }
                      placeholder={t('الاسم الأخير / اللقب', 'Last Name / Surname')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('رقم جواز السفر', 'Passport Number')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={draft.passportNumber}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          passportNumber: e.target.value.toUpperCase(),
                          isDirty: true,
                        }))
                      }
                      placeholder="A12345678"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums uppercase focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('الاسم الكامل بالإنجليزية في الجواز', 'Full Passport Name (Latin)')}
                    </label>
                    <input
                      type="text"
                      value={draft.passportFullName}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          passportFullName: e.target.value,
                          isDirty: true,
                        }))
                      }
                      placeholder="AHMED MOHAMED ALI"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('تاريخ انتهاء جواز السفر', 'Passport Expiry Date')}
                    </label>
                    <input
                      type="date"
                      value={draft.passportExpiryDate}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          passportExpiryDate: e.target.value,
                          isDirty: true,
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('الجنسية', 'Nationality')}
                    </label>
                    <input
                      type="text"
                      value={draft.nationality}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          nationality: e.target.value,
                          isDirty: true,
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-[#0F2438] mb-1.5">
                      {t('نوع التأشيرة / الخدمة المفضلة', 'Preferred Visa / Service')}
                    </label>
                    <input
                      type="text"
                      value={draft.preferredVisaType}
                      onChange={(e) =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          preferredVisaType: e.target.value,
                          isDirty: true,
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />
                  </div>
                </div>

                {/* Action Bar: Save Data / Cancel Draft */}
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={isSavingAll}
                    className="min-h-[44px] px-5 py-2.5 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    {isSavingAll ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>
                      {isSavingAll
                        ? t('جاري الحفظ والمزامنة...', 'Saving & Syncing...')
                        : t('حفظ البيانات', 'Save Data')}
                    </span>
                  </button>

                  {draft.isDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        onResetDraft();
                        setSaveFeedback(null);
                      }}
                      className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{t('إلغاء التعديلات غير المحفوظة', 'Discard Draft Changes')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        )}

        {/* SUB-TAB 1 EXTRA: FAMILY MEMBERS & COMPANIONS CLOUD VAULT */}
        {subTab === 'account' && renderFamilyVaultSection()}

        {/* SUB-TAB 1 SECURITY: TRUSTED DEVICES & QUICK PIN MANAGEMENT */}
        {subTab === 'account' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                    {t('الأجهزة الموثوقة والأمان', 'Trusted Devices & Account Security')}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t(
                      'تحكم في أجهزتك المسموح لها بالدخول السريع ورمز الدخول الشخصي (PIN)',
                      'Manage devices authorized for quick login and update your personal 6-digit PIN'
                    )}
                  </p>
                </div>
              </div>

              {sessionMeta?.mode === 'temporary' && (
                <button
                  type="button"
                  disabled={isFinalizingTrust}
                  onClick={() => void handleTrustCurrentDeviceFromAccount()}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-60"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('توثيق هذا الجهاز الآن', 'Trust This Device Now')}</span>
                </button>
              )}
            </div>

            {securityFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  securityFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {securityFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{securityFeedback.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Block A: Trusted Devices List */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-black text-[#0F2438] flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-[#C6A052]" />
                    <span>
                      {t(
                        `الأجهزة الموثوقة المسجلة (${(activeTraveler.trustedDevices || []).length})`,
                        `Saved Trusted Devices (${(activeTraveler.trustedDevices || []).length})`
                      )}
                    </span>
                  </h3>
                </div>

                {(activeTraveler.trustedDevices || []).length > 0 ? (
                  <div className="space-y-2.5">
                    {(activeTraveler.trustedDevices || []).map((dev) => {
                      const isCurrent = dev.deviceId === currentDevice.deviceId;
                      const isConfirming = confirmRevokeDeviceId === dev.deviceId;
                      const formattedAdded = new Date(dev.addedAt).toLocaleDateString(
                        lang === 'en' ? 'en-US' : 'ar-EG',
                        { year: 'numeric', month: 'short', day: 'numeric' }
                      );
                      const formattedUsed = new Date(dev.lastUsedAt).toLocaleDateString(
                        lang === 'en' ? 'en-US' : 'ar-EG',
                        { year: 'numeric', month: 'short', day: 'numeric' }
                      );

                      return (
                        <div
                          key={dev.deviceId}
                          className={`rounded-2xl p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isCurrent
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs sm:text-sm font-black text-[#0F2438]" dir="ltr">
                                {dev.label}
                              </span>
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black">
                                  {t('الجهاز الحالي', 'Current Device')}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {t('تاريخ الإضافة:', 'Added:')} {formattedAdded} ·{' '}
                              {t('آخر دخول:', 'Last used:')} {formattedUsed}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {isConfirming ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={revokingDeviceId === dev.deviceId}
                                  onClick={() => void handleRevokeTrustedDevice(dev.deviceId)}
                                  className="min-h-[34px] px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-black cursor-pointer disabled:opacity-60"
                                >
                                  {revokingDeviceId === dev.deviceId
                                    ? t('جاري الحذف...', 'Removing...')
                                    : t('تأكيد إلغاء الثقة', 'Confirm Remove')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRevokeDeviceId(null)}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold cursor-pointer"
                                >
                                  {t('تراجع', 'Cancel')}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRevokeDeviceId(dev.deviceId)}
                                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-red-200 hover:bg-red-50 text-red-700 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t('إلغاء الثقة / حذف الجهاز', 'Revoke / Remove')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-5 text-xs text-slate-600 space-y-1.5">
                    <p className="font-bold text-[#0F2438]">
                      {t('لا توجد أجهزة موثوقة محفوظة حالياً.', 'No trusted devices saved yet.')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {t(
                        'تعمل جلستك الحالية كجلسة مؤقتة لمدة ساعة واحدة، وسيطلب منك كود واتساب OTP عند كل دخول جديد.',
                        'You are currently using a 1-hour temporary session; WhatsApp OTP will be requested on each future sign-in.'
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Block B: Personal 6-Digit PIN & Change PIN via WhatsApp OTP */}
              <div className="lg:col-span-5 bg-[#FAF9F6] border border-slate-200 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-[#0F2438] flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-[#C6A052]" />
                      <span>{t('رمز الدخول السريع (PIN)', 'Quick Login PIN (6 Digits)')}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {activeTraveler.pinHash
                        ? t(
                            'رمز الـ PIN الشخصي مفعّل على حسابك.',
                            'Your 6-digit Quick Login PIN is active.'
                          )
                        : t('لم يتم تعيين رمز PIN بعد.', 'PIN has not been set yet.')}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                      activeTraveler.pinHash
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {activeTraveler.pinHash ? t('مفعّل', 'Active') : t('غير مفعّل', 'Not Set')}
                  </span>
                </div>

                {changePinStep === 'idle' && (
                  <button
                    type="button"
                    disabled={isProcessingChangePin}
                    onClick={() => void handleStartChangePinOtp()}
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60"
                  >
                    {isProcessingChangePin ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    <span>{t('تغيير رمز الـ PIN (6 أرقام)', 'Change 6-Digit PIN')}</span>
                  </button>
                )}

                {changePinStep === 'otp' && (
                  <form onSubmit={handleVerifyChangePinOtp} className="space-y-3 pt-1">
                    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {t(
                          'لحماية حسابك، يرجى التحقق عبر كود الواتساب أولاً قبل تعيين رمز PIN جديد.',
                          'For security, please verify via WhatsApp OTP before changing your PIN.'
                        )}
                      </p>
                      <a
                        href={buildClientOtpWhatsAppUrl(lang)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full min-h-[38px] px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <WhatsAppIcon className="w-4 h-4 shrink-0" variant="white" />
                        <span>
                          {t(
                            'اطلب كود التفعيل عبر واتساب (201128440008)',
                            'Request Activation Code via WhatsApp (201128440008)'
                          )}
                        </span>
                      </a>
                      <p className="text-[10.5px] font-bold text-emerald-800 text-center">
                        {t('الرد بالكود يتم آلياً عبر واتساب خلال ثوانٍ', 'Code sent automatically via WhatsApp within seconds')}
                      </p>
                    </div>

                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      dir="ltr"
                      required
                      value={changePinOtpInput}
                      onChange={(e) =>
                        setChangePinOtpInput(
                          normalizeArabicDigits(e.target.value).replace(/\D/g, '').slice(0, 6)
                        )
                      }
                      placeholder={t('كود التفعيل (6 أرقام)', '6-digit OTP')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-center text-sm font-black tracking-[0.35em] text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    />

                    {changePinError && (
                      <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] font-bold text-red-800">
                        {changePinError}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isProcessingChangePin}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        {isProcessingChangePin && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{t('تحقق من الكود', 'Verify Code')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setChangePinStep('idle');
                          setChangePinError('');
                        }}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                      >
                        {t('إلغاء', 'Cancel')}
                      </button>
                    </div>
                  </form>
                )}

                {changePinStep === 'new_pin' && (
                  <form onSubmit={handleSubmitNewAccountPin} className="space-y-3 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-emerald-800">
                        {t('تم التحقق! أدخل رمز PIN الجديد', 'Verified! Enter your new PIN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowChangePins((v) => !v)}
                        className="text-[11px] font-bold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {showChangePins ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showChangePins ? t('إخفاء', 'Hide') : t('إظهار', 'Show')}</span>
                      </button>
                    </div>

                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      dir="ltr"
                      required
                      value={changePinNewInput}
                      onChange={(e) =>
                        setChangePinNewInput(
                          normalizeArabicDigits(e.target.value).replace(/\D/g, '').slice(0, 6)
                        )
                      }
                      placeholder={t('رمز PIN الجديد (6 أرقام)', 'New 6-digit PIN')}
                      className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-center text-sm font-black tracking-[0.35em] text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                        showChangePins ? '' : '[-webkit-text-security:disc]'
                      }`}
                    />

                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      dir="ltr"
                      required
                      value={changePinConfirmInput}
                      onChange={(e) =>
                        setChangePinConfirmInput(
                          normalizeArabicDigits(e.target.value).replace(/\D/g, '').slice(0, 6)
                        )
                      }
                      placeholder={t('تأكيد رمز PIN الجديد', 'Confirm new 6-digit PIN')}
                      className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-center text-sm font-black tracking-[0.35em] text-[#0F2438] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                        showChangePins ? '' : '[-webkit-text-security:disc]'
                      }`}
                    />

                    {changePinError && (
                      <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] font-bold text-red-800">
                        {changePinError}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isProcessingChangePin}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        {isProcessingChangePin && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{t('حفظ رمز الـ PIN الجديد', 'Save New PIN')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setChangePinStep('idle');
                          setChangePinError('');
                        }}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                      >
                        {t('إلغاء', 'Cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: MY ORDERS & VISA TRACKER */}
        {subTab === 'orders' && (
          <div className="space-y-5">
            {renderIssuedDeliverablesSection()}

            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#0284C7]/10 text-[#0284C7] flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                      {t('متابعة حالة المعاملة والتأشيرة', 'Visa & Application Status Tracker')}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {draft.preferredVisaType ||
                        activeTraveler.preferredVisaType ||
                        t('تأشيرة زيارة / تساهيل السعودية', 'Saudi Visit Visa / VFS Tasheer')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="px-2.5 py-1 rounded-lg bg-[#FAF8F2] border border-[#E5C887] text-[11px] font-black text-[#0F2438] tabular-nums"
                    dir="ltr"
                  >
                    {t('رقم الطلب:', 'Order No:')} {activeTraveler.orderCode || buildOrderCodeFromPhone(activeTraveler.phone)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
                      activeTraveler.orderStatus === 'تم تنفيذ الطلب' ||
                      activeTraveler.orderStatus === 'مكتمل'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#0F2438] text-[#E5C887]'
                    }`}
                  >
                    {(activeTraveler.orderStatus === 'تم تنفيذ الطلب' ||
                      activeTraveler.orderStatus === 'مكتمل') && (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{translateOrderStatus(activeTraveler.orderStatus, lang)}</span>
                  </span>
                </div>
              </div>

              {/* Visual Progress Bar Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>{t('تقدم الطلب الحالي', 'Order Progress')}</span>
                  <span className="text-[#0F2438] font-black tabular-nums">
                    {Math.round(((currentStatusIdx + 1) / VISA_ORDER_STATUSES.length) * 100)}%
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                  <div
                    className="h-full bg-gradient-to-l from-emerald-500 to-[#0284C7] rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.round(
                        ((currentStatusIdx + 1) / VISA_ORDER_STATUSES.length) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* 4-Stage Visual Order Timeline */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 sm:gap-2.5">
                {VISA_ORDER_STATUSES.map((st, idx) => {
                  const completed = idx < currentStatusIdx;
                  const current = idx === currentStatusIdx;
                  const StepArrow = isAr ? ArrowLeft : ArrowRight;
                  const StageIcon =
                    idx === 0
                      ? FileText
                      : idx === 1
                      ? Clock
                      : idx === 2
                      ? CalendarCheck2
                      : CheckCircle2;

                  return (
                    <React.Fragment key={st}>
                      <div
                        className={`flex-1 p-3.5 sm:p-4 rounded-2xl border transition-all flex md:flex-col items-center md:text-center gap-3 md:gap-2 ${
                          current
                            ? 'bg-[#0F2438] text-white border-[#C6A052] ring-2 ring-[#C6A052]/35 shadow-md'
                            : completed
                            ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border font-black text-xs tabular-nums ${
                            current
                              ? 'bg-[#C6A052] text-[#0A1926] border-[#E5C887]'
                              : completed
                              ? 'bg-emerald-600 text-white border-emerald-500'
                              : 'bg-white text-slate-400 border-slate-200'
                          }`}
                        >
                          {completed ? (
                            <Check className="w-5 h-5 stroke-[2.75]" />
                          ) : (
                            <StageIcon className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 md:flex-initial">
                          <span
                            className={`text-[10.5px] font-black block tabular-nums ${
                              current
                                ? 'text-[#E5C887]'
                                : completed
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {t(`المرحلة ${idx + 1}`, `Stage ${idx + 1}`)}
                          </span>
                          <span
                            className={`text-xs sm:text-sm font-black leading-snug block ${
                              current
                                ? 'text-white'
                                : completed
                                ? 'text-emerald-950'
                                : 'text-slate-500'
                            }`}
                          >
                            {translateOrderStatus(st, lang)}
                          </span>
                          {current && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-[#E5C887]">
                              {t('● الحالة الحالية', '● Current Stage')}
                            </span>
                          )}
                        </div>
                      </div>

                      {idx < VISA_ORDER_STATUSES.length - 1 && (
                        <div className="hidden md:flex items-center justify-center shrink-0">
                          <StepArrow
                            className={`w-4 h-4 ${
                              idx < currentStatusIdx ? 'text-emerald-600' : 'text-slate-300'
                            }`}
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {activeTraveler.adminNotes ? (
                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-xs sm:text-sm text-[#0F2438]">
                  <span className="font-black block mb-1">
                    {t('ملاحظة وتحديث من إدارة مسارك:', 'Update & Note from Masarik Team:')}
                  </span>
                  <p className="leading-relaxed text-slate-700">{activeTraveler.adminNotes}</p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500">
                  {t(
                    'لا توجد ملاحظات إضافية مسجلة حالياً. سيتم إشعارك فور تحديد موعد تساهيل أو صدور تحديث جديد.',
                    'No additional notes posted yet. Updates appear here automatically once reviewed by our team.'
                  )}
                </div>
              )}

              {(currentStatusIdx >= 2 ||
                Boolean(
                  activeTraveler.appointmentDetails?.appointmentDate ||
                    activeTraveler.appointmentDetails?.appointmentTime ||
                    activeTraveler.appointmentDetails?.referenceNumber
                )) && (
                <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] text-white rounded-2xl p-4 sm:p-5 border border-[#C6A052]/65 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-[#C6A052] text-[#0A1926] flex items-center justify-center shrink-0 shadow-xs">
                      <QrCode className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-white">
                          {t('بطاقة باركود الموعد السريع (QR Pass)', 'Express Appointment QR Pass')}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-[10.5px] font-black text-emerald-300">
                          {t('جاهزة للإبراز عند الدخول', 'Ready for Entry')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {activeTraveler.appointmentDetails?.serviceType ||
                          activeTraveler.preferredVisaType ||
                          t('موعد خدمة محجوز لدى مسارك', 'Confirmed Service Appointment')}
                        {activeTraveler.appointmentDetails?.appointmentDate && (
                          <span className="text-[#E5C887] font-black mx-1.5 tabular-nums" dir="ltr">
                            • {activeTraveler.appointmentDetails.appointmentDate}{' '}
                            {activeTraveler.appointmentDetails.appointmentTime || ''}
                          </span>
                        )}
                      </p>
                      {activeTraveler.appointmentDetails?.location && (
                        <p className="text-[11px] text-slate-300 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#E5C887] shrink-0" />
                          <span>{activeTraveler.appointmentDetails.location}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowQrPassModal(true)}
                    className="min-h-[44px] px-4 py-2.5 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer shrink-0"
                  >
                    <QrCode className="w-4.5 h-4.5" />
                    <span>{t('عرض باركود الموعد (QR)', 'Show Appointment QR')}</span>
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {(currentStatusIdx >= 2 ||
                  Boolean(activeTraveler.appointmentDetails?.appointmentDate)) && (
                  <button
                    type="button"
                    onClick={() => setShowQrPassModal(true)}
                    className="min-h-[44px] px-4 py-2.5 bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] border border-[#C6A052] rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer"
                  >
                    <QrCode className="w-4.5 h-4.5" />
                    <span>{t('عرض باركود الموعد (QR)', 'Show Appointment QR')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSendWalletSummaryWhatsApp}
                  className="min-h-[44px] px-5 py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer"
                >
                  <WhatsAppIcon className="w-4.5 h-4.5" variant="white" />
                  <span>{t('استفسار عن حالة طلبي عبر واتساب', 'Inquire About Order via WhatsApp')}</span>
                </button>

                {onNavigateToServices && (
                  <button
                    type="button"
                    onClick={onNavigateToServices}
                    className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#0F2438] rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer"
                  >
                    {t('تصفح الخدمات وحجز خدمة جديدة', 'Browse & Request New Service')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 3: ISSUED DOCS & PERSONAL DOCUMENT WALLET */}
        {subTab === 'documents' && (
          <>
            {renderIssuedDeliverablesSection()}

            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm sm:text-base font-black text-[#0F2438]">
                    {t(
                      `مستنداتي الشخصية والصور السحابية (${combinedDocuments.length})`,
                      `Personal Documents & Cloud Wallet (${combinedDocuments.length})`
                    )}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t(
                      'مستنداتك محفوظة سحابياً للوصول والتحميل من أي جهاز في أي وقت',
                      'Your documents are cloud-synced for instant access & download from any device'
                    )}
                  </p>
                </div>
              </div>

            {/* Account Holder Primary Cloud Vault Cards (Personal Photo + Passport Download) */}
            {(effectiveAvatarUrl || latestPassportScan) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#FAF8F2] border border-[#E5C887] rounded-2xl p-3.5">
                {effectiveAvatarUrl && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={effectiveAvatarUrl}
                        alt={headerDisplayName}
                        loading="lazy"
                        decoding="async"
                        className="w-12 h-12 rounded-full object-cover border-2 border-[#C6A052] shrink-0 cursor-pointer"
                        onClick={() =>
                          setPreviewLightbox({
                            label: t('الصورة الشخصية لصاحب الحساب', 'Account Holder Photo'),
                            dataUrl: effectiveAvatarUrl,
                            downloadName: buildDescriptiveFilename(
                              'Photo',
                              draft.firstName || names.firstName,
                              draft.lastName || names.lastName
                            ),
                          })
                        }
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-black text-[#0F2438] block truncate">
                          {t('الصورة الشخصية (صاحب الحساب)', 'Personal Photo (Owner)')}
                        </span>
                        <span className="text-[10.5px] text-slate-500 block truncate">
                          {headerDisplayName}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewLightbox({
                            label: t('الصورة الشخصية لصاحب الحساب', 'Account Holder Photo'),
                            dataUrl: effectiveAvatarUrl,
                            downloadName: buildDescriptiveFilename(
                              'Photo',
                              draft.firstName || names.firstName,
                              draft.lastName || names.lastName
                            ),
                          })
                        }
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] cursor-pointer"
                        title={t('معاينة', 'Preview')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={downloadingKey === 'docs-owner-photo'}
                        onClick={() =>
                          void handleDirectDownload(
                            'docs-owner-photo',
                            effectiveAvatarUrl,
                            buildDescriptiveFilename(
                              'Photo',
                              draft.firstName || names.firstName,
                              draft.lastName || names.lastName
                            )
                          )
                        }
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t('تحميل', 'Download')}</span>
                      </button>
                    </div>
                  </div>
                )}

                {latestPassportScan && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={latestPassportScan.dataUrl}
                        alt={latestPassportScan.label}
                        loading="lazy"
                        decoding="async"
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0 cursor-pointer"
                        onClick={() =>
                          setPreviewLightbox({
                            label: latestPassportScan.label,
                            dataUrl: latestPassportScan.dataUrl,
                            downloadName: buildDescriptiveFilename(
                              'Passport',
                              draft.firstName || names.firstName,
                              draft.lastName || names.lastName
                            ),
                          })
                        }
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-black text-[#0F2438] block truncate">
                          {t('صورة جواز السفر (صاحب الحساب)', 'Passport Photo (Owner)')}
                        </span>
                        <span className="text-[10.5px] text-slate-500 block truncate tabular-nums uppercase">
                          {draft.passportNumber || activeTraveler.passportNumber || latestPassportScan.fileName}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewLightbox({
                            label: latestPassportScan.label,
                            dataUrl: latestPassportScan.dataUrl,
                            downloadName: buildDescriptiveFilename(
                              'Passport',
                              draft.firstName || names.firstName,
                              draft.lastName || names.lastName
                            ),
                          })
                        }
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F2438] cursor-pointer"
                        title={t('معاينة', 'Preview')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={downloadingKey === 'docs-owner-passport'}
                        onClick={() =>
                          void handleDirectDownload(
                            'docs-owner-passport',
                            latestPassportScan.dataUrl,
                            buildDescriptiveFilename(
                              'Passport',
                              draft.firstName || names.firstName,
                              draft.lastName || names.lastName
                            )
                          )
                        }
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-[11px] font-black flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t('تحميل الجواز', 'Download')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Attach New Document Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
              <select
                value={docType}
                onChange={(e) => {
                  const val = e.target.value as TravelerDocument['docType'];
                  setDocType(val);
                  if (val === 'passport') setDocLabel(t('صورة جواز السفر', 'Passport Copy'));
                  else if (val === 'photo')
                    setDocLabel(t('صورة شخصية بخلفية بيضاء', 'White-Background Photo'));
                  else if (val === 'visa')
                    setDocLabel(t('نسخة التأشيرة / باركود تساهيل', 'Visa / Tasheer Barcode'));
                  else if (val === 'contract')
                    setDocLabel(t('عقد عمل / مستند موثق', 'Attested Contract / Certificate'));
                  else if (val === 'receipt')
                    setDocLabel(t('إيصال دفع / تحويل مالي', 'Payment Receipt'));
                }}
                className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
              >
                <option value="passport">{t('جواز سفر', 'Passport')}</option>
                <option value="photo">{t('صورة شخصية', 'Personal Photo')}</option>
                <option value="visa">{t('تأشيرة / تساهيل', 'Visa / Tasheer')}</option>
                <option value="contract">{t('عقد / شهادة', 'Contract / Certificate')}</option>
                <option value="receipt">{t('إيصال دفع / تحويل مالي', 'Payment Receipt')}</option>
                <option value="other">{t('مستند آخر', 'Other Document')}</option>
              </select>

              <input
                type="text"
                value={docLabel}
                onChange={(e) => setDocLabel(e.target.value)}
                placeholder={t('تسمية المستند', 'Document Label')}
                className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-[#0F2438]"
              />

              <input
                ref={walletFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleStageWalletDoc}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => walletFileInputRef.current?.click()}
                className="min-h-[42px] px-4 py-2 bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>{t('إرفاق صورة للمحفظة', 'Attach Document')}</span>
              </button>
            </div>

            {isExtractingPassport && (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-[#0284C7] animate-spin shrink-0" />
                <span>
                  {t(
                    'جاري قراءة رقم الجواز والاسم تلقائياً بالذكاء الاصطناعي...',
                    'Auto-extracting passport number & name via AI...'
                  )}
                </span>
              </div>
            )}

            {passportExtractFeedback && !isExtractingPassport && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  passportExtractFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{passportExtractFeedback.text}</span>
              </div>
            )}

            {/* Document Cards Grid */}
            {combinedDocuments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {combinedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className={`rounded-2xl p-3 border flex flex-col justify-between gap-3 ${
                      doc.isStaged
                        ? 'bg-amber-50/50 border-amber-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={getDisplayableDriveImageUrl(doc.dataUrl)}
                        alt={doc.label}
                        loading="lazy"
                        decoding="async"
                        className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0 bg-white cursor-pointer"
                        onClick={() => setPreviewLightbox({ label: doc.label, dataUrl: doc.dataUrl })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-[#0F2438] truncate">
                            {doc.label}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {doc.fileName}
                        </span>
                        {doc.isStaged && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-[10px] font-bold text-amber-900">
                            {t('بانتظار الحفظ', 'Pending Save')}
                          </span>
                        )}
                      </div>
                    </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewLightbox({
                                label: doc.label,
                                dataUrl: doc.dataUrl,
                                downloadName:
                                  doc.docType === 'passport'
                                    ? buildDescriptiveFilename(
                                        'Passport',
                                        draft.firstName || names.firstName,
                                        draft.lastName || names.lastName
                                      )
                                    : doc.docType === 'photo'
                                    ? buildDescriptiveFilename(
                                        'Photo',
                                        draft.firstName || names.firstName,
                                        draft.lastName || names.lastName
                                      )
                                    : doc.fileName || `${doc.docType}.jpg`,
                              })
                            }
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-[#0F2438] flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{t('عرض', 'View')}</span>
                          </button>

                          {doc.dataUrl && (
                            <button
                              type="button"
                              disabled={downloadingKey === `doc-${doc.id}`}
                              onClick={() =>
                                void handleDirectDownload(
                                  `doc-${doc.id}`,
                                  doc.dataUrl,
                                  doc.docType === 'passport'
                                    ? buildDescriptiveFilename(
                                        'Passport',
                                        draft.firstName || names.firstName,
                                        draft.lastName || names.lastName
                                      )
                                    : doc.docType === 'photo'
                                    ? buildDescriptiveFilename(
                                        'Photo',
                                        draft.firstName || names.firstName,
                                        draft.lastName || names.lastName
                                      )
                                    : doc.fileName || `${doc.docType}.jpg`
                                )
                              }
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-black text-emerald-900 flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              {downloadingKey === `doc-${doc.id}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              <span>{t('تحميل', 'Download')}</span>
                            </button>
                          )}

                          {doc.docType === 'passport' && doc.dataUrl && (
                            <button
                              type="button"
                              disabled={isExtractingPassport}
                              onClick={async () => {
                                try {
                                  const b64 = await imageUrlToBase64(doc.dataUrl);
                                  void runAutoPassportExtractionIntoDraft(b64, 'image/jpeg');
                                } catch {
                                  // Ignore unreadable image
                                }
                              }}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 hover:bg-sky-100 text-[11px] font-bold text-[#0284C7] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>{t('قراءة OCR', 'Extract OCR')}</span>
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveDocument(doc.id, doc.isStaged)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title={t('حذف المستند', 'Delete Document')}
                          aria-label={t('حذف المستند', 'Delete Document')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <FileText className="w-6 h-6 text-slate-400" />
                  <span>
                    {t('لا توجد مستندات مرفوعة حالياً في محفظتك.', 'No documents in your wallet yet.')}
                  </span>
                </div>
              )}

              {/* Explicit Save / Cancel Bar when Draft has changes */}
              {draft.isDirty && (
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isSavingAll}
                    onClick={() => void handleCommitSaveAll()}
                    className="min-h-[44px] px-5 py-2.5 bg-[#0F2438] hover:bg-[#163B65] disabled:opacity-60 text-[#E5C887] rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    {isSavingAll ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>
                      {isSavingAll
                        ? t('جاري رفع وحفظ المستندات...', 'Uploading & Saving...')
                        : t('حفظ البيانات والمستندات', 'Save Data & Documents')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onResetDraft();
                      setSaveFeedback(null);
                    }}
                    className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>{t('إلغاء التعديلات', 'Cancel Changes')}</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* SUB-TAB 3 EXTRA: FAMILY MEMBERS & COMPANIONS CLOUD VAULT */}
        {subTab === 'documents' && renderFamilyVaultSection()}
      </div>

      {/* Document Lightbox Preview Modal */}
      {previewLightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewLightbox(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
            dir={dir}
          >
            <div className="bg-[#0F2438] text-white px-4 py-3 flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-black truncate">{previewLightbox.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    void handleDirectDownload(
                      'lightbox',
                      previewLightbox.dataUrl,
                      previewLightbox.downloadName || 'Masarik_Document.jpg'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] text-xs font-black flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('تحميل', 'Download')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewLightbox(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                  aria-label={t('إغلاق', 'Close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={getDisplayableDriveImageUrl(previewLightbox.dataUrl)}
                alt={previewLightbox.label}
                loading="lazy"
                decoding="async"
                className="max-h-[68vh] w-auto object-contain rounded-xl shadow-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Express Appointment QR Pass Modal */}
      {activeTraveler && (
        <AppointmentQrPassModal
          isOpen={showQrPassModal}
          onClose={() => setShowQrPassModal(false)}
          traveler={activeTraveler}
        />
      )}
    </div>
  );
};

export interface ServiceCategory {
  id: string;
  titleAr: string;
}

export interface TravelService {
  id: string;
  categoryId: string;
  title: string;
  badge?: string;
  speedBadge?: string;
  features: string[];
  requiredDocs?: string[];
}

export interface ClientReview {
  id: string;
  author: string;
  tripType: string;
  year: string;
  comment: string;
  rating?: number;
}

export interface FeatureBadge {
  title: string;
  subtitle: string;
  icon?: string;
}

export interface WhyChooseItem {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export type CanonicalVisaOrderStatus =
  | 'تم استلام الطلب'
  | 'قيد المراجعة والتنفيذ'
  | 'تم الحجز / الإصدار'
  | 'تم تنفيذ الطلب'
  | 'مكتمل';

export type LegacyVisaOrderStatus =
  | 'تم استلام الأوراق'
  | 'تم حجز موعد تساهيل'
  | 'تحت المراجعة'
  | 'صدرت التأشيرة';

export type VisaOrderStatus = CanonicalVisaOrderStatus | LegacyVisaOrderStatus;

export interface IssuedDocument {
  id: string;
  docTypeLabel: string;
  fileName: string;
  mimeType: string;
  downloadUrl: string;
  viewUrl?: string;
  storagePath?: string;
  fileSizeBytes?: number;
  notes?: string;
  issuedAt: string;
  issuedBy?: string;
}

export interface ClientNotification {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  type: 'deliverable' | 'status';
  docId?: string;
  createdAt: string;
  read: boolean;
}

export type AccountType = 'individual' | 'b2b_partner';

export type DocumentReviewStatus = 'pending_completion' | 'received' | 'completed';

export interface TravelerDocument {
  id: string;
  label: string;
  docType: 'passport' | 'photo' | 'visa' | 'contract' | 'receipt' | 'other';
  fileName: string;
  dataUrl: string;
  viewUrl?: string;
  storagePath?: string;
  sizeBytes?: number;
  uploadedAt: string;
  status?: DocumentReviewStatus;
  statusNote?: string;
  statusUpdatedAt?: string;
}

export interface AppointmentDetails {
  serviceType: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
  referenceNumber?: string;
  updatedAt?: string;
}

export type FamilyRelationship =
  | 'spouse'
  | 'child'
  | 'parent'
  | 'sibling'
  | 'other';

export interface FamilyMember {
  id: string;
  relationship: FamilyRelationship;
  firstName: string;
  lastName: string;
  passportFullName?: string;
  passportNumber: string;
  passportExpiryDate?: string;
  nationality?: string;
  passportPhotoUrl: string;
  passportStoragePath?: string;
  passportSizeBytes?: number;
  personalPhotoUrl: string;
  personalPhotoStoragePath?: string;
  personalPhotoSizeBytes?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface TrustedDevice {
  deviceId: string;
  label: string;
  addedAt: string;
  lastUsedAt: string;
}

export interface TravelerSessionMeta {
  phone: string;
  mode: 'trusted' | 'temporary';
  deviceId: string;
  startedAt: number;
  expiresAt: number | null;
}

export type AccountVerificationStatus = 'pending_verification' | 'verified';

export type DriveEndpointScope = 'all' | 'client_docs' | 'admin_deliverables';

export interface DriveStorageEndpoint {
  id: string;
  label: string;
  url: string;
  scope: DriveEndpointScope;
  enabled: boolean;
}

export interface TravelerProfile {
  phone: string;
  phoneNormalized?: string;
  orderCode?: string;
  accountType?: AccountType;
  companyName?: string;
  contactPersonName?: string;
  firstName?: string;
  lastName?: string;
  name: string;
  avatarUrl?: string;
  avatarStoragePath?: string;
  avatarSizeBytes?: number;
  otp: string;
  otpGeneratedAt?: string;
  otpExpiresAt?: string;
  otpConsumed?: boolean;
  activatedByAdmin?: boolean;
  adminBypassOtpAt?: string;
  pinHash?: string;
  pinUpdatedAt?: string;
  trustedDevices?: TrustedDevice[];
  verified: boolean;
  accountStatus?: AccountVerificationStatus;
  verifiedAt?: string;
  isOnline?: boolean;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt?: string;
  orderStatus: VisaOrderStatus;
  adminNotes?: string;
  preferredVisaType?: string;
  passportNumber?: string;
  passportFullName?: string;
  passportExpiryDate?: string;
  nationality?: string;
  documents: TravelerDocument[];
  familyMembers?: FamilyMember[];
  issuedDocuments?: IssuedDocument[];
  notifications?: ClientNotification[];
  appointmentDetails?: AppointmentDetails;
  fcmToken?: string;
  fcmUpdatedAt?: string;
  pushNotificationsEnabled?: boolean;
}

export type ChatSenderRole = 'admin' | 'client';

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  downloadUrl: string;
  viewUrl?: string;
  storagePath?: string;
  sizeBytes?: number;
}

export interface ChatMessage {
  id: string;
  phoneId: string;
  senderRole: ChatSenderRole;
  senderName: string;
  text: string;
  attachments: ChatAttachment[];
  messageType: 'text' | 'files' | 'status_notice' | 'quick_reply';
  readByAdmin: boolean;
  readByClient: boolean;
  createdAt: string;
}

export interface ChatThreadSummary {
  phoneId: string;
  accountType?: AccountType;
  clientName?: string;
  companyName?: string;
  lastMessageText: string;
  lastMessageAt: string;
  lastSenderRole: ChatSenderRole;
  unreadAdminCount: number;
  unreadClientCount: number;
  updatedAt: string;
}

export interface PublicOrderStatusSummary {
  phoneId: string;
  orderCode: string;
  orderStatus: VisaOrderStatus;
  hasIssuedDocuments: boolean;
  updatedAt: string;
}

export interface PassportAiCheckResult {
  documentType: string;
  fullName: string;
  passportNumber: string;
  nationality: string;
  birthDate: string;
  expiryDate: string;
  hasSixMonthsValidity: boolean;
  remainingDays: number;
  validityStatus: 'valid_6m' | 'warning_under_6m' | 'expired' | 'unclear';
  summaryAr: string;
  missingRequirements: string[];
  confidenceNote: string;
}

export type AdminPermission =
  | 'manage_clients'
  | 'activate_otp'
  | 'edit_content'
  | 'delete_records';

export interface SubAdminAccount {
  id: string;
  name: string;
  pin: string;
  permissions: AdminPermission[];
  fcmToken?: string;
  fcmTokens?: string[];
  fcmUpdatedAt?: string;
  pushNotificationsEnabled?: boolean;
  createdAt: string;
}

export interface AdminSession {
  role: 'super_admin' | 'sub_admin';
  adminId: string;
  name: string;
  permissions: AdminPermission[];
  loggedInAt: string;
  mode: 'dashboard' | 'live_editor';
}

export interface CmsCustomItem {
  id: string;
  gridId: string;
  categoryId?: string;
  titleAr: string;
  titleEn: string;
  badgeAr?: string;
  badgeEn?: string;
  priceOfferAr?: string;
  priceOfferEn?: string;
  featuresAr: string[];
  featuresEn: string[];
  createdAt: string;
}


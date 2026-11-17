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

export type VisaOrderStatus =
  | 'تم استلام الأوراق'
  | 'تم حجز موعد تساهيل'
  | 'تحت المراجعة'
  | 'صدرت التأشيرة';

export interface TravelerDocument {
  id: string;
  label: string;
  docType: 'passport' | 'photo' | 'visa' | 'contract' | 'other';
  fileName: string;
  dataUrl: string;
  uploadedAt: string;
}

export interface TravelerProfile {
  phone: string;
  name: string;
  otp: string;
  verified: boolean;
  verifiedAt?: string;
  createdAt: string;
  orderStatus: VisaOrderStatus;
  adminNotes?: string;
  preferredVisaType?: string;
  passportNumber?: string;
  passportFullName?: string;
  passportExpiryDate?: string;
  nationality?: string;
  documents: TravelerDocument[];
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

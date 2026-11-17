import {
  ServiceCategory,
  TravelService,
  ClientReview,
  FeatureBadge,
  WhyChooseItem,
  FaqItem,
  VisaOrderStatus,
} from '../types/travel';
import { AppLanguage } from '../contexts/LanguageContext';

export const TravelRepository = {
  COMPANY_NAME_AR: 'مسارك للإنجاز السياحي (ذ.م.م)',
  COMPANY_NAME_EN: 'MASARIK TOURISM L.L.C',
  TAGLINE: 'منصتك لخدمات التأشيرات وتخليص الإجراءات وحجز الطيران والفنادق',
  PHONE_NUMBER: '01128440008',
  PHONE_DIAL: '+201128440008',
  WHATSAPP_URL: 'https://wa.me/201128440008',
  OFFICIAL_EMAIL: 'masarik.tourism@gmail.com',
  FACEBOOK_URL: 'https://facebook.com/masarik.tourism',
  FACEBOOK_USERNAME: 'masarik.tourism',
  INSTAPAY_URL: 'https://ipn.eg/S/lonely/instapay/0Dq6BN',
  INSTAPAY_CODE: '0Dq6BN',
  INSTAPAY_ACCOUNT: 'lonely',
  APK_DOWNLOAD_URL: 'https://github.com/masarik-tourism/masarik-tourism.github.io/releases/latest/download/Masarik-Tourism.apk',
  APK_LOCAL_URL: '/downloads/Masarik-Tourism.apk',
  APK_RELEASES_URL: 'https://github.com/masarik-tourism/masarik-tourism.github.io/releases',
  APK_VERSION: 'أحدث إصدار',
  APK_SIZE: 'رسمي وموقّع',
  COMMERCIAL_RECORD: '7839',
  COMMERCIAL_RECORD_AR: '7839',
  UNIFIED_NUMBER: '110900100007839',
  FOUNDING_YEAR: '2022',
  EXPERIENCE_TEXT: 'خبرة مستمرة منذ عام 2022',
  ADDRESS: 'الحجايزة - مركز السنبلاوين - محافظة الدقهلية',
  CERTIFICATION_TITLE: 'معتمدة وموثقة من الغرفة التجارية المصرية',
  COMMERCIAL_RECORD_STATEMENT: 'سجل تجاري رقم 7839 • الرقم الموحد: 110900100007839',
  CERTIFICATION: 'معتمدة وموثقة من الغرفة التجارية المصرية\nسجل تجاري رقم 7839 • الرقم الموحد: 110900100007839',
  WORKING_HOURS: 'خدمة عملاء متاحة 24 ساعة طوال أيام الأسبوع',
  COPYRIGHT: 'مسارك للإنجاز السياحي (2022) © جميع الحقوق محفوظة',

  featureBadges: [
    { title: 'خدمات التأشيرات (Visas)', subtitle: 'سياحة • زيارة • عمل • تساهيل', icon: 'file-text' },
    { title: 'تخليص الإجراءات والأوراق', subtitle: 'تصديقات • ترجمة • جوازات', icon: 'shield-check' },
    { title: 'حجز تذاكر الطيران', subtitle: 'طيران دولي ومحلي مؤكد', icon: 'plane' },
    { title: 'حجز الفنادق المعتمدة', subtitle: 'حجوزات مؤكدة ومبدئية للسفارات', icon: 'building' },
    { title: 'حجز مواعيد تساهيل و VFS', subtitle: 'مواعيد البصمة العادية والمميزة', icon: 'fingerprint' },
    { title: 'تسديد منصة إنجاز', subtitle: 'الرسوم والتأمين الطبي', icon: 'credit-card' },
  ] as FeatureBadge[],

  categories: [
    { id: 'all', titleAr: 'جميع الخدمات' },
    { id: 'visa-tasheel', titleAr: 'التأشيرات وتساهيل' },
    { id: 'documents', titleAr: 'تخليص الإجراءات والأوراق' },
    { id: 'flights', titleAr: 'حجز تذاكر الطيران' },
    { id: 'hotels', titleAr: 'حجز الفنادق' },
    { id: 'enjaz', titleAr: 'منصة إنجاز والتأمين' },
  ] as ServiceCategory[],

  services: [
    {
      id: 'tourist-visas',
      categoryId: 'visa-tasheel',
      title: 'خدمات التأشيرات (Visas) وتجهيز الملفات',
      badge: 'خدمات التأشيرات',
      speedBadge: 'خلال 24 ساعة',
      features: [
        'استخراج وتجهيز ملفات التأشيرات السياحية والزيارة العائلية والشخصية والتجارية',
        'تأشيرات السعودية ودول الخليج وتأشيرات الشنغن وأوروبا وبريطانيا',
        'تعبئة النماذج الرسمية، تجهيز خطابات التعريف، ومراجعة وتجهيز كشوف الحسابات',
        'إصدار حجوزات الطيران والفنادق المبدئية والمؤكدة المطلوبة للتقديم بالسفارات',
      ],
    },
    {
      id: 'tasheer-vfs',
      categoryId: 'visa-tasheel',
      title: 'حجز مواعيد تساهيل و VFS Tasheer',
      badge: 'حجز معتمد',
      speedBadge: 'إنجاز فوري',
      features: [
        'حجز فوري ومستعجل لمواعيد البصمة في كافة فروع تساهيل VFS بمصر',
        'استخراج الباركود الرسمي المعتمد وطباعة إيصال الموعد مباشرة',
        'مراجعة وتدقيق المستندات وتجهيز الملف بالكامل قبل موعد الحضور',
        'توفير مواعيد عادية ومواعيد مميزة (Lounge VIP) حسب رغبة العميل',
      ],
    },
    {
      id: 'flight-booking',
      categoryId: 'flights',
      title: 'حجز تذاكر الطيران المؤكدة',
      badge: 'أفضل الأسعار',
      speedBadge: 'إنجاز فوري',
      features: [
        'حجز تذاكر طيران دولية ومحلية على كافة خطوط الطيران المعتمدة',
        'رحلات مباشرة من مطار القاهرة وبرج العرب وكافة المطارات المصرية',
        'إمكانية تعديل المواعيد، اختيار المقاعد، وإضافة الأوزان والحقائب الإضافية',
        'متابعة مستمرة وتأكيد فوري للتذكرة حتى موعد إقلاع الرحلة',
      ],
    },
    {
      id: 'hotel-booking',
      categoryId: 'hotels',
      title: 'حجز الفنادق والشقق الفندقية المعتمدة',
      badge: 'تأكيد رسمي',
      speedBadge: 'إنجاز فوري',
      features: [
        'حجوزات فنادق فاخرة واقتصادية في المملكة العربية السعودية ومختلف دول العالم',
        'حجوزات فندقية مؤكدة ومبدئية مطابقة لاشتراطات السفارات والتأشيرات',
        'خيارات غرف وأجنحة عائلية مع إفطار ومرونة في التعديل أو الإلغاء',
        'إرسال قسيمة الحجز الرسمية (Voucher) بالاسم وتفاصيل الإقامة فوراً',
      ],
    },
    {
      id: 'attestation-translation',
      categoryId: 'documents',
      title: 'تخليص الإجراءات والأوراق والتصديقات',
      badge: 'سجل 7839',
      speedBadge: 'خلال 24 ساعة',
      features: [
        'تخليص وتصديق الأوراق لدى الغرفة التجارية المصرية ومكاتب وزارة الخارجية',
        'تصديق عقود العمل والوكالات القانونية والشهادات الدراسية والجامعية',
        'توجيه وإرشاد لاستخراج وتجديد جوازات السفر والمستخرجات الرسمية المميكنة',
        'ترجمة معتمدة لجميع الوثائق والشهادات والتقارير الطبية للسفارات',
      ],
    },
    {
      id: 'enjaz-insurance',
      categoryId: 'enjaz',
      title: 'خدمات منصة إنجاز ودفع الرسوم والتأمين الطبي',
      badge: 'ربط إلكتروني',
      speedBadge: 'إنجاز فوري',
      features: [
        'تسديد رسوم التأشيرة على منصة التأشيرات إنجاز الرسمية إلكترونياً',
        'إصدار وثيقة التأمين الطبي الإلزامية المعتمدة للمسافرين',
        'استخراج إيصال السداد النظامي وربط الطلب آلياً مع منصة المواعيد',
        'تعديل وحل مشكلات السداد وتحديث بيانات الطلبات القديمة',
      ],
    },
  ] as TravelService[],

  whyChooseUs: [
    {
      id: 'step-by-step',
      title: 'متابعة كاملة خطوة بخطوة',
      description: 'نرافقك لحظة بلحظة ونوافيك بتحديثات مستمرة حول طلبك من البداية وحتى استلام التأشيرة والوثائق.',
      icon: 'clock-check',
    },
    {
      id: 'online-remote',
      title: 'إنجاز المعاملات عن بُعد أونلاين',
      description: 'أنجز كافة أوراقك وحجوزاتك وأنت في منزلك أينما كنت في مصر دون عناء التنقل والانتظار.',
      icon: 'laptop',
    },
    {
      id: 'complete-security',
      title: 'سرية وحماية كاملة للمستندات',
      description: 'خصوصية وأمان تام لكافة بياناتك الشخصية ووثائقك الرسمية تحت أعلى معايير حفظ المعلومات.',
      icon: 'shield-lock',
    },
    {
      id: 'licensed-company',
      title: 'شركة مسجلة ومرخصة رسمياً',
      description: 'شركة مسجلة ومرخصة رسمياً (ذ.م.م) من الغرفة التجارية المصرية بسجل تجاري رقم 7839 ورقم موحد 110900100007839، بخبرة موثوقة منذ عام 2022.',
      icon: 'award-check',
    },
  ],

  faqs: [
    {
      question: 'ما هي الخدمات التي تقدمها شركة مسارك للإنجاز السياحي حالياً؟',
      answer: 'تقتصر خدماتنا المتخصصة حالياً على: استخراج وتجهيز ملفات التأشيرات (Visas)، حجز مواعيد تساهيل VFS وتسديد منصة إنجاز، تخليص الإجراءات وتصديق الأوراق، وحجز تذاكر الطيران والفنادق المعتمدة أونلاين.',
    },
    {
      question: 'كيف يتم حجز موعد تساهيل VFS وما هو الوقت المطلوب؟',
      answer: 'نقوم بحجز الموعد إلكترونياً فور إرسال بيانات الجواز والتأشيرة، ونوفر مواعيد عادية أو مستعجلة ومميزة حسب المتاح برغبتك، مع تسليمك الباركود الرسمي ووثيقة التأمين وإيصال السداد فوراً.',
    },
    {
      question: 'هل يمكنني إنجاز معاملتي بالكامل دون الحضور إلى المكتب؟',
      answer: 'نعم بكل تأكيد، أكثر من 90% من معاملاتنا (خدمات التأشيرات، حجز تساهيل، تسديد إنجاز، حجز تذاكر الطيران والفنادق، وتخليص الأوراق) يتم إنهاؤها أونلاين عن بُعد عبر الواتساب ويصلك الملف جاهزاً.',
    },
    {
      question: 'ما هي طرق الدفع المتاحة لدى مسارك للإنجاز السياحي؟',
      answer: 'نوفر وسائل دفع آمنة وسريعة تشمل الدفع عبر إنستاباي (InstaPay) على الحساب المعتمد، التحويل البنكي، أو الدفع نقداً من خلال زيارة مقر الشركة.',
    },
    {
      question: 'هل مسارك للإنجاز السياحي جهة موثقة رسمياً؟',
      answer: 'نعم، شركة مسارك للإنجاز السياحي (ذ.م.م) معتمدة ومرخصة رسمياً من الغرفة التجارية المصرية بسجل تجاري رقم 7839 ورقم موحد 110900100007839، ومقرها الرئيسي: الحجايزة - مركز السنبلاوين - محافظة الدقهلية، وتعمل بخبرة متخصصة ومستمرة منذ عام 2022.',
    },
  ],

  reviews: [
    {
      id: '1',
      author: 'أحمد محمود العوضي',
      tripType: 'تأشيرة وتساهيل VFS',
      year: '2023',
      comment:
        'مكتب مسارك للإنجاز السياحي أنقذ موقفي في حجز موعد تساهيل وتسديد إنجاز في وقت قياسي. دقة عالية وسرعة في الرد عبر الواتساب والمتابعة حتى استلام الجواز.',
      rating: 5,
    },
    {
      id: '2',
      author: 'سارة عبدالرحمن',
      tripType: 'ملف تأشيرة وحجز طيران وفندق',
      year: '2024',
      comment:
        'خدمة ممتازة وتجهيز كامل لملف التأشيرة وحجوزات الطيران والفنادق بأفضل الأسعار. المعاملة كلها تمت أونلاين باحترافية وسهولة تامة دون أي إرهاق.',
      rating: 5,
    },
    {
      id: '3',
      author: 'المهندس طارق منصور',
      tripType: 'تخليص أوراق وتصديقات',
      year: '2025',
      comment:
        'تعامل راقي جداً من فريق مسارك، أنهوا كل إجراءات التصديقات الرسمية وعقود العمل وحجز الطيران دون أي تعقيد. أنصح الجميع بالتعامل معهم.',
      rating: 5,
    },
    {
      id: '4',
      author: 'محمود كمال البدري',
      tripType: 'تسديد إنجاز وتأمين طبي',
      year: '2026',
      comment:
        'تم تسديد رسوم إنجاز وإصدار التأمين الطبي الإلزامي في غضون ربع ساعة فقط، وتسلمت الإيصالات والباركود على الواتساب مباشرة. سرعة وأمانة يشكرون عليها.',
      rating: 5,
    },
  ] as ClientReview[],
};

const EnglishTravelContent = {
  companyName: 'Masarik Lil-Injaz Al-Siyahi LLC',
  shortCompanyName: 'Masarik Tourism',
  tagline: 'Your Official Portal for Visa Services, Paperwork Clearance, Flights & Hotels',
  certificationTitle: 'Certified & Verified by the Egyptian Chamber of Commerce',
  commercialRecordStatement: 'Commercial Record No. 7839 • Unified ID: 110900100007839',
  address: 'Al-Hajayza - El Senbellawein Center - Dakahlia Governorate, Egypt',
  workingHours: '24/7 Customer Support All Week Long',
  experienceText: 'Continuous Expertise Since 2022',
  copyright: 'Masarik Lil-Injaz Al-Siyahi LLC (2022) © All Rights Reserved',

  categories: [
    { id: 'all', titleAr: 'All Services' },
    { id: 'visa-tasheel', titleAr: 'Visas & Tasheer' },
    { id: 'documents', titleAr: 'Document Clearance' },
    { id: 'flights', titleAr: 'Flight Tickets' },
    { id: 'hotels', titleAr: 'Hotel Bookings' },
    { id: 'enjaz', titleAr: 'Enjaz & Insurance' },
  ] as ServiceCategory[],

  services: [
    {
      id: 'tourist-visas',
      categoryId: 'visa-tasheel',
      title: 'Visa Services & Application File Preparation',
      badge: 'Visa Services',
      speedBadge: 'Within 24h',
      features: [
        'Complete preparation of tourist, family visit, personal, and business visa files',
        'Saudi Arabia, GCC, Schengen, European Union, and UK visa applications',
        'Official form filling, employment letters, and bank statement review',
        'Embassy-compliant provisional and confirmed flight & hotel itineraries',
      ],
    },
    {
      id: 'tasheer-vfs',
      categoryId: 'visa-tasheel',
      title: 'VFS Tasheer Biometric Appointments',
      badge: 'Verified Booking',
      speedBadge: 'Instant',
      features: [
        'Immediate and urgent biometric appointment scheduling across all VFS Tasheer centers in Egypt',
        'Official barcode issuance and direct appointment confirmation receipt',
        'Full document audit and checklist preparation prior to your center visit',
        'Standard and VIP Lounge appointment options tailored to your schedule',
      ],
    },
    {
      id: 'flight-booking',
      categoryId: 'flights',
      title: 'Confirmed Flight Ticket Reservations',
      badge: 'Best Rates',
      speedBadge: 'Instant',
      features: [
        'International and domestic flight bookings on all major certified airlines',
        'Direct flights from Cairo, Borg El Arab, and all Egyptian airports',
        'Flexible date changes, seat selection, and extra baggage allowance',
        'Continuous follow-up and instant ticket confirmation through departure',
      ],
    },
    {
      id: 'hotel-booking',
      categoryId: 'hotels',
      title: 'Verified Hotel & Serviced Apartment Bookings',
      badge: 'Official Voucher',
      speedBadge: 'Instant',
      features: [
        'Luxury and budget stays in Saudi Arabia and destinations worldwide',
        'Confirmed and provisional hotel vouchers compliant with embassy visa rules',
        'Family suites, breakfast packages, and flexible modification or cancellation',
        'Instant delivery of official guest vouchers with full reservation details',
      ],
    },
    {
      id: 'attestation-translation',
      categoryId: 'documents',
      title: 'Document Clearance, Attestation & Translation',
      badge: 'CR 7839',
      speedBadge: 'Within 24h',
      features: [
        'Document clearance and legalization at the Egyptian Chamber of Commerce & MOFA',
        'Attestation of work contracts, powers of attorney, and academic diplomas',
        'Guided support for passport issuance, renewals, and digitized civil records',
        'Certified translation of legal documents, certificates, and medical reports',
      ],
    },
    {
      id: 'enjaz-insurance',
      categoryId: 'enjaz',
      title: 'Enjaz Platform Payments & Medical Insurance',
      badge: 'E-Linked',
      speedBadge: 'Instant',
      features: [
        'Electronic payment of official visa fees on the Saudi Enjaz platform',
        'Issuance of mandatory accredited travel medical insurance policies',
        'Official payment receipt generation linked directly with appointment portals',
        'Resolving payment issues and updating existing visa applications',
      ],
    },
  ] as TravelService[],

  whyChooseUs: [
    {
      id: 'step-by-step',
      title: 'Full Step-by-Step Follow-Up',
      description: 'We stay with you at every stage with real-time updates from submission until you receive your visa and documents.',
      icon: 'clock-check',
    },
    {
      id: 'online-remote',
      title: '100% Remote Online Processing',
      description: 'Complete your paperwork and bookings comfortably from home anywhere in Egypt without queues or travel.',
      icon: 'laptop',
    },
    {
      id: 'complete-security',
      title: 'Strict Document Confidentiality',
      description: 'Total privacy and protection for your personal details, passport scans, and official papers under strict standards.',
      icon: 'shield-lock',
    },
    {
      id: 'licensed-company',
      title: 'Officially Registered & Licensed LLC',
      description: 'Officially licensed by the Egyptian Chamber of Commerce (CR No. 7839, Unified ID 110900100007839) with trusted expertise since 2022.',
      icon: 'award-check',
    },
  ] as WhyChooseItem[],

  faqs: [
    {
      question: 'What services does Masarik Tourism LLC currently provide?',
      answer: 'We specialize in tourist and visit visa file preparation, VFS Tasheer appointments, Enjaz fee payments & medical insurance, document attestation and certified translation, plus confirmed flight and hotel bookings online.',
    },
    {
      question: 'How do VFS Tasheer appointments work and how fast can they be booked?',
      answer: 'We book your appointment electronically as soon as you share your passport and visa details, offering Standard or VIP Lounge slots with instant delivery of your official barcode, insurance policy, and payment receipt.',
    },
    {
      question: 'Can I complete my entire application remotely without visiting an office?',
      answer: 'Yes. Over 90% of our visa files, Tasheer appointments, Enjaz payments, flight/hotel bookings, and document clearances are completed seamlessly online via WhatsApp.',
    },
    {
      question: 'What payment methods are accepted by Masarik Tourism?',
      answer: 'We accept instant InstaPay transfers to our official link, bank transfers (NBE / Banque Misr), or cash payments at our registered headquarters.',
    },
    {
      question: 'Is Masarik Tourism officially licensed and registered?',
      answer: 'Yes. Masarik Lil-Injaz Al-Siyahi LLC is officially licensed by the Egyptian Chamber of Commerce under Commercial Record No. 7839 and Unified No. 110900100007839, headquartered in El Senbellawein, Dakahlia, operating since 2022.',
    },
  ] as FaqItem[],

  reviews: [
    {
      id: '1',
      author: 'Ahmed Mahmoud El-Awady',
      tripType: 'Visa & VFS Tasheer',
      year: '2023',
      comment: 'Masarik Tourism saved my schedule by securing a Tasheer slot and completing Enjaz payment in record time. Fast WhatsApp replies and follow-up until passport pickup.',
      rating: 5,
    },
    {
      id: '2',
      author: 'Sara Abdelrahman',
      tripType: 'Visa File, Flight & Hotel Booking',
      year: '2024',
      comment: 'Outstanding service preparing my complete visa file along with flight and hotel reservations at great rates. Everything was completed online smoothly.',
      rating: 5,
    },
    {
      id: '3',
      author: 'Eng. Tarek Mansour',
      tripType: 'Document Clearance & Attestation',
      year: '2025',
      comment: 'Very professional team. They handled official Chamber & MOFA attestations, work contracts, and flight tickets without any hassle. Highly recommended.',
      rating: 5,
    },
    {
      id: '4',
      author: 'Mahmoud Kamal El-Badry',
      tripType: 'Enjaz & Medical Insurance',
      year: '2026',
      comment: 'Enjaz fees and mandatory medical insurance were completed within 15 minutes, with receipts and barcodes sent straight to WhatsApp. Truly fast and trustworthy.',
      rating: 5,
    },
  ] as ClientReview[],
};

export function getLocalizedTravelContent(lang: AppLanguage) {
  if (lang === 'en') {
    return EnglishTravelContent;
  }
  return {
    companyName: TravelRepository.COMPANY_NAME_AR,
    shortCompanyName: 'مسارك للسياحة',
    tagline: TravelRepository.TAGLINE,
    certificationTitle: TravelRepository.CERTIFICATION_TITLE,
    commercialRecordStatement: TravelRepository.COMMERCIAL_RECORD_STATEMENT,
    address: TravelRepository.ADDRESS,
    workingHours: TravelRepository.WORKING_HOURS,
    experienceText: TravelRepository.EXPERIENCE_TEXT,
    copyright: TravelRepository.COPYRIGHT,
    categories: TravelRepository.categories,
    services: TravelRepository.services,
    whyChooseUs: TravelRepository.whyChooseUs,
    faqs: TravelRepository.faqs,
    reviews: TravelRepository.reviews,
  };
}

export function translateOrderStatus(status: VisaOrderStatus, lang: AppLanguage): string {
  if (lang === 'ar') return status;
  switch (status) {
    case 'تم استلام الأوراق':
      return 'Documents Received';
    case 'تم حجز موعد تساهيل':
      return 'Tasheer Booked';
    case 'تحت المراجعة':
      return 'Under Review';
    case 'صدرت التأشيرة':
      return 'Visa Issued';
    default:
      return status;
  }
}

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
      requiredDocs: [
        'صورة جواز سفر ساري لمدة لا تقل عن 6 أشهر',
        'صورة شخصية حديثة بخلفية بيضاء',
        'كشف حساب بنكي أو خطاب تعريف (لتأشيرات الشنغن والسفر)',
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
      requiredDocs: [
        'صورة جواز السفر بوضوح (الصفحة الأولى)',
        'صورة مستند التأشيرة أو الدعوة / رقم المستند',
        'صورة شخصية بخلفية بيضاء + تحديد الفرع والمحافظة',
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
      requiredDocs: [
        'صورة جواز سفر ساري لكل مسافر',
        'صورة التأشيرة أو الإقامة (للوجهة الدولية)',
        'تحديد مطار المغادرة والوصول وتاريخ السفر المطلوب',
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
      requiredDocs: [
        'صورة جواز السفر (لتطابق الاسم الإنجليزي في القسيمة)',
        'تاريخ الوصول والمغادرة وعدد النزلاء والغرف',
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
      requiredDocs: [
        'صورة واضحة للمستند أو الشهادة أو العقد المطلوب تخليصه',
        'صورة جواز السفر أو بطاقة الرقم القومي لصاحب الطلب',
      ],
    },
    {
      id: 'enjaz-insurance',
      categoryId: 'enjaz',
      title: 'منصة إنجاز وحجز جامكا (GAMCA) والتأمين الطبي',
      badge: 'ربط إلكتروني',
      speedBadge: 'إنجاز فوري',
      features: [
        'تسديد رسوم التأشيرة على منصة التأشيرات إنجاز الرسمية إلكترونياً بشفافية الأسعار',
        'حجز مواعيد الكشف الطبي المعتمد جامكا / وافد (GAMCA / Wafid) للسفر والعمل',
        'إصدار وثيقة التأمين الطبي الإلزامية المعتمدة واستخراج إيصال السداد النظامي',
        'ربط الطلب آلياً مع منصة تساهيل وحل مشكلات السداد وتحديث البيانات',
      ],
      requiredDocs: [
        'صورة جواز السفر ساري لمدة لا تقل عن 6 أشهر',
        'صورة شخصية حديثة بخلفية بيضاء',
        'صورة التأشيرة / رقم التفويض أو العقد الإلكتروني',
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
      question: 'كم تستغرق مدة الإنجاز واستلام مستنداتي؟',
      answer: 'يتم حجز مواعيد تساهيل ووافد (GAMCA) وإصدار تذاكر الطيران والفنادق وسداد منصة إنجاز بشكل فوري خلال دقائق إلى ساعات قليلة، بينما تجهيز ملفات التأشيرات وتصديق الأوراق يتم خلال 24 ساعة. ويصل مستند التنفيذ النهائي (PDF أو صورة) مباشرة في حسابك مع إشعار فوري.',
    },
    {
      question: 'كيف يتم حجز المواعيد (تساهيل VFS وجامكا) دون الحضور للمكتب؟',
      answer: 'ترفع صورة الجواز والصورة الشخصية وتبدأ الطلب أونلاين بضغطة زر؛ يقوم فريقنا بحجز الموعد المناسب (عادي أو VIP Lounge) وإرفاق إيصال الموعد والباركود مباشرة داخل قسم "طلباتي" و"مستنداتي الصادرة" في حسابك.',
    },
    {
      question: 'ما هي طرق السداد والتحويل المتاحة؟',
      answer: 'نوفر وسائل سداد مرنة وموثقة تشمل: التحويل الفوري عبر إنستاباي (InstaPay) على الرابط الرسمي، التحويل البنكي المباشر لحساب الشركة، أو السداد نقداً عند زيارة مقر الشركة.',
    },
    {
      question: 'هل أحتاج لتسجيل الدخول لتصفح الخدمات أو طلب خدمة؟',
      answer: 'لا، تصفح جميع الخدمات والأسعار والأسئلة الشائعة والتواصل عبر الواتساب متاح للجميع فوراً دون اشتراط تسجيل. أما الحساب الشخصي فميزة مجانية تتيح لك حفظ أوراقك سحابياً ومتابعة طلبك وتحميل ملفات PDF الصادرة.',
    },
    {
      question: 'هل شركة مسارك للإنجاز السياحي مرخصة ومعتمدة رسمياً؟',
      answer: 'نعم، شركة مسارك للإنجاز السياحي (ذ.م.م) مسجلة ومرخصة رسمياً من الغرفة التجارية المصرية بسجل تجاري رقم 7839 والرقم الموحد 110900100007839 وتعمل بخبرة متخصصة منذ عام 2022.',
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
      requiredDocs: [
        'Passport scan valid for at least 6 months',
        'Recent personal photo with white background',
        'Bank statement or HR employment letter (for Schengen/travel)',
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
      requiredDocs: [
        'Clear passport data page scan',
        'Visa document or official invitation number',
        'White-background personal photo & preferred branch',
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
      requiredDocs: [
        'Valid passport scan for each traveler',
        'Visa or residency copy (for international destinations)',
        'Departure/arrival airports and preferred travel dates',
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
      requiredDocs: [
        'Passport scan (to match full Latin name on voucher)',
        'Check-in/out dates and number of guests/rooms',
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
      requiredDocs: [
        'Clear scan of the certificate, contract, or document',
        'Passport or National ID copy of the applicant',
      ],
    },
    {
      id: 'enjaz-insurance',
      categoryId: 'enjaz',
      title: 'Enjaz Platform, GAMCA Medical & Insurance',
      badge: 'E-Linked',
      speedBadge: 'Instant',
      features: [
        'Electronic payment of official visa fees on the Saudi Enjaz platform with transparent pricing',
        'Official GAMCA / Wafid medical examination appointment booking for travel & employment',
        'Issuance of mandatory accredited travel medical insurance & official payment receipts',
        'Seamless linking with VFS Tasheer portals and resolving existing application issues',
      ],
      requiredDocs: [
        'Passport scan valid for at least 6 months',
        'Recent personal photo with white background',
        'Visa copy / E-authorization or employment contract number',
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
      question: 'How long does processing and document delivery take?',
      answer: 'VFS Tasheer & GAMCA appointments, Enjaz payments, and flight/hotel bookings are completed within minutes to a few hours. Visa files & attestations take up to 24 hours. Final documents (PDF/Image) appear straight in your account with an instant alert.',
    },
    {
      question: 'How do appointment bookings (Tasheer VFS & GAMCA) work?',
      answer: 'Upload your passport & personal photo before submitting your request. Our team books your Standard or VIP slot and delivers the official barcode/PDF receipt straight to your "My Orders" and "Issued Documents" wallet.',
    },
    {
      question: 'What payment and transfer methods are available?',
      answer: 'We accept instant InstaPay transfers via our verified link, direct bank transfers, or cash payment at our registered office.',
    },
    {
      question: 'Do I have to sign in to browse services or request a booking?',
      answer: 'No. All services, requirements, FAQs, and WhatsApp requests are 100% open without login. Creating an account is optional to track progress live and download issued PDFs anytime.',
    },
    {
      question: 'Is Masarik Tourism officially licensed and registered?',
      answer: 'Yes. Masarik Lil-Injaz Al-Siyahi LLC is officially licensed by the Egyptian Chamber of Commerce under Commercial Record No. 7839 and Unified No. 110900100007839, operating since 2022.',
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

export function normalizeOrderStatusValue(status?: string):
  | 'تم استلام الطلب'
  | 'قيد المراجعة والتنفيذ'
  | 'تم الحجز / الإصدار'
  | 'تم تنفيذ الطلب'
  | 'مكتمل' {
  switch (status) {
    case 'قيد المراجعة والتنفيذ':
    case 'تحت المراجعة':
      return 'قيد المراجعة والتنفيذ';
    case 'تم الحجز / الإصدار':
    case 'تم حجز موعد تساهيل':
      return 'تم الحجز / الإصدار';
    case 'تم تنفيذ الطلب':
      return 'تم تنفيذ الطلب';
    case 'مكتمل':
    case 'صدرت التأشيرة':
      return 'مكتمل';
    case 'تم استلام الطلب':
    case 'تم استلام الأوراق':
    default:
      return 'تم استلام الطلب';
  }
}

export function translateOrderStatus(status: VisaOrderStatus | string, lang: AppLanguage): string {
  const canonical = normalizeOrderStatusValue(status);
  if (lang === 'ar') return canonical;
  switch (canonical) {
    case 'تم استلام الطلب':
      return 'Order Received';
    case 'قيد المراجعة والتنفيذ':
      return 'Under Review & Processing';
    case 'تم الحجز / الإصدار':
      return 'Booked / Issued';
    case 'تم تنفيذ الطلب':
      return 'Order Executed & Completed';
    case 'مكتمل':
      return 'Completed';
    default:
      return canonical;
  }
}

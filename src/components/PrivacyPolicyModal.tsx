import React, { useEffect } from 'react';
import { ShieldCheck, X, Lock, Smartphone, Mail, Phone, Globe, MapPin } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  const { isAr, dir, t } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-no-admin-edit="true"
      className="fixed inset-0 z-50 bg-[#0A1926]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-policy-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88vh] bg-white rounded-3xl shadow-2xl border-2 border-[#C6A052]/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-[#0A1926] via-[#0F2438] to-[#163B65] text-white px-5 py-4 border-b-2 border-[#C6A052] flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#C6A052]/20 border border-[#C6A052] text-[#E5C887] flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-[#E5C887] block">
                {t('شركة مسارك للإنجاز السياحي (ذ.م.م)', 'Masarik Tourism LLC')}
              </span>
              <h2
                id="privacy-policy-modal-title"
                className="text-base sm:text-lg font-black text-white leading-snug"
              >
                {t('سياسة الخصوصية وحماية البيانات', 'Privacy Policy & Data Protection')}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] font-bold text-slate-200">
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-[#C6A052]/40 text-[#E5C887]">
                  {t('سجل تجاري: 7839', 'CR No: 7839')}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-[#C6A052]/40 text-[#E5C887]">
                  {t('الرقم الموحد: 110900100007839', 'Unified No: 110900100007839')}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-[#C6A052]/40 text-[#E5C887]">
                  {t('تحديث: 19 نوفمبر 2026', 'Updated: Nov 19, 2026')}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer shrink-0 font-bold"
            aria-label={t('إغلاق سياسة الخصوصية', 'Close Privacy Policy')}
            title={t('إغلاق', 'Close')}
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4 bg-slate-50/70 text-[#0F2438]">
          {isAr ? (
            <>
              <section className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 space-y-2">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  1. المقدمة ونطاق التطبيق
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  نحترم في <strong>شركة مسارك للإنجاز السياحي (ذ.م.م)</strong> خصوصيتك ونلتزم بحماية جميع البيانات الشخصية والمستندات الرسمية التي تشاركها معنا عبر الموقع الإلكتروني الرسمي (
                  <a
                    href="https://masarik-tourism.github.io/"
                    dir="ltr"
                    style={{ unicodeBidi: 'isolate' }}
                    className="inline-block text-[#0284C7] font-bold hover:underline"
                  >
                    https://masarik-tourism.github.io/
                  </a>
                  ) أو عبر تطبيق الأندرويد الرسمي <strong>«مسارك للسياحة»</strong>.
                </p>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  باستخدامك للموقع أو التطبيق أو طلبك لأي من خدمات التأشيرات، تساهيل، جامكا/وافد، إنجاز، حجز تذاكر الطيران أو الفنادق، فإنك توافق على جمع واستخدام المعلومات وفق الضوابط الصارمة الموضحة في هذه السياسة.
                </p>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  2. البيانات التي نقوم بجمعها
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  نجمع فقط الحد الأدنى اللازم من البيانات لتنفيذ خدمات السفر والتأشيرات بدقة وأمان:
                </p>
                <ul className="list-disc ps-5 space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <li>
                    <strong>بيانات الهوية والتواصل:</strong> الاسم الكامل (المطابق لجواز السفر)، رقم الهاتف / الواتساب لتفعيل الحساب عبر رمز التحقق (OTP) والتواصل بشأن طلباتك.
                  </li>
                  <li>
                    <strong>بيانات ومستندات السفر:</strong> صورة جواز السفر، الصورة الشخصية الرسمية، رقم الجواز، الجنسية، تاريخ انتهاء الصلاحية، وبيانات المرافقين في ملف العائلة (عند إضافتها اختيارياً).
                  </li>
                  <li>
                    <strong>بيانات المعاملات والدفع:</strong> إيصالات التحويل المرفوعة اختيارياً (عبر إنستاباي أو المحافظ الإلكترونية) وملاحظات الطلب وتفاصيل المواعيد المحجوزة.
                  </li>
                  <li>
                    <strong>بيانات الأمان والتحقق من الجهاز:</strong> رمز الدخول السريع المشفر (PIN) ومعرّف الجهاز الموثوق لحماية حسابك ومنع الوصول غير المصرح به.
                  </li>
                </ul>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  3. أغراض استخدام البيانات
                </h3>
                <ul className="list-disc ps-5 space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <li>تجهيز وتنفيذ معاملات التأشيرات، حجز مواعيد مراكز تساهيل (VFS Tasheer)، حجز الفحص الطبي (جامكا/وافد)، وسداد رسوم منصة إنجاز والتأمين الطبي.</li>
                  <li>إصدار وحجز تذاكر الطيران والفنادق وتوثيق المستندات وفقاً لطلبك.</li>
                  <li>إتاحة المتابعة اللحظية لطلبك داخل حساب العميل وتوفير بطاقة الباركود السريعة للمواعيد وإرسال مستندات الإنجاز (PDF/صور).</li>
                  <li>التحقق المبدئي من صلاحية جواز السفر (شرط الـ 6 أشهر) لتجنب رفض المعاملات، وتقديم الدعم الفني عبر الواتساب أو الهاتف أو المحادثة الفورية.</li>
                  <li>تأمين الحساب عبر أكواد التفعيل (OTP) ومنع الاحتيال أو انتحال الهوية.</li>
                </ul>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#C6A052] shrink-0" />
                  <span>4. أذونات تطبيق الأندرويد (مسارك للسياحة)</span>
                </h3>
                <ul className="list-disc ps-5 space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <li>
                    <strong>الاتصال بالإنترنت والشبكة:</strong> لعرض المنصة وتحديث حالة الطلبات والتحقق من التحديثات الرسمية للتطبيق.
                  </li>
                  <li>
                    <strong>اختيار الملفات والصور / الكاميرا (عند الرفع اليدوي فقط):</strong> يتيح لك اختيار صورة جواز السفر أو الصورة الشخصية أو إيصال الدفع لرفعها داخل طلبك؛ ولا يصل التطبيق أبداً إلى ملفاتك في الخلفية.
                  </li>
                  <li>
                    <strong>عدم جمع بيانات غير مصرح بها:</strong> لا يجمع التطبيق أو يطلب الوصول إلى جهات اتصالك، أو موقعك الجغرافي (GPS) في الخلفية، أو سجل مكالماتك، أو رسائلك النصية.
                  </li>
                </ul>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-[#C6A052] shrink-0" />
                  <span>5. حفظ البيانات والأمان السحابي</span>
                </h3>
                <ul className="list-disc ps-5 space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <li>تتم جميع عمليات الاتصال ونقل البيانات عبر بروتوكول التشفير الآمن <strong>HTTPS / TLS</strong>.</li>
                  <li>تُحفظ بيانات الحساب والطلبات في قواعد بيانات <strong>Google Firebase Firestore</strong> المحمية بقواعد أمان صارمة، بينما تُحفظ رموز الدخول السرية (PIN) بصيغة مشفّرة أحادية الاتجاه (SHA-256 Hash).</li>
                  <li>تُخزَّن صور المستندات المرفوعة ومستندات الإنجاز في المساحة السحابية المؤمّنة الخاصة بالشركة (Google Drive) ولا يُسمح بالوصول إليها إلا للمستخدم صاحب الحساب وفريق العمل المخول لإنجاز المعاملة.</li>
                  <li>تلتزم الشركة بعدم بيع أو تأجير أو المتاجرة ببيانات العملاء أو مستنداتهم لأي جهات تسويقية أو إعلانية تحت أي ظرف.</li>
                </ul>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  6. مشاركة البيانات مع الجهات الرسمية
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  لا يتم مشاركة بياناتك مع أي طرف خارجي إلا في الحدود الضرورية لإتمام الخدمة التي طلبتها بنفسك: السفارات والقنصليات ومنصات التأشيرات الرسمية (إنجاز، مراكز تساهيل VFS)، المعامل الطبية المعتمدة (جامكا/وافد)، شركات الطيران والفنادق، أو الجهات القضائية المختصة عند وجود التزام قانوني.
                </p>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  7. الاحتفاظ بالبيانات، القاصرون، والتعديلات
                </h3>
                <ul className="list-disc ps-5 space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <li>يحق لك في أي وقت مراجعة بياناتك وتحديثها أو طلب <strong>الحذف الكامل لحسابك وجميع بياناتك</strong> عبر القنوات الرسمية خلال مدة أقصاها 48 ساعة عمل.</li>
                  <li>خدمات المنصة موجهة للبالغين (18 عاماً فأكثر)، ولا تُدرج بيانات القاصرين إلا بواسطة ولي الأمر ضمن ملف العائلة لإنجاز معاملات السفر الرسمية فقط.</li>
                  <li>قد نقوم بتحديث هذه السياسة مستقبلاً لمواكبة التطورات التقنية أو التشريعية، ويُعد تاريخ التحديث بالأعلى مرجعاً لسريانها.</li>
                </ul>
              </section>

              <section className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  8. بيانات التواصل الرسمية للشركة
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-[#0284C7] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10.5px] font-bold text-slate-500 block">البريد الإلكتروني الرسمي</span>
                      <a
                        href="mailto:masarik.tourism@gmail.com"
                        dir="ltr"
                        style={{ unicodeBidi: 'isolate' }}
                        className="inline-block font-extrabold text-[#0F2438] hover:text-[#0284C7] hover:underline break-all"
                      >
                        masarik.tourism@gmail.com
                      </a>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-[#0284C7] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10.5px] font-bold text-slate-500 block">الهاتف والواتساب الرسمي</span>
                      <a
                        href="tel:+201128440008"
                        dir="ltr"
                        style={{ unicodeBidi: 'isolate' }}
                        className="inline-block font-extrabold text-[#0F2438] hover:text-[#0284C7] hover:underline"
                      >
                        01128440008
                      </a>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5">
                    <MapPin className="w-4 h-4 text-[#0284C7] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10.5px] font-bold text-slate-500 block">المقر الرئيسي</span>
                      <span className="font-bold text-[#0F2438]">
                        الحجايزة - مركز السنبلاوين - محافظة الدقهلية، مصر
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-[#0284C7] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10.5px] font-bold text-slate-500 block">الموقع الرسمي للشركة</span>
                      <a
                        href="https://masarik-tourism.github.io/"
                        dir="ltr"
                        style={{ unicodeBidi: 'isolate' }}
                        className="inline-block font-extrabold text-[#0284C7] hover:underline break-all"
                      >
                        https://masarik-tourism.github.io/
                      </a>
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 space-y-2">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  1. Introduction & Scope
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  At <strong>Masarik Lil-Injaz Al-Siyahi LLC (Masarik Tourism)</strong>, we respect your privacy and protect all personal data and travel documents submitted via our official portal (
                  <a
                    href="https://masarik-tourism.github.io/"
                    dir="ltr"
                    style={{ unicodeBidi: 'isolate' }}
                    className="inline-block text-[#0284C7] font-bold hover:underline"
                  >
                    https://masarik-tourism.github.io/
                  </a>
                  ) or our official <strong>Masarik Tourism</strong> Android application.
                </p>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  2. Data Collected & Purpose
                </h3>
                <ul className="list-disc ps-5 space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <li><strong>Identity & Contact:</strong> Full name, phone / WhatsApp number for OTP activation and order notifications.</li>
                  <li><strong>Travel Documents:</strong> Passport scan, personal photo, passport details, and optional family companions solely for visa, VFS Tasheer, GAMCA/Wafid, Enjaz, flight, and hotel bookings.</li>
                  <li><strong>Security:</strong> Encrypted PIN (SHA-256 hash) and trusted device identifiers to secure your account against unauthorized access.</li>
                </ul>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
                <h3 className="text-sm sm:text-base font-black text-[#0F2438] border-s-4 border-[#C6A052] ps-2.5">
                  3. Security, Permissions & Rights
                </h3>
                <ul className="list-disc ps-5 space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <li>All traffic is encrypted over HTTPS / TLS with strict Google Firebase Firestore security rules and protected Google Drive document storage.</li>
                  <li>We never sell or rent user data, and the Android app only requests network access or manual file/photo selection when you explicitly upload a document.</li>
                  <li>You may request review or full deletion of your account and documents within 48 business hours via{' '}
                    <a
                      href="mailto:masarik.tourism@gmail.com"
                      dir="ltr"
                      style={{ unicodeBidi: 'isolate' }}
                      className="inline-block text-[#0284C7] font-bold hover:underline"
                    >
                      masarik.tourism@gmail.com
                    </a>{' '}
                    or phone{' '}
                    <a
                      href="tel:+201128440008"
                      dir="ltr"
                      style={{ unicodeBidi: 'isolate' }}
                      className="inline-block text-[#0284C7] font-bold hover:underline"
                    >
                      01128440008
                    </a>.
                  </li>
                </ul>
              </section>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
            className="text-[11px] font-bold text-[#0284C7] hover:underline"
          >
            {t('نسخة المستند الكامل للمتاجر', 'Standalone Document (/privacy.html)')}
          </a>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[110px] min-h-[40px] px-5 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black cursor-pointer transition"
          >
            {t('إغلاق', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Check,
  Clock,
  Edit3,
  FileCheck2,
  PlusCircle,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { CmsCustomItem } from '../types/travel';
import { useAdmin } from '../contexts/AdminContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  addCmsCustomItem,
  deleteCmsCustomItem,
  updateCmsCustomItem,
  useCmsState,
} from '../utils/cmsStore';
import { openWhatsApp } from '../utils/communication';
import { WhatsAppIcon } from './WhatsAppIcon';

interface CmsDynamicGridProps {
  gridId: string;
  selectedCategory?: string;
  onRequestService?: (title: string) => void;
}

export const CmsDynamicGridItems: React.FC<CmsDynamicGridProps> = ({
  gridId,
  selectedCategory = 'all',
  onRequestService,
}) => {
  const { lang, dir, t } = useLanguage();
  const { isLiveEditorMode, hasPermission } = useAdmin();
  const cmsState = useCmsState();

  const canEdit = isLiveEditorMode && hasPermission('edit_content');
  const canDelete = isLiveEditorMode && hasPermission('delete_records');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CmsCustomItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [badgeAr, setBadgeAr] = useState('');
  const [badgeEn, setBadgeEn] = useState('');
  const [priceOfferAr, setPriceOfferAr] = useState('');
  const [priceOfferEn, setPriceOfferEn] = useState('');
  const [categoryId, setCategoryId] = useState('visa-tasheel');
  const [featuresTextAr, setFeaturesTextAr] = useState('');
  const [featuresTextEn, setFeaturesTextEn] = useState('');

  const itemsForGrid = cmsState.customItems.filter((item) => {
    if (item.gridId !== gridId) return false;
    if (selectedCategory !== 'all' && item.categoryId && item.categoryId !== selectedCategory) {
      return false;
    }
    return true;
  });

  const openCreateModal = () => {
    setEditingItem(null);
    setTitleAr('');
    setTitleEn('');
    setBadgeAr('خدمة مضافة');
    setBadgeEn('Featured Offer');
    setPriceOfferAr('');
    setPriceOfferEn('');
    setCategoryId(selectedCategory !== 'all' ? selectedCategory : 'visa-tasheel');
    setFeaturesTextAr('');
    setFeaturesTextEn('');
    setModalOpen(true);
  };

  const openEditModal = (item: CmsCustomItem) => {
    setEditingItem(item);
    setTitleAr(item.titleAr);
    setTitleEn(item.titleEn);
    setBadgeAr(item.badgeAr || '');
    setBadgeEn(item.badgeEn || '');
    setPriceOfferAr(item.priceOfferAr || '');
    setPriceOfferEn(item.priceOfferEn || '');
    setCategoryId(item.categoryId || 'visa-tasheel');
    setFeaturesTextAr((item.featuresAr || []).join('\n'));
    setFeaturesTextEn((item.featuresEn || []).join('\n'));
    setModalOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleAr.trim() && !titleEn.trim()) return;

    const featuresAr = featuresTextAr
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const featuresEn = featuresTextEn
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      gridId,
      categoryId,
      titleAr: titleAr.trim() || titleEn.trim(),
      titleEn: titleEn.trim() || titleAr.trim(),
      badgeAr: badgeAr.trim(),
      badgeEn: badgeEn.trim(),
      priceOfferAr: priceOfferAr.trim(),
      priceOfferEn: priceOfferEn.trim(),
      featuresAr: featuresAr.length > 0 ? featuresAr : featuresEn,
      featuresEn: featuresEn.length > 0 ? featuresEn : featuresAr,
    };

    if (editingItem) {
      updateCmsCustomItem(editingItem.id, payload);
    } else {
      addCmsCustomItem(payload);
    }
    setModalOpen(false);
  };

  return (
    <>
      {/* Render Custom Added Service / Offer Cards */}
      {itemsForGrid.map((item) => {
        const title = lang === 'en' ? item.titleEn : item.titleAr;
        const badge = lang === 'en' ? item.badgeEn || item.badgeAr : item.badgeAr || item.badgeEn;
        const priceOffer =
          lang === 'en'
            ? item.priceOfferEn || item.priceOfferAr
            : item.priceOfferAr || item.priceOfferEn;
        const features = lang === 'en' ? item.featuresEn : item.featuresAr;

        return (
          <div
            key={item.id}
            data-admin-custom-card="true"
            className="bg-white border-2 border-[#C6A052]/55 hover:border-[#C6A052] rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative"
          >
            {/* Floating Edit / Delete controls in Live Editor mode */}
            {(canEdit || canDelete) && (
              <div
                data-admin-overlay="true"
                className="flex flex-wrap items-center justify-end gap-1.5 pb-2.5 mb-2.5 border-b border-dashed border-[#C6A052]/50"
              >
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="px-2.5 py-1 rounded-lg bg-[#0F2438] text-[#E5C887] text-[11px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{t('تعديل البند', 'Edit Item')}</span>
                  </button>
                )}

                {canDelete && (
                  confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          deleteCmsCustomItem(item.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold cursor-pointer"
                      >
                        {t('تأكيد الحذف', 'Confirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold cursor-pointer"
                      >
                        {t('إلغاء', 'Cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{t('حذف', 'Delete')}</span>
                    </button>
                  )
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#C6A052]/15 text-[#9E7B33] flex items-center justify-center shrink-0">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {priceOffer && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                      <Tag className="w-3 h-3 shrink-0" />
                      <span>{priceOffer}</span>
                    </span>
                  )}
                  {badge && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#9E7B33]">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{badge}</span>
                    </span>
                  )}
                </div>
              </div>

              <h3 className="text-[15px] sm:text-base font-black text-[#0F2438] mb-2.5 leading-snug">
                {title}
              </h3>

              {features.length > 0 && (
                <ul className="space-y-2.5 mb-5">
                  {features.map((feat, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs sm:text-[13px] text-slate-600 leading-relaxed"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-1" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="pt-3.5 border-t border-slate-100 flex items-center gap-2.5">
              {onRequestService && (
                <button
                  type="button"
                  onClick={() => onRequestService(title)}
                  className="flex-1 min-h-[44px] py-2.5 px-4 bg-[#0F2438] hover:bg-[#163B65] text-white rounded-xl text-xs sm:text-[13px] font-black flex items-center justify-center gap-1.5 shadow-xs transition active:scale-[0.98] cursor-pointer whitespace-nowrap"
                >
                  <span>{t('اطلب الخدمة الآن', 'Request Service')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  openWhatsApp(
                    lang === 'en'
                      ? `Hello Masarik Tourism, I would like to request: ${title}.`
                      : `السلام عليكم، أود طلب خدمة / عرض: ${title} من شركة مسارك للإنجاز السياحي.`
                  )
                }
                className="min-w-[44px] min-h-[44px] p-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl shadow-xs transition cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
                title={t('طلب مباشر عبر واتساب', 'Order via WhatsApp')}
              >
                <WhatsAppIcon className="w-5 h-5" variant="white" />
              </button>
            </div>
          </div>
        );
      })}

      {/* + Add New Item Button visible to Authorized Admins in Live Editor Mode */}
      {canEdit && (
        <button
          type="button"
          data-admin-grid-add="true"
          data-no-admin-edit="true"
          onClick={openCreateModal}
          className="min-h-[210px] rounded-2xl border-2 border-dashed border-[#C6A052] bg-[#C6A052]/5 hover:bg-[#C6A052]/15 text-[#0F2438] p-6 flex flex-col items-center justify-center gap-2.5 text-center transition cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#0F2438] text-[#E5C887] flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
            <PlusCircle className="w-6 h-6" />
          </div>
          <span className="text-sm font-black text-[#0F2438]">
            {t('+ إضافة بند جديد', '+ Add New Item')}
          </span>
          <span className="text-[11px] text-slate-600 max-w-[220px]">
            {t(
              'أضف خدمة جديدة، باقة تأشيرة، أو عرض سعر ليظهر فوراً للزوار',
              'Add a new service, visa package, or promotional offer card live'
            )}
          </span>
        </button>
      )}

      {/* Add / Edit Item Modal */}
      {modalOpen && (
        <div
          data-admin-overlay="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setModalOpen(false)}
        >
          <form
            onSubmit={handleSaveItem}
            onClick={(e) => e.stopPropagation()}
            dir={dir}
            className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden text-start"
          >
            <div className="bg-[#0F2438] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#C6A052] shrink-0">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4.5 h-4.5 text-[#E5C887]" />
                <h4 className="text-sm font-black">
                  {editingItem
                    ? t('تعديل الخدمة / العرض', 'Edit Custom Item')
                    : t('إضافة خدمة أو عرض سعر جديد', 'Add New Service or Offer')}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0F2438] mb-1">
                    {t('عنوان البند (عربي) *', 'Item Title (Arabic) *')}
                  </label>
                  <input
                    type="text"
                    required
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    placeholder="مثال: باقة تأشيرة العمرة السريعة"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#0F2438] mb-1">
                    {t('عنوان البند (إنجليزي)', 'Item Title (English)')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    placeholder="e.g. Express Umrah Visa Package"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    {t('السعر أو العرض (عربي)', 'Price / Offer Tag (Arabic)')}
                  </label>
                  <input
                    type="text"
                    value={priceOfferAr}
                    onChange={(e) => setPriceOfferAr(e.target.value)}
                    placeholder="مثال: عرض خاص • 950 ج.م"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    {t('السعر أو العرض (إنجليزي)', 'Price / Offer Tag (English)')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={priceOfferEn}
                    onChange={(e) => setPriceOfferEn(e.target.value)}
                    placeholder="e.g. Special • 950 EGP"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    {t('الشارة (عربي)', 'Badge (Arabic)')}
                  </label>
                  <input
                    type="text"
                    value={badgeAr}
                    onChange={(e) => setBadgeAr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    {t('التصنيف', 'Category')}
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2438]"
                  >
                    <option value="visa-tasheel">{t('التأشيرات وتساهيل', 'Visas & Tasheer')}</option>
                    <option value="documents">{t('تخليص الإجراءات والأوراق', 'Document Clearance')}</option>
                    <option value="flights">{t('حجز تذاكر الطيران', 'Flight Tickets')}</option>
                    <option value="hotels">{t('حجز الفنادق', 'Hotel Bookings')}</option>
                    <option value="enjaz">{t('منصة إنجاز والتأمين', 'Enjaz & Insurance')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#0F2438] mb-1">
                  {t('المميزات أو التفاصيل (عربي — سطر لكل نقطة)', 'Features / Bullets (Arabic — one per line)')}
                </label>
                <textarea
                  rows={3}
                  value={featuresTextAr}
                  onChange={(e) => setFeaturesTextAr(e.target.value)}
                  placeholder="إنجاز سريع خلال 24 ساعة&#10;شامل المتابعة خطوة بخطوة"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#0F2438] mb-1">
                  {t('المميزات أو التفاصيل (إنجليزي — اختياري)', 'Features / Bullets (English — optional)')}
                </label>
                <textarea
                  rows={2}
                  dir="ltr"
                  value={featuresTextEn}
                  onChange={(e) => setFeaturesTextEn(e.target.value)}
                  placeholder="Fast 24h processing&#10;Full step-by-step follow-up"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-[#0F2438]"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 cursor-pointer"
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black cursor-pointer"
              >
                {editingItem
                  ? t('تطبيق على المسودة', 'Apply to Draft')
                  : t('إضافة للمعاينة', 'Stage in Preview')}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

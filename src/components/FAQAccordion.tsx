import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { getLocalizedTravelContent } from '../data/travelData';
import { useLanguage } from '../contexts/LanguageContext';

export const FAQAccordion: React.FC = () => {
  const { lang, t } = useLanguage();
  const localized = getLocalizedTravelContent(lang);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleAccordion = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[#0F2438]/10 text-[#0F2438] flex items-center justify-center">
          <HelpCircle className="w-4.5 h-4.5 text-[#0F2438]" />
        </div>
        <div>
          <h3 className="text-base md:text-lg font-bold text-[#0F2438]">
            {t('الأسئلة الشائعة وإجاباتها', 'Frequently Asked Questions')}
          </h3>
          <p className="text-xs text-slate-500">
            {t(
              'أهم المعلومات التي تهمك حول المواعيد والمستندات وطرق الدفع',
              'Key answers about appointments, documents, and payment options'
            )}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {localized.faqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden transition-all shadow-xs"
            >
              <button
                type="button"
                onClick={() => toggleAccordion(idx)}
                className="w-full p-4 text-start flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 transition-colors"
                aria-expanded={isOpen}
              >
                <span className="text-xs sm:text-sm font-bold text-[#0F2438] leading-snug">
                  {faq.question}
                </span>
                <span
                  className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 bg-[#0F2438] text-white' : ''
                  }`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 text-xs md:text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/40">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

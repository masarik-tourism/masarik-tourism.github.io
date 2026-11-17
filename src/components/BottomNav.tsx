import React from 'react';
import { Home, Briefcase, CreditCard, PhoneCall, UserCheck } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface BottomNavProps {
  currentTab: number;
  onSelectTab: (tab: number) => void;
  onOpenTravelerProfile: () => void;
  isTravelerOpen?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenTravelerProfile,
  isTravelerOpen = false,
}) => {
  const { t } = useLanguage();

  const tabs = [
    { label: t('الرئيسية', 'Home'), icon: Home, index: 0 },
    { label: t('الخدمات', 'Services'), icon: Briefcase, index: 1 },
    { label: t('ملف المسافر', 'Profile'), icon: UserCheck, index: -1, isProfile: true },
    { label: t('طرق الدفع', 'Payments'), icon: CreditCard, index: 2 },
    { label: t('اتصل بنا', 'Contact'), icon: PhoneCall, index: 3 },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg">
      <div className="flex items-center justify-around py-1.5 px-1.5 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = tab.isProfile ? isTravelerOpen : !isTravelerOpen && currentTab === tab.index;
          return (
            <button
              key={tab.index}
              type="button"
              onClick={() => (tab.isProfile ? onOpenTravelerProfile() : onSelectTab(tab.index))}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[44px] min-w-0 ${
                isSelected
                  ? 'text-[#0F2438]'
                  : 'text-slate-500 hover:text-[#0F2438]'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isSelected
                    ? tab.isProfile
                      ? 'bg-[#C6A052]/20 text-[#0F2438]'
                      : 'bg-slate-100 text-[#0F2438]'
                    : ''
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${
                    isSelected
                      ? 'stroke-[2.5] text-[#0F2438]'
                      : tab.isProfile
                      ? 'stroke-2 text-[#9E7B33]'
                      : 'stroke-2'
                  }`}
                />
              </div>
              <span
                className={`text-[10px] min-[380px]:text-[11px] mt-0.5 leading-tight whitespace-nowrap ${
                  isSelected ? 'font-bold text-[#0F2438]' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

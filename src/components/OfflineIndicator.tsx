import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export const OfflineIndicator: React.FC = () => {
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-24 end-4 z-50 flex items-center gap-2 rounded-xl bg-[#17344F] border border-[#C6A052] px-3.5 py-2 text-xs font-bold text-white shadow-xl animate-bounce">
      <WifiOff className="w-4 h-4 text-[#E5C887]" />
      <span>
        {t('وضع عدم الاتصال — يتم عرض البيانات المخزنة', 'Offline Mode — Showing Cached Content')}
      </span>
    </div>
  );
};

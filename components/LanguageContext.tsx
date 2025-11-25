import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface LanguageContextType {
  currentLanguage: string;
  changeLanguage: (languageCode: string) => void;
  availableLanguages: { code: string; name: string; nativeName: string }[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const availableLanguages = [
  { code: 'en', name: 'English', nativeName: 'English', isRTL: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文', isRTL: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', isRTL: false },
  { code: 'fr', name: 'French', nativeName: 'Français', isRTL: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', isRTL: false },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', isRTL: false },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', isRTL: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', isRTL: true },
];

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);

  const changeLanguage = useCallback((languageCode: string) => {
    i18n.changeLanguage(languageCode);
    setCurrentLanguage(languageCode);
    localStorage.setItem('sshb-bridge-language', languageCode);
    
    // Update document direction for RTL languages
    const lang = availableLanguages.find(l => l.code === languageCode);
    if (lang) {
      document.dir = lang.isRTL ? 'rtl' : 'ltr';
    }
  }, [i18n]);

  useEffect(() => {
    const savedLanguage = localStorage.getItem('sshb-bridge-language');
    if (savedLanguage && availableLanguages.find(lang => lang.code === savedLanguage)) {
      i18n.changeLanguage(savedLanguage);
      
      // Update document direction for RTL languages
      const lang = availableLanguages.find(l => l.code === savedLanguage);
      if (lang) {
        document.dir = lang.isRTL ? 'rtl' : 'ltr';
      }
      
      // Use setTimeout to avoid setting state synchronously during render
      const timer = setTimeout(() => {
        setCurrentLanguage(savedLanguage);
      }, 0);
      
      return () => clearTimeout(timer);
    }
  }, [i18n]);

  return (
    <LanguageContext.Provider value={{
      currentLanguage,
      changeLanguage,
      availableLanguages
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { enTranslation } from './locales/en';
import { zhTranslation } from './locales/zh';
import { esTranslation } from './locales/es';
import { deTranslation } from './locales/de';
import { jaTranslation } from './locales/ja';
import { ruTranslation } from './locales/ru';
import { arTranslation } from './locales/ar';
import { frTranslation } from './locales/fr';

const resources = {
  en: enTranslation,
  zh: zhTranslation,
  es: esTranslation,
  de: deTranslation,
  ja: jaTranslation,
  ru: ruTranslation,
  ar: arTranslation,
  fr: frTranslation,
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en', // default language
  fallbackLng: 'en',

  interpolation: {
    escapeValue: false, // React already escapes by default
  },
});

export default i18n;

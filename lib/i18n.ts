import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { enTranslation } from './locales/en.js';
import { zhTranslation } from './locales/zh.js';
import { esTranslation } from './locales/es.js';
import { deTranslation } from './locales/de.js';
import { jaTranslation } from './locales/ja.js';
import { ruTranslation } from './locales/ru.js';
import { arTranslation } from './locales/ar.js';
import { frTranslation } from './locales/fr.js';

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

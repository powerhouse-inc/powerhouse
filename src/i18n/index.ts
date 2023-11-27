import i18n, { Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationEN from './locales/en.json';

const resources: Resource = {
    en: {
        code: 'en',
        name: 'English',
        translation: translationEN,
    },
};

i18n.use(initReactI18next).init({
    resources,
    fallbackLng: 'en',
    debug: true,
    interpolation: {
        escapeValue: false,
    },
});

export default i18n;

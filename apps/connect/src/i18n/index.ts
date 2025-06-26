import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationEN from './locales/en.json' with { type: 'json' };

const resources: Resource = {
    en: {
        code: 'en',
        name: 'English',
        translation: translationEN,
    },
};

i18n.use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        debug: false,
        interpolation: {
            escapeValue: false,
        },
    })
    .catch((e: unknown) => {
        console.error(e);
    });

export default i18n;

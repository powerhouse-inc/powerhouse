import { createThemes } from 'tw-colors';

/** @type {import('tailwindcss').Config} */
module.exports = {
    corePlugins: {
        preflight: false,
    },
    mode: 'jit',
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                neutral: {
                    1: 'rgba(var(--color-neutral-1))',
                    2: 'rgba(var(--color-neutral-2))',
                    3: 'rgba(var(--color-neutral-3))',
                    4: 'rgba(var(--color-neutral-4))',
                    6: 'rgba(var(--color-neutral-6))',
                    7: 'var(--color-neutral-7)',
                },
            },
            backgroundImage: {
                selected:
                    'linear-gradient(270deg, #323337 50%, rgba(80, 62, 110, 0.29) 100%)',
                'selected-light':
                    'linear-gradient(270deg, #fefefe 50%, rgba(255, 255, 255, 0.29) 100%)',
            },
            boxShadow: {
                button: '0px 2px 4px 0px rgba(0, 0, 0, 0.15)',
            },
        },
    },
    plugins: [
        createThemes({
            dark: {
                text: '#fefefe',
                bg: '#141718',
                light: '#1A1D1F',
                accent: {
                    1: '#1F2022',
                    2: '#191A1D',
                    3: '#232627',
                    4: '#404446',
                    5: '#6F767E',
                },
                titlebar: '#0A0A0A',
            },
            light: {
                text: '#141718',
                bg: '#FFFFFF',
                light: '#F8FAFC',
                accent: {
                    1: '#fefefe',
                    2: '#f3f5f7',
                    3: '#F1F5F9',
                    5: '#94A3B8',
                },
                titlebar: '#F1F1F1',
            },
        }),
    ],
};

import { createThemes } from 'tw-colors';

/** @type {import('tailwindcss').Config} */
module.exports = {
    mode: 'jit',
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                neutral: {
                    3: 'rgba(var(--color-neutral-3))',
                    4: 'rgba(var(--color-neutral-4))',
                    6: 'rgba(var(--color-neutral-6))',
                    7: 'var(--color-neutral-7)',
                },
            },
            backgroundImage: {
                selected:
                    'linear-gradient(270deg, #323337 50%, rgba(80, 62, 110, 0.29) 100%)',
            },
        },
    },
    plugins: [
        createThemes({
            dark: {
                text: '#fefefe',
                bg: '#141718',
                light: '#1F2022',
                accent: {
                    1: '#1F2022',
                    2: '#191A1D',
                },
            },
            light: {
                text: '#141718',
                bg: '#fefefe',
                light: '#f3f5f7',
                accent: {
                    1: '#fefefe',
                    2: '#f3f5f7',
                },
            },
        }),
    ],
};

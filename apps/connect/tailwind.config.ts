import type { Config } from 'tailwindcss';

const config = {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            height: {
                'app-height': 'var(--app-height)',
            },
            maxWidth: {
                'search-bar-width': 'var(--search-bar-width)',
            },
            boxShadow: {
                button: 'var(--shadow-button)',
            },
        },
    },
} satisfies Config;

export default config;

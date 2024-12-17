import { designSystemPreset } from '@powerhousedao/config';
import type { Config } from 'tailwindcss';

const config = {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    presets: [designSystemPreset],
    theme: {
        extend: {
            height: {
                'app-height': 'var(--app-height)',
            },
            maxWidth: {
                'search-bar-width': 'var(--search-bar-width)',
            },
            boxShadow: {
                button: '0px 2px 4px 0px rgba(0, 0, 0, 0.15)',
            },
        },
    },
} satisfies Config;

export default config;

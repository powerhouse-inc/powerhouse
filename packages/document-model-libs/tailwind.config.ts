import { designSystemPreset } from '@powerhousedao/design-system';
import type { Config } from 'tailwindcss';

const config: Config = {
    important: '#document-editor-context',
    content: [
        './editors/**/*.{html,js,ts,tsx}',
        '.storybook/**/*.{html,js,ts,tsx}',
    ],
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
};

export default config;

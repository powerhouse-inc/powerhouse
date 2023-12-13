import { plugins, theme } from '@powerhousedao/design-system';
import type { Config } from 'tailwindcss';

module.exports = {
    mode: 'jit',
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    corePlugins: {
        preflight: false,
    },
    presets: [theme, plugins],
    theme: {
        extend: {
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
} satisfies Config;

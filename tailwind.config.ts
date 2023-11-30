import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import reactAriaComponents from 'tailwindcss-react-aria-components';
// @ts-expect-error this is only used in legacy components and can be removed. it does not have a types file
import themeSwapper from 'tailwindcss-theme-swapper';
import plugin from 'tailwindcss/plugin';

const config = {
    content: [
        './src/**/*.{html,js,ts,tsx}',
        '.storybook/**/*.{html,js,ts,tsx}',
    ],
    theme: {
        extend: {
            keyframes: {
                'fade-in': {
                    '0%': { opacity: '0%' },
                    '100%': { opacity: '100%' },
                },
                'fade-out': {
                    '0%': { opacity: '100%' },
                    '100%': { opacity: '0%' },
                },
                'zoom-in': {
                    '0%': { transform: 'scale(0.95)' },
                    '100%': { transform: 'scale(1)' },
                },
                'zoom-out': {
                    '0%': { transform: 'scale(1)' },
                    '100%': { transform: 'scale(0.95)' },
                },
            },
            animation: {
                'fade-in': 'fade-in 300ms ease-in',
                'fade-out': 'fade-out 200ms ease-out',
                'zoom-in': 'zoom-in 300ms ease-in',
                'zoom-out': 'zoom-out 200ms ease-out',
            },
        },
    },
    colors: {
        'slate-900': 'hsl(var(--color-slate-900) / <alpha-value>)',
    },
    plugins: [
        animate,
        reactAriaComponents(),
        // todo: theme swapper is only used in legacy components and can be removed
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        themeSwapper({
            themes: [
                {
                    name: 'base',
                    selectors: ['[data-theme="ph-light"]'],
                    theme: {
                        colors: {
                            neutral: {
                                1: '#FCFCFC',
                                3: '#EFEFEF',
                                4: '#6C7275',
                            },
                            bg: '#F4F4F4',
                        },
                    },
                },
                {
                    name: 'dark',
                    selectors: ['[data-theme="ph-dark"]'],
                    theme: {
                        colors: {
                            bg: '#141718',
                        },
                    },
                },
            ],
        }),
        plugin(function ({ addVariant }) {
            addVariant('collapsed', ':merge(.group).collapsed &');
            addVariant('collapsing', ':merge(.group).collapsing &');
            addVariant('expanded', ':merge(.group).expanded &');
            addVariant('expanding', ':merge(.group).expanding &');
        }),
    ],
} satisfies Config;

export default config;

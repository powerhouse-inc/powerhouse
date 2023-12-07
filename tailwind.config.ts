import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
// @ts-expect-error this is only used in legacy components and can be removed. it does not have a types file
import themeSwapper from 'tailwindcss-theme-swapper';
import defaultTheme from 'tailwindcss/defaultTheme';
import plugin from 'tailwindcss/plugin';

const config = {
    content: [
        './src/**/*.{html,js,ts,tsx}',
        '.storybook/**/*.{html,js,ts,tsx}',
    ],
    theme: {
        fontFamily: {
            sans: ['Inter', ...defaultTheme.fontFamily.sans],
        },
        fontSize: {
            ...defaultTheme.fontSize,
            xs: ['0.75rem', '1.125rem'],
            sm: ['0.875rem', '1.5rem'],
            base: ['1rem', '1.5rem'],
            lg: ['1.125rem', '1.75rem'],
            xl: ['1.25rem', '1.875rem'],
            '2xl': ['1.5rem', '2.25rem'],
            '3xl': ['2rem', '3rem'],
            '4xl': ['2.5rem', '4rem'],
            '5xl': ['4rem', '5rem'],
        },
        colors: {
            ...defaultTheme.colors,
            transparent: 'transparent',
            white: 'hsl(var(--color-white) / <alpha-value>)',
            black: 'hsl(var(--color-black) / <alpha-value>)',
            'gray-50': 'hsl(var(--color-gray-50) / <alpha-value>)',
            'gray-100': 'hsl(var(--color-gray-100) / <alpha-value>)',
            'gray-200': 'hsl(var(--color-gray-200) / <alpha-value>)',
            'gray-300': 'hsl(var(--color-gray-300) / <alpha-value>)',
            'gray-400': 'hsl(var(--color-gray-400) / <alpha-value>)',
            'gray-500': 'hsl(var(--color-gray-500) / <alpha-value>)',
            'gray-600': 'hsl(var(--color-gray-600) / <alpha-value>)',
            'gray-700': 'hsl(var(--color-gray-700) / <alpha-value>)',
            'gray-800': 'hsl(var(--color-gray-800) / <alpha-value>)',
            'gray-900': 'hsl(var(--color-gray-900) / <alpha-value>)',
            'slate-50': 'hsl(var(--color-slate-50) / <alpha-value>)',
            'slate-100': 'hsl(var(--color-slate-100) / <alpha-value>)',
            'slate-200': 'hsl(var(--color-slate-200) / <alpha-value>)',
            'slate-300': 'hsl(var(--color-slate-300) / <alpha-value>)',
            'slate-400': 'hsl(var(--color-slate-400) / <alpha-value>)',
            'slate-500': 'hsl(var(--color-slate-500) / <alpha-value>)',
            'slate-600': 'hsl(var(--color-slate-600) / <alpha-value>)',
            'slate-700': 'hsl(var(--color-slate-700) / <alpha-value>)',
            'slate-800': 'hsl(var(--color-slate-800) / <alpha-value>)',
            'slate-900': 'hsl(var(--color-slate-900) / <alpha-value>)',
            'slate-950': 'hsl(var(--color-slate-950) / <alpha-value>)',
            'blue-100': 'hsl(var(--color-blue-100) / <alpha-value>)',
            'blue-200': 'hsl(var(--color-blue-200) / <alpha-value>)',
            'blue-300': 'hsl(var(--color-blue-300) / <alpha-value>)',
            'blue-400': 'hsl(var(--color-blue-400) / <alpha-value>)',
            'blue-500': 'hsl(var(--color-blue-500) / <alpha-value>)',
            'blue-600': 'hsl(var(--color-blue-600) / <alpha-value>)',
            'blue-700': 'hsl(var(--color-blue-700) / <alpha-value>)',
            'blue-800': 'hsl(var(--color-blue-800) / <alpha-value>)',
            'blue-900': 'hsl(var(--color-blue-900) / <alpha-value>)',
            'green-100': 'hsl(var(--color-green-100) / <alpha-value>)',
            'green-200': 'hsl(var(--color-green-200) / <alpha-value>)',
            'green-300': 'hsl(var(--color-green-300) / <alpha-value>)',
            'green-400': 'hsl(var(--color-green-400) / <alpha-value>)',
            'green-500': 'hsl(var(--color-green-500) / <alpha-value>)',
            'green-600': 'hsl(var(--color-green-600) / <alpha-value>)',
            'green-700': 'hsl(var(--color-green-700) / <alpha-value>)',
            'green-800': 'hsl(var(--color-green-800) / <alpha-value>)',
            'green-900': 'hsl(var(--color-green-900) / <alpha-value>)',
            'purple-100': 'hsl(var(--color-purple-100) / <alpha-value>)',
            'purple-200': 'hsl(var(--color-purple-200) / <alpha-value>)',
            'purple-300': 'hsl(var(--color-purple-300) / <alpha-value>)',
            'purple-400': 'hsl(var(--color-purple-400) / <alpha-value>)',
            'purple-500': 'hsl(var(--color-purple-500) / <alpha-value>)',
            'purple-600': 'hsl(var(--color-purple-600) / <alpha-value>)',
            'purple-700': 'hsl(var(--color-purple-700) / <alpha-value>)',
            'purple-800': 'hsl(var(--color-purple-800) / <alpha-value>)',
            'purple-900': 'hsl(var(--color-purple-900) / <alpha-value>)',
            'red-100': 'hsl(var(--color-red-100) / <alpha-value>)',
            'red-200': 'hsl(var(--color-red-200) / <alpha-value>)',
            'red-300': 'hsl(var(--color-red-300) / <alpha-value>)',
            'red-400': 'hsl(var(--color-red-400) / <alpha-value>)',
            'red-500': 'hsl(var(--color-red-500) / <alpha-value>)',
            'red-600': 'hsl(var(--color-red-600) / <alpha-value>)',
            'red-700': 'hsl(var(--color-red-700) / <alpha-value>)',
            'red-800': 'hsl(var(--color-red-800) / <alpha-value>)',
            'red-900': 'hsl(var(--color-red-900) / <alpha-value>)',
        },
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
    plugins: [
        animate,
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

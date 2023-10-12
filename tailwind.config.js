/** @type {import('tailwindcss').Config} */
const themeSwapper = require('tailwindcss-theme-swapper');

module.exports = {
    content: [
        './src/**/*.{html,js,ts,tsx}',
        '.storybook/**/*.{html,js,ts,tsx}',
    ],
    theme: {
        extend: {},
    },
    plugins: [
        themeSwapper({
            themes: [
                {
                    name: 'base',
                    selectors: [':root'],
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
                    selectors: ['[data-theme="dark"]'],
                    theme: {
                        colors: {
                            bg: '#141718',
                        },
                    },
                },
            ],
        }),
    ],
};

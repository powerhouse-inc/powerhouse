/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                bg: '#141718',
                light: '#1F2022',
            },
        },
    },
    plugins: [],
};

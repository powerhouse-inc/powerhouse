/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                action: "#0084FF",
                bg: "#F8FAFC",
                link: "#3E90F0",
                red: "#EA4335",
                neutral: {
                    2: "#F3F5F7",
                    "2-light": "#F1F5F9",
                    4: "#6F767E",
                    "4-light": "#7C878E",
                    "5-light": "#393E44",
                },
            },
            boxShadow: {
                button: "0px 4px 12px 0px rgba(0, 0, 0, 0.10)",
                modal: "0px 0px 24px 4px rgba(0, 0, 0, 0.05), 0px 44px 48px -12px rgba(0, 0, 0, 0.15), 0px 2px 8px 0px rgba(0, 0, 0, 0.05)",
            },
        },
    },
    plugins: [],
};

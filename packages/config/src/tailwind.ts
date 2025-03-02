import scrollbar from "tailwind-scrollbar";
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import defaultTheme from "tailwindcss/defaultTheme.js";
import plugin from "tailwindcss/plugin.js";

const theme = {
  extend: {
    fontFamily: {
      sans: ["Inter", ...defaultTheme.fontFamily.sans],
    },
    fontSize: {
      xs: ["0.75rem", "1.125rem"],
      sm: ["0.875rem", "1.5rem"],
      base: ["1rem", "1.5rem"],
      lg: ["1.125rem", "1.75rem"],
      xl: ["1.25rem", "1.875rem"],
      "2xl": ["1.5rem", "2.25rem"],
      "3xl": ["2rem", "3rem"],
      "4xl": ["2.5rem", "4rem"],
      "5xl": ["4rem", "5rem"],
    },
    colors: {
      transparent: "transparent",
      inherit: "inherit",
      white: "hsl(var(--color-white) / <alpha-value>)",
      black: "hsl(var(--color-black) / <alpha-value>)",
      "gray-50": "hsl(var(--color-gray-50) / <alpha-value>)",
      "gray-100": "hsl(var(--color-gray-100) / <alpha-value>)",
      "gray-200": "hsl(var(--color-gray-200) / <alpha-value>)",
      "gray-300": "hsl(var(--color-gray-300) / <alpha-value>)",
      "gray-400": "hsl(var(--color-gray-400) / <alpha-value>)",
      "gray-500": "hsl(var(--color-gray-500) / <alpha-value>)",
      "gray-600": "hsl(var(--color-gray-600) / <alpha-value>)",
      "gray-700": "hsl(var(--color-gray-700) / <alpha-value>)",
      "gray-800": "hsl(var(--color-gray-800) / <alpha-value>)",
      "gray-900": "hsl(var(--color-gray-900) / <alpha-value>)",
      "slate-50": "hsl(var(--color-slate-50) / <alpha-value>)",
      "slate-100": "hsl(var(--color-slate-100) / <alpha-value>)",
      "slate-200": "hsl(var(--color-slate-200) / <alpha-value>)",
      "slate-300": "hsl(var(--color-slate-300) / <alpha-value>)",
      "slate-400": "hsl(var(--color-slate-400) / <alpha-value>)",
      "slate-500": "hsl(var(--color-slate-500) / <alpha-value>)",
      "slate-600": "hsl(var(--color-slate-600) / <alpha-value>)",
      "slate-700": "hsl(var(--color-slate-700) / <alpha-value>)",
      "slate-800": "hsl(var(--color-slate-800) / <alpha-value>)",
      "slate-900": "hsl(var(--color-slate-900) / <alpha-value>)",
      "slate-950": "hsl(var(--color-slate-950) / <alpha-value>)",
      "blue-100": "hsl(var(--color-blue-100) / <alpha-value>)",
      "blue-200": "hsl(var(--color-blue-200) / <alpha-value>)",
      "blue-300": "hsl(var(--color-blue-300) / <alpha-value>)",
      "blue-400": "hsl(var(--color-blue-400) / <alpha-value>)",
      "blue-500": "hsl(var(--color-blue-500) / <alpha-value>)",
      "blue-600": "hsl(var(--color-blue-600) / <alpha-value>)",
      "blue-700": "hsl(var(--color-blue-700) / <alpha-value>)",
      "blue-800": "hsl(var(--color-blue-800) / <alpha-value>)",
      "blue-900": "hsl(var(--color-blue-900) / <alpha-value>)",
      "green-100": "hsl(var(--color-green-100) / <alpha-value>)",
      "green-200": "hsl(var(--color-green-200) / <alpha-value>)",
      "green-300": "hsl(var(--color-green-300) / <alpha-value>)",
      "green-400": "hsl(var(--color-green-400) / <alpha-value>)",
      "green-500": "hsl(var(--color-green-500) / <alpha-value>)",
      "green-600": "hsl(var(--color-green-600) / <alpha-value>)",
      "green-700": "hsl(var(--color-green-700) / <alpha-value>)",
      "green-800": "hsl(var(--color-green-800) / <alpha-value>)",
      "green-900": "hsl(var(--color-green-900) / <alpha-value>)",
      "purple-100": "hsl(var(--color-purple-100) / <alpha-value>)",
      "purple-200": "hsl(var(--color-purple-200) / <alpha-value>)",
      "purple-300": "hsl(var(--color-purple-300) / <alpha-value>)",
      "purple-400": "hsl(var(--color-purple-400) / <alpha-value>)",
      "purple-500": "hsl(var(--color-purple-500) / <alpha-value>)",
      "purple-600": "hsl(var(--color-purple-600) / <alpha-value>)",
      "purple-700": "hsl(var(--color-purple-700) / <alpha-value>)",
      "purple-800": "hsl(var(--color-purple-800) / <alpha-value>)",
      "purple-900": "hsl(var(--color-purple-900) / <alpha-value>)",
      "red-100": "hsl(var(--color-red-100) / <alpha-value>)",
      "red-200": "hsl(var(--color-red-200) / <alpha-value>)",
      "red-300": "hsl(var(--color-red-300) / <alpha-value>)",
      "red-400": "hsl(var(--color-red-400) / <alpha-value>)",
      "red-500": "hsl(var(--color-red-500) / <alpha-value>)",
      "red-600": "hsl(var(--color-red-600) / <alpha-value>)",
      "red-700": "hsl(var(--color-red-700) / <alpha-value>)",
      "red-800": "hsl(var(--color-red-800) / <alpha-value>)",
      "red-900": "hsl(var(--color-red-900) / <alpha-value>)",
      "orange-100": "hsl(var(--color-orange-100) / <alpha-value>)",
      "orange-200": "hsl(var(--color-orange-200) / <alpha-value>)",
      "orange-300": "hsl(var(--color-orange-300) / <alpha-value>)",
      "orange-400": "hsl(var(--color-orange-400) / <alpha-value>)",
      "orange-500": "hsl(var(--color-orange-500) / <alpha-value>)",
      "orange-600": "hsl(var(--color-orange-600) / <alpha-value>)",
      "orange-700": "hsl(var(--color-orange-700) / <alpha-value>)",
      "orange-800": "hsl(var(--color-orange-800) / <alpha-value>)",
      "orange-900": "hsl(var(--color-orange-900) / <alpha-value>)",
      "yellow-100": "hsl(var(--color-yellow-100) / <alpha-value>)",
      "yellow-200": "hsl(var(--color-yellow-200) / <alpha-value>)",
      "yellow-300": "hsl(var(--color-yellow-300) / <alpha-value>)",
      "yellow-400": "hsl(var(--color-yellow-400) / <alpha-value>)",
      "yellow-500": "hsl(var(--color-yellow-500) / <alpha-value>)",
      "yellow-600": "hsl(var(--color-yellow-600) / <alpha-value>)",
      "yellow-700": "hsl(var(--color-yellow-700) / <alpha-value>)",
      "yellow-800": "hsl(var(--color-yellow-800) / <alpha-value>)",
      "yellow-900": "hsl(var(--color-yellow-900) / <alpha-value>)",
      "charcoal-100": "hsl(var(--color-charcoal-100) / <alpha-value>)",
      "charcoal-200": "hsl(var(--color-charcoal-200) / <alpha-value>)",
      "charcoal-300": "hsl(var(--color-charcoal-300) / <alpha-value>)",
      "charcoal-400": "hsl(var(--color-charcoal-400) / <alpha-value>)",
      "charcoal-500": "hsl(var(--color-charcoal-500) / <alpha-value>)",
      "charcoal-600": "hsl(var(--color-charcoal-600) / <alpha-value>)",
      "charcoal-700": "hsl(var(--color-charcoal-700) / <alpha-value>)",
      "charcoal-800": "hsl(var(--color-charcoal-800) / <alpha-value>)",
      "charcoal-900": "hsl(var(--color-charcoal-900) / <alpha-value>)",
    },
    boxShadow: {
      sidebar: "var(--shadow-sidebar)",
      tooltip: "var(--shadow-tooltip)",
      button: "var(--shadow-button)",
      DEFAULT:
        "0px 4px 8px -4px rgba(0, 0, 0, 0.02), 0px -1px 1px 0px rgba(0, 0, 0, 0.04) inset",
    },
    gridTemplateColumns: {
      "form-columns": "max-content auto",
    },
    keyframes: {
      "fade-in": {
        "0%": { opacity: "0%" },
        "100%": { opacity: "100%" },
      },
      "fade-out": {
        "0%": { opacity: "100%" },
        "100%": { opacity: "0%" },
      },
      "zoom-in": {
        "0%": { transform: "scale(0.95)" },
        "100%": { transform: "scale(1)" },
      },
      "zoom-out": {
        "0%": { transform: "scale(1)" },
        "100%": { transform: "scale(0.95)" },
      },
    },
    animation: {
      "fade-in": "fade-in 300ms ease-in",
      "fade-out": "fade-out 200ms ease-out",
      "zoom-in": "zoom-in 300ms ease-in",
      "zoom-out": "zoom-out 200ms ease-out",
    },
  },
} satisfies Config["theme"];

const plugins = [
  animate,
  scrollbar({ nocompatible: true }),
  plugin(function ({ addVariant }) {
    addVariant("collapsed", ":merge(.group).collapsed &");
    addVariant("collapsing", ":merge(.group).collapsing &");
    addVariant("expanded", ":merge(.group).expanded &");
    addVariant("expanding", ":merge(.group).expanding &");
  }),
] satisfies Config["plugins"];

export const designSystemPreset = {
  theme,
  plugins,
};

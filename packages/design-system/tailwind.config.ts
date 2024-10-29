import type { Config } from "tailwindcss";
import { designSystemPreset } from "./src/shared-tailwind.config";

const config = {
  darkMode: ["class", '[data-mode="dark"]'],
  content: ["./src/**/*.{html,js,ts,tsx}", ".storybook/**/*.{html,js,ts,tsx}"],
  theme: designSystemPreset.theme,
  plugins: designSystemPreset.plugins,
} satisfies Config;

export default config;

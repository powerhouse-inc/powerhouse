import { designSystemPreset } from "@powerhousedao/config/tailwind";
import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class", '[data-mode="dark"]'],
  content: ["./src/**/*.{html,js,ts,tsx}", ".storybook/**/*.{html,js,ts,tsx}"],
  theme: designSystemPreset.theme,
  plugins: designSystemPreset.plugins,
} satisfies Config;
export default config;

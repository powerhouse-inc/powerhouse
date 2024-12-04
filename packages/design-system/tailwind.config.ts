import type { Config } from "tailwindcss";
import { designSystemPreset } from "../../shared-tailwind.config";

const config = {
  content: ["./src/**/*.{html,js,ts,tsx}", ".storybook/**/*.{html,js,ts,tsx}"],
  theme: designSystemPreset.theme,
  plugins: designSystemPreset.plugins,
} satisfies Config;

export default config;

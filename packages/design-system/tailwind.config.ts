import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class", '[data-mode="dark"]'],
} satisfies Config;
export default config;

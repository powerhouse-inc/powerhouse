import { join } from "node:path";
import { designSystemPreset } from "@powerhousedao/config";
import { editorsDir } from "./powerhouse.config.json";

/** @type {import('tailwindcss').Config} */
export default {
    content: [join(editorsDir, "**/*.{js,jsx,ts,tsx}")],
    presets: [designSystemPreset],
    theme: {
        extend: {},
    },
    plugins: [],
};

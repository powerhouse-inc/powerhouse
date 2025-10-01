import type { StorybookConfig } from "@storybook/react-vite";
const config: StorybookConfig = {
  stories: [`../editors/**/*.stories.tsx`],
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "./addons/operations-preset.ts",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  viteFinal: async (config) => {
    const { mergeConfig } = await import("vite");
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    const { nodePolyfills } = await import("vite-plugin-node-polyfills");
    return mergeConfig(config, {
      plugins: [
        nodePolyfills({
          include: ["events"],
          globals: {
            Buffer: false,
            global: false,
            process: true,
          },
        }),
        tailwindcss(),
      ],
    });
  },
};
export default config;

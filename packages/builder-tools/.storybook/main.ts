import type { StorybookConfig } from "@storybook/react-vite";
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const config: StorybookConfig = {
  stories: [`../**/*.stories.tsx`],
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
  typescript: {
    reactDocgen: false,
  },
   viteFinal: async (config) => {
    const { mergeConfig } = await import('vite');

    return mergeConfig(config, {
      plugins: [nodePolyfills({
        protocolImports: true
      })],
    });
  },
};
export default config;

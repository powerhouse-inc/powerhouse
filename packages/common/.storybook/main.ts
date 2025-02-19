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
  typescript: {
    reactDocgen: false,
  },
  core: {
    builder: {
      name: "@storybook/builder-vite",
      options: {
        viteConfigPath: "vite.config.ts",
        rollupOptions: {
          external: [
            /@codemirror\/.*/,
            'thememirror',
            'cm6-graphql'
          ]
        }
      }
    }
  }
};
export default config;

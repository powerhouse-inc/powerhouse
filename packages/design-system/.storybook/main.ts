import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx|)"],
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@storybook/addon-themes",
    "storybook-addon-pseudo-states",
    "@storybook/addon-docs",
    "@chromatic-com/storybook"
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
  typescript: {
    reactDocgen: false,
  },
  docs: {
    autodocs: 'tag',
    defaultName: '_Readme'
  },
  viteFinal(config) {
    return {
      ...config,
      plugins: config.plugins?.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        (plugin) => !["vite:dts"].includes((plugin as any)?.name),
      ),
    };
  },
};
export default config;

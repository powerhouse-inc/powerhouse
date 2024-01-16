import type { StorybookConfig } from '@storybook/react-vite';
import { getConfig } from '@powerhousedao/codegen';

const { editorsDir } = getConfig();

const config: StorybookConfig = {
    stories: [`../${editorsDir}/**/*.stories.@(js|jsx|mjs|ts|tsx)`],
    addons: [
        '@storybook/addon-links',
        '@storybook/addon-essentials',
        '@storybook/addon-interactions',
        './addons/operations-preset.ts',
    ],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    docs: {
        autodocs: 'tag',
    },
};
export default config;

import { getConfig } from '@powerhousedao/codegen';
import type { StorybookConfig } from '@storybook/react-vite';
import { InlineConfig, mergeConfig } from 'vite';

const { editorsDir } = getConfig();

const config: StorybookConfig = {
    stories: [`../${editorsDir}/**/*.stories.tsx`],
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

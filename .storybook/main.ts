import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
    stories: ['../**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    addons: [
        '@storybook/addon-links',
        '@storybook/addon-essentials',
        '@storybook/addon-onboarding',
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
    async viteFinal(config, options) {
        return mergeConfig(config, {
            resolve: {
                alias: {
                    'document-model/document':
                        'document-model/browser/document',
                },
            },
        });
    },
};
export default config;

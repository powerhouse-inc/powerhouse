import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    addons: [
        '@storybook/addon-links',
        '@storybook/addon-essentials',
        '@storybook/addon-interactions',
        '@storybook/addon-themes',
        'storybook-addon-pseudo-states',
    ],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    staticDirs: ['../public'],
    typescript: {
        reactDocgen: false,
    },
    docs: {
        autodocs: 'tag',
    },
    async viteFinal(config) {
        return {
            ...config,
            plugins: config.plugins?.filter(
                plugin => !['vite:dts'].includes((plugin as any)?.name),
            ),
        };
    },
};
export default config;

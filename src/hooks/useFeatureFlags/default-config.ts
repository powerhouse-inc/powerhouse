export const FEATURE_FLAG_KEY_STORAGE = 'feature-flags-config';

export interface FeatureFlag {
    editors: {
        enabledEditors?: string | string[];
        disabledEditors?: string | string[];
    };
}

const defaultConfig: FeatureFlag = {
    editors: {
        enabledEditors: ['powerhouse/real-world-assets'],
        disabledEditors: undefined,
    },
};

export default defaultConfig;

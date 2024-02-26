export const FEATURE_FLAG_KEY_STORAGE = 'feature-flags-config';

const ENABLED_EDITORS = import.meta.env.VITE_ENABLED_EDITORS || undefined;
const enabledEditors = ENABLED_EDITORS?.split(',');

const DISABLED_EDITORS = import.meta.env.VITE_DISABLED_EDITORS || undefined;
const disabledEditors = DISABLED_EDITORS?.split(',');

export interface FeatureFlag {
    editors: {
        enabledEditors?: '*' | string[];
        disabledEditors?: '*' | string[];
    };
}

const defaultConfig: FeatureFlag = {
    editors: {
        enabledEditors: ENABLED_EDITORS === '*' ? '*' : enabledEditors,
        disabledEditors: DISABLED_EDITORS === '*' ? '*' : disabledEditors,
    },
};

export default defaultConfig;

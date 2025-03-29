import { atomWithStorage } from '#store';
import defaultConfig, {
    FEATURE_FLAG_KEY_STORAGE,
    type FeatureFlag,
} from './default-config.js';

export const featureFlagAtom = atomWithStorage<FeatureFlag>(
    FEATURE_FLAG_KEY_STORAGE,
    defaultConfig,
);

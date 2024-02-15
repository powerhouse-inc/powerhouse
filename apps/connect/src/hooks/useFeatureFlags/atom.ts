import { atomWithStorage } from 'jotai/utils';
import defaultConfig, {
    FEATURE_FLAG_KEY_STORAGE,
    FeatureFlag,
} from './default-config';

export const featureFlagAtom = atomWithStorage<FeatureFlag>(
    FEATURE_FLAG_KEY_STORAGE,
    defaultConfig,
);

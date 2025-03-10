import { atomWithStorage } from '#store/utils';
import defaultConfig, {
    FEATURE_FLAG_KEY_STORAGE,
    type FeatureFlag,
} from './default-config';

export const featureFlagAtom = atomWithStorage<FeatureFlag>(
    FEATURE_FLAG_KEY_STORAGE,
    defaultConfig,
);

import { useAtom } from 'jotai';
import { featureFlagAtom } from './atom.js';
import defaultConfig from './default-config.js';

export const useFeatureFlag = () => {
    const [config, setConfig] = useAtom(featureFlagAtom);

    return {
        config: {
            ...defaultConfig,
            ...config,
        },
        setConfig,
    };
};

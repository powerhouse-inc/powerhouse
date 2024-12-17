import { useAtom } from 'jotai';
import { featureFlagAtom } from './atom';
import defaultConfig from './default-config';

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

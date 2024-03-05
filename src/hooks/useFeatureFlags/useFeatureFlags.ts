import { useAtom } from 'jotai';
import { featureFlagAtom } from './atom';

export const useFeatureFlag = () => {
    const [config, setConfig] = useAtom(featureFlagAtom);

    return {
        config,
        setConfig,
    };
};

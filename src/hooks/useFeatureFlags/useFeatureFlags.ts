import { useAtom } from 'jotai';
import { featureFlagAtom } from './atom';
import { FeatureFlag } from './default-config';

type SetConfig = (
    updater: (state: FeatureFlag) => Partial<FeatureFlag>,
) => void;

export const useFeatureFlag = () => {
    const [config, setConfig] = useAtom(featureFlagAtom);

    const setConfigHandler: SetConfig = updater => {
        setConfig(prev => {
            const newState = updater(prev);

            return {
                ...prev,
                ...newState,
            };
        });
    };

    return {
        config,
        setConfig: setConfigHandler,
    };
};

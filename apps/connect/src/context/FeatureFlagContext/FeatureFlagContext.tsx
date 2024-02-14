import React, { createContext } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import defaultConfig, {
    FEATURE_FLAG_KEY_STORAGE,
    FeatureFlag,
} from './default-config';

export interface FeatureFlagContextValue {
    config: FeatureFlag;
    setConfig: (updater: (state: FeatureFlag) => Partial<FeatureFlag>) => void;
}

const defaultFeatureFlagContextValue: FeatureFlagContextValue = {
    config: defaultConfig,
    setConfig: () => ({}),
};

const FeatureFlagContext = createContext<FeatureFlagContextValue>(
    defaultFeatureFlagContextValue,
);

export interface FeatureFlagContextProviderProps {
    children: React.ReactNode;
}

export const FeatureFlagContextProvider: React.FC<
    FeatureFlagContextProviderProps
> = ({ children }) => {
    const [flags, setFlags] = useLocalStorage(
        FEATURE_FLAG_KEY_STORAGE,
        defaultConfig,
    );

    const setConfig: FeatureFlagContextValue['setConfig'] = updater => {
        setFlags(prev => {
            const newState = updater(prev);

            return {
                ...prev,
                ...newState,
            };
        });
    };

    return (
        <FeatureFlagContext.Provider
            value={{
                config: flags,
                setConfig,
            }}
        >
            {children}
        </FeatureFlagContext.Provider>
    );
};

export const useFeatureFlag = () => React.useContext(FeatureFlagContext);

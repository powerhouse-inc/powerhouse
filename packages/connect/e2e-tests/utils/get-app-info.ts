import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';

export const getAppInfo = () => {
    const latestBuild = findLatestBuild();
    return parseElectronApp(latestBuild);
};

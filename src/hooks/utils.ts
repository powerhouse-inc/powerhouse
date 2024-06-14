import { version as currentVersion } from '../../package.json';
export const isElectron = window.navigator.userAgent.includes('Electron');

export const isMac = window.navigator.appVersion.includes('Mac');

const urlBranchMap: Record<string, string> = {
    'alpha/makerdao': 'deployments/staging/makerdao',
    'alpha/arbitrum': 'arb-ltip',
    'alpha/powerhouse': 'staging',
    makerdao: 'deployments/makerdao',
    arbitrum: 'deployments/arbitrum',
    localhost: 'develop',
};

const getGithubLinkFromUrl = () => {
    const githubLink =
        'https://raw.githubusercontent.com/powerhouse-inc/connect';
    const url = window.URL.toString();

    for (const entry of Object.keys(urlBranchMap)) {
        if (url.includes(entry)) {
            const value = urlBranchMap[entry];
            return `${githubLink}/${value}/package.json`;
        }
    }

    return `${githubLink}/main/package.json`;
};

const fetchLatestVersion = async () => {
    const link = getGithubLinkFromUrl();
    const result = await fetch(link);
    const data = await result.json();
    const { version } = data as { version: string };
    return version;
};

export const isLatestVersion = async () => {
    const deployed = await fetchLatestVersion();
    if (deployed !== currentVersion) {
        return false;
    }

    return true;
};

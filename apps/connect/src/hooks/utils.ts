import { connectConfig } from "@powerhousedao/connect/config";

export const isMac = window.navigator.appVersion.includes("Mac");

const urlBranchMap: Record<string, string> = {
  "staging/makerdao": "deployments/staging/makerdao",
  "staging/arbitrum": "arb-ltip",
  "staging/powerhouse": "staging",
  makerdao: "deployments/makerdao",
  arbitrum: "deployments/arbitrum",
  arbgrants: "deployments/arbitrum",
  localhost: "develop",
};

const getGithubLinkFromUrl = () => {
  const githubLink = "https://raw.githubusercontent.com/powerhouse-inc/connect";
  const url = window.location.href;

  const env = Object.keys(urlBranchMap).find((env) => url.includes(env));
  const value = env ? urlBranchMap[env] : undefined;
  if (!value) {
    return undefined;
  } else {
    return `${githubLink}/${value}/package.json`;
  }
};

const fetchLatestVersion = async () => {
  const link = getGithubLinkFromUrl();
  if (!link) {
    return undefined;
  }
  const result = await fetch(link);
  const data = (await result.json()) as { version: string };
  const { version } = data;
  return version;
};

export const isLatestVersion = async () => {
  const currentVersion = connectConfig.appVersion;
  const deployed = await fetchLatestVersion();

  if (deployed) {
    return {
      isLatest: deployed === currentVersion,
      currentVersion,
      latestVersion: deployed,
    };
  }

  return null;
};

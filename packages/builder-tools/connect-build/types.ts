type CommonBuildOptions = {
  connectPath?: string;
  configFile?: string;
  phCliVersion?: string;
};

export type ConnectBuildOptions = CommonBuildOptions & {
  packages?: { packageName: string }[];
};

export type RunBuildOptions = CommonBuildOptions & {
  packages?: string[];
};

export type ConnectStudioOptions = {
  port?: string;
  host?: boolean;
  https?: boolean;
  configFile?: string;
  localEditors?: string;
  localDocuments?: string;
  open?: boolean;
  packages?: { packageName: string }[];
  phCliVersion?: string;
};

export type StartServerOptions = {
  configFile?: string;
  packages?: string[];
  https?: boolean;
  open?: boolean;
};

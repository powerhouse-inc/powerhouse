export type ConnectStudioOptions = {
  connectPath?: string;
  port?: string;
  host?: boolean;
  https?: boolean;
  configFile?: string;
  open?: boolean;
  packages?: { packageName: string }[];
  phCliVersion?: string;
  logLevel?: "verbose" | "debug" | "info" | "warn" | "error" | "silent";
};

export type StartServerOptions = {
  connectPath?: string;
  configFile?: string;
  packages?: string[];
  https?: boolean;
  open?: boolean;
  phCliVersion?: string;
  logLevel?: "verbose" | "debug" | "info" | "warn" | "error" | "silent";
};

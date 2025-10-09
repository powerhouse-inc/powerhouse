import type { PowerhouseConfig } from "@powerhousedao/config";

export type IConnectOptions = {
  mode: string;
  dirname: string;
  envDir?: string;
  powerhouseConfig?: PowerhouseConfig;
  localPackage?: string | false; // path to local package to be loaded.
};

// Re-export types from env-config
export type {
  ConnectBuildEnv,
  ConnectRuntimeEnv,
  ConnectEnv,
} from "./env-config.js";

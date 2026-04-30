import type {
  PHConnectRuntimeConfig,
  PowerhouseConfig,
  PowerhousePackage,
} from "../clis/types.js";

export type RuntimePowerhouseConfig = {
  schemaVersion: 2;
  packages: PowerhousePackage[];
  localPackage: { name: string; version: string } | null;
  connect: PHConnectRuntimeConfig;
};

export function buildRuntimeConfig(
  source: Pick<PowerhouseConfig, "packages" | "connect">,
  projectInfo: { name: string; version: string } | null,
): RuntimePowerhouseConfig {
  return {
    schemaVersion: 2,
    packages: source.packages ?? [],
    localPackage: projectInfo,
    connect: source.connect ?? {},
  };
}

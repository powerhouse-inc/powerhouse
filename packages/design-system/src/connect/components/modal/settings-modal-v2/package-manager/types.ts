export interface RegistryOption {
  id: string;
  label: string;
  url: string;
  editable?: boolean;
}

export type RegistryStatus = "idle" | "connecting" | "connected" | "error";

export type { RegistryPackageInfo } from "@powerhousedao/reactor-browser";

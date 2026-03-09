export interface RegistryOption {
  id: string;
  label: string;
  url: string;
  editable?: boolean;
}

export type RegistryStatus = "idle" | "connecting" | "connected" | "error";

export interface RegistryPackageInfo {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  publisher?: string;
  publisherUrl?: string;
}

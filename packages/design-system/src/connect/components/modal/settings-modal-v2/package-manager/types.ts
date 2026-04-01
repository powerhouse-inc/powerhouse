export interface RegistryOption {
  id: string;
  label: string;
  url: string;
  editable?: boolean;
}

export type RegistryStatus = "idle" | "connecting" | "connected" | "error";

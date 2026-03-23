export interface RegistryPackageInfo {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  publisher?: string;
  publisherUrl?: string;
}

export interface PublishEvent {
  packageName: string;
  version: string | null;
}

export interface PublishEvent {
  packageName: string;
  version: string | null;
}

export interface UnpublishEvent {
  packageName: string;
  /** null when the entire package was removed, not just one version. */
  version: string | null;
}

export interface NotificationChannel {
  notifyPublish(event: PublishEvent): void;
  notifyUnpublish(event: UnpublishEvent): void;
}

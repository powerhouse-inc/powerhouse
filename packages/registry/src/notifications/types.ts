export interface PublishEvent {
  packageName: string;
  version: string | null;
}

export interface NotificationChannel {
  notifyPublish(event: PublishEvent): void;
}

export interface PublisherIdentity {
  /** Lowercase Ethereum address of the Renown identity that performed the op. */
  address: string;
  /** Issuer DID from the Renown bearer token, if present. */
  did?: string;
}

export interface PublishEvent {
  packageName: string;
  version: string | null;
  publishedBy?: PublisherIdentity;
}

export interface UnpublishEvent {
  packageName: string;
  /** null when the entire package was removed, not just one version. */
  version: string | null;
  publishedBy?: PublisherIdentity;
}

export interface NotificationChannel {
  notifyPublish(event: PublishEvent): void;
  notifyUnpublish(event: UnpublishEvent): void;
}

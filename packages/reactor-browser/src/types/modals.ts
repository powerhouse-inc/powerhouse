export type PHModal =
  | {
      type: "createDocument";
      documentType: string;
      documentModelVersion?: number;
      /** The drive to create it in; else the open drive, else the user picks one. */
      driveId?: string;
    }
  | {
      type: "deleteItem";
      id: string;
    }
  | {
      type: "addDrive";
    }
  | {
      type: "upgradeDrive";
      driveId: string;
    }
  | {
      type: "deleteDrive";
      driveId: string;
    }
  | {
      type: "driveSettings";
      driveId: string;
    }
  /** @deprecated Open `{ settings: true }` through the navigation instead. */
  | { type: "settings" }
  | { type: "clearStorage" }
  | { type: "debugSettings" }
  | { type: "disclaimer" }
  | { type: "cookiesPolicy" }
  | { type: "downloadDocumentWithErrors"; documentId: string }
  | { type: "inspector" }
  | {
      type: "documentVersionUnsupported";
      documentType: string;
      requiredVersion: number;
      availableVersions: number[];
    }
  | { type: "confirmDocumentUpgrade"; documentId: string }
  | { type: "driveAuthRequired" }
  // Drive picker for documents launched via OS file association (PWA File
  // Handling). Payload-free: the pending files live in a Connect-side store.
  | { type: "openFileDocuments" }
  | { type: "login" };

export type PHModal =
  | {
      type: "createDocument";
      documentType: string;
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
  | { type: "settings" }
  | { type: "clearStorage" }
  | { type: "debugSettings" }
  | { type: "disclaimer" }
  | { type: "cookiesPolicy" }
  | { type: "downloadDocumentWithErrors"; documentId: string }
  | { type: "inspector" }
  | { type: "missingPackage"; documentType: string }
  | { type: "driveAuthRequired" }
  // Drive picker for documents launched via OS file association (PWA File
  // Handling). Payload-free: the pending files live in a Connect-side store.
  | { type: "openFileDocuments" };

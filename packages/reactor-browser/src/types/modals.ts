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
  | { type: "exportDocumentWithErrors"; documentId: string };

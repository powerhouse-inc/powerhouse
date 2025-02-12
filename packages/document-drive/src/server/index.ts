import { ReadModeServer } from "../read-mode";
import { BaseDocumentDriveServer } from "./base-server";

export * from "../read-mode";
export * from "./base-server";
export * from "./listener";
export * from "./sync-manager";
export type * from "./types";

export const PULL_DRIVE_INTERVAL = 5000;

export const DocumentDriveServer = ReadModeServer(BaseDocumentDriveServer);

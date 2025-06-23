import {
  DocumentAlreadyExistsError,
  type DriveInput,
  type IDocumentDriveServer,
} from "document-drive";

export async function addDefaultDrive(
  driveServer: IDocumentDriveServer,
  drive: DriveInput,
  serverPort: number,
) {
  let driveId = drive.id;
  if (!driveId || driveId.length === 0) {
    driveId = drive.slug;
  }

  if (!driveId || driveId.length === 0) {
    throw new Error("Invalid Drive Id");
  }

  try {
    // add default drive
    await driveServer.addDrive(drive);
  } catch (e) {
    if (!(e instanceof DocumentAlreadyExistsError)) {
      throw e;
    }
  }

  return `http://localhost:${serverPort}/d/${driveId}`;
}

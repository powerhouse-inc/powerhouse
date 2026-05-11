/**
 * Document-type sentinel for drive documents. Drives are the unit
 * the LB shards on (via the `Drive-Id` request header) and the unit
 * the drive-ownership cache tracks on each switchboard instance.
 */
export const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

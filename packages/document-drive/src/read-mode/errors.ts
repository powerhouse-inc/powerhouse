export abstract class ReadDriveError extends Error {}

export class ReadDriveNotFoundError extends ReadDriveError {
  constructor(driveId: string) {
    super(`Read drive ${driveId} not found.`);
  }
}

export class ReadDriveSlugNotFoundError extends ReadDriveError {
  constructor(slug: string) {
    super(`Read drive with slug ${slug} not found.`);
  }
}

export class ReadDocumentNotFoundError extends ReadDriveError {
  constructor(drive: string, id: string) {
    super(`Document with id ${id} not found on read drive ${drive}.`);
  }
}

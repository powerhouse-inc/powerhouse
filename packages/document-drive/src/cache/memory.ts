import { DocumentDriveDocument } from "#drive-document-model/gen/types";
import { type PHDocument } from "document-model";
import { type ICache } from "./types.js";
import { trimResultingState } from "./util.js";

class InMemoryCache implements ICache {
  private idTodocument = new Map<string, PHDocument>();
  private idToDrive = new Map<string, DocumentDriveDocument>();
  private slugToDriveId = new Map<string, string>();

  clear() {
    this.idTodocument.clear();
    this.idToDrive.clear();
    this.slugToDriveId.clear();
  }

  /////////////////////////////////////////////////////////////////////////////
  // ICache
  /////////////////////////////////////////////////////////////////////////////

  async setDocument(documentId: string, document: PHDocument) {
    const doc = trimResultingState(document);
    this.idTodocument.set(documentId, doc);
  }

  async getDocument<TDocument extends PHDocument>(
    documentId: string,
  ): Promise<TDocument | undefined> {
    return this.idTodocument.get(documentId) as TDocument | undefined;
  }

  async deleteDocument(documentId: string) {
    return this.idTodocument.delete(documentId);
  }

  async setDrive(driveId: string, drive: DocumentDriveDocument) {
    const doc = trimResultingState(drive);
    this.idToDrive.set(driveId, doc);
  }

  async getDrive(driveId: string): Promise<DocumentDriveDocument | undefined> {
    return this.idToDrive.get(driveId);
  }

  async deleteDrive(driveId: string) {
    // look up the slug
    const drive = this.idToDrive.get(driveId);
    if (!drive) {
      return false;
    }

    const slug = drive.state.global.slug;
    if (slug) {
      this.slugToDriveId.delete(slug);
    }

    return this.idToDrive.delete(driveId);
  }

  async setDriveBySlug(slug: string, drive: DocumentDriveDocument) {
    const driveId = drive.state.global.id;
    this.slugToDriveId.set(slug, driveId);
    this.setDrive(driveId, drive);
  }

  async getDriveBySlug(
    slug: string,
  ): Promise<DocumentDriveDocument | undefined> {
    const driveId = this.slugToDriveId.get(slug);
    if (!driveId) {
      return undefined;
    }
    return this.getDrive(driveId);
  }

  async deleteDriveBySlug(slug: string) {
    const driveId = this.slugToDriveId.get(slug);
    if (!driveId) {
      return false;
    }

    this.slugToDriveId.delete(slug);
    return this.deleteDrive(driveId);
  }
}

export default InMemoryCache;

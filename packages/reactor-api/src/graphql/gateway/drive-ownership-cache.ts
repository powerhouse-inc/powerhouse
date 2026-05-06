import type { IReactorClient } from "@powerhousedao/reactor";
import { DRIVE_DOCUMENT_TYPE } from "../reactor/constants.js";

/**
 * In-memory record of which drives this switchboard instance owns.
 *
 * Populated at startup by walking the reactor for documents of type
 * `powerhouse/document-drive`. Mutated explicitly by resolver hooks
 * after successful drive create / delete operations. Read by the
 * drive-validation fetch middleware to short-circuit wrong-shard
 * requests with a structured 421 response.
 */
export class DriveOwnershipCache {
  private readonly drives = new Set<string>();

  constructor(private readonly reactorClient: IReactorClient) {}

  async init(): Promise<void> {
    this.drives.clear();
    let page = await this.reactorClient.find({ type: DRIVE_DOCUMENT_TYPE });
    while (true) {
      for (const drive of page.results) {
        this.drives.add(drive.header.id);
      }
      if (!page.next) {
        return;
      }
      page = await page.next();
    }
  }

  has(driveId: string): boolean {
    return this.drives.has(driveId);
  }

  add(driveId: string): void {
    this.drives.add(driveId);
  }

  remove(driveId: string): void {
    this.drives.delete(driveId);
  }

  size(): number {
    return this.drives.size;
  }
}

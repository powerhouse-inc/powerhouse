import {
  DEFAULT_DRIVE_CONTAINER_TYPES,
  type PagedResults,
  type SearchFilter,
} from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";

/**
 * Where drives are looked up: the raw reactor, past the read gate. Ownership
 * is a storage fact that serves no content, so a policy that withholds a drive
 * from the host's key must not make the host deny holding it.
 */
export type DriveStore = {
  find(search: SearchFilter): Promise<PagedResults<PHDocument>>;
};

/**
 * In-memory record of which drives this switchboard instance owns.
 *
 * Populated at startup by walking the reactor for documents whose type is
 * listed in `DEFAULT_DRIVE_CONTAINER_TYPES` (both legacy `document-drive`
 * and `reactor-drive`). Mutated explicitly by resolver hooks after
 * successful drive create / delete operations. Read by the drive-validation
 * fetch middleware to short-circuit wrong-shard requests with a structured
 * 421 response.
 */
export class DriveOwnershipCache {
  private readonly drives = new Set<string>();

  constructor(private readonly store: DriveStore) {}

  async init(): Promise<void> {
    this.drives.clear();
    for (const driveType of DEFAULT_DRIVE_CONTAINER_TYPES) {
      let page = await this.store.find({ type: driveType });
      while (true) {
        for (const drive of page.results) {
          this.drives.add(drive.header.id);
        }
        if (!page.next) {
          break;
        }
        page = await page.next();
      }
    }
  }

  has(driveId: string): boolean {
    return this.drives.has(driveId);
  }

  /**
   * Whether this host holds the drive, asking the reactor on a miss: drives
   * also arrive by sync and by writes that bypass the create resolvers. A
   * positive answer is cached; a failure to ask throws.
   */
  async holds(driveId: string): Promise<boolean> {
    if (this.drives.has(driveId)) {
      return true;
    }
    const page = await this.store.find({ ids: [driveId] });
    const held = page.results.some(
      (document) =>
        document.header.id === driveId &&
        DEFAULT_DRIVE_CONTAINER_TYPES.has(document.header.documentType),
    );
    if (held) {
      this.drives.add(driveId);
    }
    return held;
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

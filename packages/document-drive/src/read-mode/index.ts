import { logger } from "document-drive/logger";
import { Document } from "document-model/document";
import { RemoteDriveOptions } from "../server";
import { DocumentDriveServerConstructor } from "../server/base-server";
import { ReadDriveSlugNotFoundError } from "./errors";
import { ReadModeService } from "./service";
import {
  IReadModeDriveServer,
  IReadModeDriveService,
  ReadDrive,
  ReadDriveOptions,
  ReadDrivesListener,
  ReadModeDriveServerMixin,
} from "./types";

export * from "./errors";
export * from "./types";

export function ReadModeServer<TBase extends DocumentDriveServerConstructor>(
  Base: TBase,
): ReadModeDriveServerMixin {
  return class ReadMode extends Base implements IReadModeDriveServer {
    #readModeStorage: IReadModeDriveService;
    #listeners = new Set<ReadDrivesListener>();

    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);

      this.#readModeStorage = new ReadModeService(
        this.getDocumentModel.bind(this),
      );

      this.#buildDrives()
        .then((drives) => {
          if (drives.length) {
            this.#notifyListeners(drives, "add");
          }
        })
        .catch(logger.error);
    }

    async #buildDrives() {
      const driveIds = await this.getReadDrives();
      const drives = (
        await Promise.all(driveIds.map((driveId) => this.getReadDrive(driveId)))
      ).filter((drive) => !(drive instanceof Error)) as ReadDrive[];
      return drives;
    }

    #notifyListeners(drives: ReadDrive[], operation: "add" | "delete") {
      this.#listeners.forEach((listener) => listener(drives, operation));
    }

    getReadDrives(): Promise<string[]> {
      return this.#readModeStorage.getReadDrives();
    }

    getReadDrive(id: string) {
      return this.#readModeStorage.getReadDrive(id);
    }

    getReadDriveBySlug(
      slug: string,
    ): Promise<ReadDrive | ReadDriveSlugNotFoundError> {
      return this.#readModeStorage.getReadDriveBySlug(slug);
    }

    getReadDriveContext(id: string) {
      return this.#readModeStorage.getReadDriveContext(id);
    }

    async addReadDrive(url: string, options?: ReadDriveOptions) {
      await this.#readModeStorage.addReadDrive(url, options);
      this.#notifyListeners(await this.#buildDrives(), "add");
    }

    fetchDrive(id: string) {
      return this.#readModeStorage.fetchDrive(id);
    }

    fetchDocument<D extends Document>(
      driveId: string,
      documentId: string,
      documentType: string,
    ) {
      return this.#readModeStorage.fetchDocument<D>(
        driveId,
        documentId,
        documentType,
      );
    }

    async deleteReadDrive(id: string) {
      const error = await this.#readModeStorage.deleteReadDrive(id);
      if (error) {
        return error;
      }

      this.#notifyListeners(await this.#buildDrives(), "delete");
    }

    async migrateReadDrive(id: string, options: RemoteDriveOptions) {
      const result = await this.getReadDriveContext(id);
      if (result instanceof Error) {
        return result;
      }

      const { url, ...readOptions } = result;
      try {
        const newDrive = await this.addRemoteDrive(url, options);
        return newDrive;
      } catch (error) {
        // if an error is thrown, then add the read drive again
        logger.error(error);
        await this.addReadDrive(result.url, readOptions);
        throw error;
      }
    }

    onReadDrivesUpdate(listener: ReadDrivesListener) {
      this.#listeners.add(listener);
      return Promise.resolve(() => this.#listeners.delete(listener));
    }
  };
}

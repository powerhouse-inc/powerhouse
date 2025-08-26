import { type DocumentDriveServerConstructor } from "#server/base-server";
import { type RemoteDriveOptions } from "#server/types";
import { logger } from "#utils/logger";
import { type PHDocument } from "document-model";
import { type ReadDriveSlugNotFoundError } from "./errors.js";
import { ReadModeService } from "./service.js";
import {
  type IReadModeDriveServer,
  type IReadModeDriveService,
  type ReadDrive,
  type ReadDriveOptions,
  type ReadDrivesListener,
} from "./types.js";

export function ReadModeServer(
  Base: DocumentDriveServerConstructor,
): new (
  ...args: ConstructorParameters<typeof Base>
) => InstanceType<typeof Base> & IReadModeDriveServer {
  return class ReadMode extends Base implements IReadModeDriveServer {
    #readModeStorage: IReadModeDriveService;
    #listeners = new Set<ReadDrivesListener>();

    constructor(...args: any[]) {
      super(...args);

      this.#readModeStorage = new ReadModeService(
        this.getDocumentModelModule.bind(this),
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
      ).filter((drive: any) => !(drive instanceof Error)) as ReadDrive[];
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

    fetchDocument<TDocument extends PHDocument>(
      driveId: string,
      documentId: string,
      documentType: string,
    ) {
      return this.#readModeStorage.fetchDocument<TDocument>(
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

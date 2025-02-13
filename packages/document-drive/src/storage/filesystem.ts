import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "@drive-document-model";
import { DriveNotFoundError } from "@server/error";
import type { SynchronizationUnitQuery } from "@server/types";
import type {
  DocumentDriveStorage,
  DocumentStorage,
  IDriveStorage,
} from "@storage/types";
import { mergeOperations } from "@utils/misc";
import { DocumentHeader, Operation, OperationScope } from "document-model";
import type { Dirent } from "fs";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import fs from "fs/promises";
import stringify from "json-stringify-deterministic";
import path from "path";
import sanitize from "sanitize-filename";

type FSError = {
  errno: number;
  code: string;
  syscall: string;
  path: string;
};

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class FilesystemStorage implements IDriveStorage {
  private basePath: string;
  private drivesPath: string;
  private static DRIVES_DIR = "drives";

  constructor(basePath: string) {
    this.basePath = basePath;
    ensureDir(this.basePath);
    this.drivesPath = path.join(this.basePath, FilesystemStorage.DRIVES_DIR);
    ensureDir(this.drivesPath);
  }

  private _buildDocumentPath(...args: string[]) {
    return `${path.join(
      this.basePath,
      ...args.map((arg) => sanitize(arg)),
    )}.json`;
  }

  async getDocuments(drive: string) {
    let files: Dirent[] = [];
    try {
      files = readdirSync(path.join(this.basePath, drive), {
        withFileTypes: true,
      });
    } catch (error) {
      // if folder is not found then drive has no documents
      if ((error as FSError).code !== "ENOENT") {
        throw error;
      }
    }
    const documents: string[] = [];
    for (const file of files.filter((file) => file.isFile())) {
      try {
        const documentId = path.parse(file.name).name;

        // checks if file is document
        await this.getDocument(drive, documentId);
        documents.push(documentId);
      } catch {
        /* Ignore invalid document*/
      }
    }
    return documents;
  }

  checkDocumentExists(drive: string, id: string): Promise<boolean> {
    const documentExists = existsSync(this._buildDocumentPath(drive, id));
    return Promise.resolve(documentExists);
  }

  async getDocument<TGlobalState, TLocalState>(drive: string, id: string) {
    try {
      const content = readFileSync(this._buildDocumentPath(drive, id), {
        encoding: "utf-8",
      });
      return JSON.parse(content) as DocumentStorage<TGlobalState, TLocalState>;
    } catch (error) {
      throw new Error(`Document with id ${id} not found`);
    }
  }

  async createDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    document: DocumentStorage<TGlobalState, TLocalState>,
  ) {
    const documentPath = this._buildDocumentPath(drive, id);
    ensureDir(path.dirname(documentPath));
    writeFileSync(documentPath, stringify(document), {
      encoding: "utf-8",
    });
    return Promise.resolve();
  }

  async clearStorage() {
    const drivesPath = path.join(this.basePath, FilesystemStorage.DRIVES_DIR);

    // delete content of drives directory
    const drives = (
      await fs.readdir(drivesPath, {
        withFileTypes: true,
        recursive: true,
      })
    ).filter((dirent) => !!dirent.name);

    await Promise.all(
      drives.map(async (dirent) => {
        await fs.rm(path.join(drivesPath, dirent.name), {
          recursive: true,
        });
      }),
    );

    // delete files in basePath
    const files = (
      await fs.readdir(this.basePath, { withFileTypes: true })
    ).filter(
      (file) => file.name !== FilesystemStorage.DRIVES_DIR && !!file.name,
    );

    await Promise.all(
      files.map(async (dirent) => {
        await fs.rm(path.join(this.basePath, dirent.name), {
          recursive: true,
        });
      }),
    );
  }

  async deleteDocument(drive: string, id: string) {
    return fs.rm(this._buildDocumentPath(drive, id));
  }

  async addDocumentOperations<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState>[],
    header: DocumentHeader,
  ) {
    const document = await this.getDocument(drive, id);
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    const mergedOperations = mergeOperations(document.operations, operations);

    await this.createDocument(drive, id, {
      ...document,
      ...header,
      operations: mergedOperations,
    });
  }

  async getDrives() {
    const files = readdirSync(this.drivesPath, {
      withFileTypes: true,
    });
    const drives: string[] = [];
    for (const file of files.filter((file) => file.isFile())) {
      try {
        const driveId = path.parse(file.name).name;

        // checks if file is drive
        await this.getDrive(driveId);
        drives.push(driveId);
      } catch {
        /* Ignore invalid drive document found on drives dir */
      }
    }
    return drives;
  }

  async getDrive(id: string) {
    try {
      return (await this.getDocument(
        FilesystemStorage.DRIVES_DIR,
        id,
      )) as DocumentDriveStorage;
    } catch {
      throw new DriveNotFoundError(id);
    }
  }

  async getDriveBySlug(slug: string) {
    // get oldes drives first
    const drives = (await this.getDrives()).reverse();
    for (const drive of drives) {
      const {
        initialState: {
          state: {
            global: { slug: driveSlug },
          },
        },
      } = await this.getDrive(drive);
      if (driveSlug === slug) {
        return this.getDrive(drive);
      }
    }
    throw new Error(`Drive with slug ${slug} not found`);
  }

  createDrive(id: string, drive: DocumentDriveStorage) {
    return this.createDocument(FilesystemStorage.DRIVES_DIR, id, drive);
  }

  async deleteDrive(id: string) {
    const documents = await this.getDocuments(id);
    await this.deleteDocument(FilesystemStorage.DRIVES_DIR, id);
    await Promise.all(
      documents.map((document) => this.deleteDocument(id, document)),
    );
  }

  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveState, DocumentDriveLocalState>[],
    header: DocumentHeader,
  ): Promise<void> {
    const drive = await this.getDrive(id);
    const mergedOperations = mergeOperations(drive.operations, operations);

    await this.createDrive(id, {
      ...drive,
      ...header,
      operations: mergedOperations,
    });
  }

  async getSynchronizationUnitsRevision(
    units: SynchronizationUnitQuery[],
  ): Promise<
    {
      driveId: string;
      documentId: string;
      scope: string;
      branch: string;
      lastUpdated: string;
      revision: number;
    }[]
  > {
    const results = await Promise.allSettled(
      units.map(async (unit) => {
        try {
          const document = await (unit.documentId
            ? this.getDocument(unit.driveId, unit.documentId)
            : this.getDrive(unit.driveId));
          if (!document) {
            return undefined;
          }
          const operation =
            document.operations[unit.scope as OperationScope].at(-1);
          if (operation) {
            return {
              driveId: unit.driveId,
              documentId: unit.documentId,
              scope: unit.scope,
              branch: unit.branch,
              lastUpdated: operation.timestamp,
              revision: operation.index,
            };
          }
        } catch {
          return undefined;
        }
      }),
    );
    return results.reduce<
      {
        driveId: string;
        documentId: string;
        scope: string;
        branch: string;
        lastUpdated: string;
        revision: number;
      }[]
    >((acc, curr) => {
      if (curr.status === "fulfilled" && curr.value !== undefined) {
        acc.push(curr.value);
      }
      return acc;
    }, []);
  }
}

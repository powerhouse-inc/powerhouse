import {
  AttachmentInput,
  BaseDocument,
  DocumentHeader,
  ExtendedState,
  Operation,
  OperationScope,
} from "document-model";
import { DataTypes, Options, Sequelize } from "sequelize";
import {
  DocumentDriveAction,
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "../drive-document-model/gen/types.js";
import { SynchronizationUnitQuery } from "../server/types.js";
import { IDriveStorage } from "./types.js";

export class SequelizeStorage implements IDriveStorage {
  private db: Sequelize;

  constructor(options: Options) {
    this.db = new Sequelize(options);
  }

  public syncModels() {
    const Drive = this.db.define("drive", {
      slug: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      id: DataTypes.STRING,
    });
    const Document = this.db.define("document", {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      driveId: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      name: DataTypes.STRING,
      documentType: DataTypes.STRING,
      initialState: DataTypes.JSON,
      lastModified: DataTypes.DATE,
      revision: DataTypes.JSON,
    });

    const Operation = this.db.define("operation", {
      driveId: {
        type: DataTypes.STRING,
        primaryKey: true,
        unique: "unique_operation",
      },
      documentId: {
        type: DataTypes.STRING,
        primaryKey: true,
        unique: "unique_operation",
      },
      hash: DataTypes.STRING,
      index: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        unique: "unique_operation",
      },
      input: DataTypes.JSON,
      timestamp: DataTypes.DATE,
      type: DataTypes.STRING,
      scope: {
        type: DataTypes.STRING,
        primaryKey: true,
        unique: "unique_operation",
      },
      branch: {
        type: DataTypes.STRING,
        primaryKey: true,
        unique: "unique_operation",
      },
      skip: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    });

    const Attachment = this.db.define("attachment", {
      driveId: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      documentId: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      scope: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      branch: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      index: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      hash: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      mimeType: DataTypes.STRING,
      fileName: DataTypes.STRING,
      extension: DataTypes.STRING,
      data: DataTypes.BLOB,
    });

    Operation.hasMany(Attachment, {
      onDelete: "CASCADE",
    });
    Attachment.belongsTo(Operation);
    Document.hasMany(Operation, {
      onDelete: "CASCADE",
    });
    Operation.belongsTo(Document);

    return this.db.sync({ force: true });
  }

  async createDrive(id: string, drive: DocumentDriveDocument): Promise<void> {
    await this.createDocument("drives", id, drive);
    const Drive = this.db.models.drive;
    await Drive.upsert({ id, slug: drive.initialState.state.global.slug });
  }
  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    header: DocumentHeader,
  ): Promise<void> {
    await this.addDocumentOperations("drives", id, operations, header);
  }
  async createDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    document: BaseDocument<TGlobalState, TLocalState>,
  ): Promise<void> {
    const Document = this.db.models.document;

    if (!Document) {
      throw new Error("Document model not found");
    }

    await Document.create({
      id: id,
      driveId: drive,
      name: document.name,
      documentType: document.documentType,
      initialState: document.initialState,
      lastModified: document.lastModified,
      revision: document.revision,
    });
  }
  async addDocumentOperations<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void> {
    const document = await this.getDocument(drive, id);
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    const Operation = this.db.models.operation;
    if (!Operation) {
      throw new Error("Operation model not found");
    }

    await Operation.bulkCreate(
      operations.map((op) => ({
        driveId: drive,
        documentId: id,
        hash: op.hash,
        index: op.index,
        input: op.input,
        timestamp: op.timestamp,
        type: op.type,
        scope: op.scope,
        branch: "main",
        opId: op.id,
      })),
    );

    const attachments = operations.reduce<AttachmentInput[]>((acc, op) => {
      if (op.attachments?.length) {
        return acc.concat(
          op.attachments.map((attachment) => ({
            driveId: drive,
            documentId: id,
            scope: op.scope,
            branch: "main",
            index: op.index,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName,
            extension: attachment.extension,
            data: attachment.data,
            hash: attachment.hash,
          })),
        );
      }
      return acc;
    }, []);
    if (attachments.length) {
      const Attachment = this.db.models.attachment;
      if (!Attachment) {
        throw new Error("Attachment model not found");
      }

      await Attachment.bulkCreate(attachments);
    }

    const Document = this.db.models.document;
    if (!Document) {
      throw new Error("Document model not found");
    }

    await Document.update(
      {
        lastModified: header.lastModified,
        revision: header.revision,
      },
      {
        where: {
          id: id,
          driveId: drive,
        },
      },
    );
  }

  async _addDocumentOperationAttachments<TGlobalState, TLocalState>(
    driveId: string,
    documentId: string,
    operation: Operation,
    attachments: AttachmentInput[],
  ) {
    const Attachment = this.db.models.attachment;
    if (!Attachment) {
      throw new Error("Attachment model not found");
    }

    return Attachment.bulkCreate(
      attachments.map((attachment) => ({
        driveId: driveId,
        documentId: documentId,
        scope: operation.scope,
        branch: "main",
        index: operation.index,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        extension: attachment.extension,
        data: attachment.data,
        hash: attachment.hash,
      })),
    );
  }

  async getDocuments(drive: string) {
    const Document = this.db.models.document;
    if (!Document) {
      throw new Error("Document model not found");
    }

    const result = await Document.findAll({
      attributes: ["id"],
      where: {
        driveId: drive,
      },
    });

    const ids = result.map((e: { dataValues: { id: string } }) => {
      const { id } = e.dataValues;
      return id;
    });
    return ids;
  }

  async checkDocumentExists(driveId: string, id: string): Promise<boolean> {
    const Document = this.db.models.document;
    if (!Document) {
      throw new Error("Document model not found");
    }
    const count = await Document.count({
      where: {
        id: id,
        driveId: driveId,
      },
    });

    return count > 0;
  }

  async getDocument<TGlobalState, TLocalState>(
    driveId: string,
    id: string,
  ): Promise<BaseDocument<TGlobalState, TLocalState>> {
    const Document = this.db.models.document;
    if (!Document) {
      throw new Error("Document model not found");
    }

    const entry = await Document.findOne({
      where: {
        id: id,
        driveId: driveId,
      },
      include: [
        {
          model: this.db.models.operation,
          as: "operations",
        },
      ],
    });

    if (entry === null) {
      throw new Error(`Document with id ${id} not found`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const document: {
      operations: [
        {
          hash: string;
          index: number;
          timestamp: Date;
          input: JSON;
          type: string;
          scope: string;
          opId?: string;
          skip: number;
        },
      ];
      revision: Required<Record<OperationScope, number>>;
      createdAt: Date;
      name: string;
      updatedAt: Date;
      documentType: string;
      initialState: ExtendedState<DocumentDriveState, DocumentDriveLocalState>;
    } = entry.dataValues;
    const Operation = this.db.models.operation;
    if (!Operation) {
      throw new Error("Operation model not found");
    }

    const operations = document.operations.map((op) => ({
      hash: op.hash,
      index: op.index,
      timestamp: new Date(op.timestamp).toISOString(),
      input: op.input,
      type: op.type,
      scope: op.scope as OperationScope,
      id: op.opId,
      skip: op.skip,
      // attachments: fileRegistry
    })) as Operation[];

    const doc = {
      created: document.createdAt.toISOString(),
      name: document.name ? document.name : "",
      documentType: document.documentType,
      initialState: document.initialState,
      lastModified: document.updatedAt.toISOString(),
      operations: {
        global: operations.filter((op) => op.scope === "global"),
        local: operations.filter((op) => op.scope === "local"),
      },
      revision: document.revision,
    };

    return doc as BaseDocument<TGlobalState, TLocalState>;
  }

  async deleteDocument(drive: string, id: string) {
    const Document = this.db.models.document;
    if (!Document) {
      throw new Error("Document model not found");
    }

    await Document.destroy({
      where: {
        id: id,
        driveId: drive,
      },
    });
  }

  async getDrives() {
    return this.getDocuments("drives");
  }

  async getDrive(id: string) {
    const doc = await this.getDocument("drives", id);
    return doc as DocumentDriveDocument;
  }

  async getDriveBySlug(slug: string) {
    const Drive = this.db.models.drive;
    if (!Drive) {
      throw new Error("Drive model not found");
    }

    const driveEntity = await Drive.findOne({
      where: {
        slug,
      },
    });

    if (!driveEntity) {
      throw new Error(`Drive with slug ${slug} not found`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.getDrive(driveEntity.dataValues.id);
  }

  async deleteDrive(id: string) {
    await this.deleteDocument("drives", id);

    const Document = this.db.models.document;
    if (!Document) {
      throw new Error("Document model not found");
    }

    await Document.destroy({
      where: {
        driveId: id,
      },
    });

    const Drive = this.db.models.drive;
    if (Drive) {
      await Drive.destroy({
        where: {
          id: id,
        },
      });
    }
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

import type { Kysely } from "kysely";
import type {
  IAttachmentTransport,
  IAttachmentUploadFactory,
} from "./interfaces.js";
import type { AttachmentDatabase } from "./storage/kysely/types.js";
import { AttachmentService } from "./attachment-service.js";
import { KyselyAttachmentStore } from "./storage/kysely/attachment-store.js";
import { KyselyReservationStore } from "./storage/kysely/reservation-store.js";
import { DirectAttachmentUploadFactory } from "./direct/direct-attachment-upload-factory.js";
import {
  runAttachmentMigrations,
  ATTACHMENT_SCHEMA,
} from "./storage/migrations/migrator.js";
import { NullAttachmentTransport } from "./null-attachment-transport.js";

export type AttachmentBuildResult = {
  service: AttachmentService;
  store: KyselyAttachmentStore;
  reservations: KyselyReservationStore;
  uploadFactory: IAttachmentUploadFactory;
};

export class AttachmentBuilder {
  private transport: IAttachmentTransport = new NullAttachmentTransport();
  private customUploadFactory?: IAttachmentUploadFactory;

  constructor(
    private readonly db: Kysely<any>,
    private readonly storagePath: string,
  ) {}

  withTransport(transport: IAttachmentTransport): this {
    this.transport = transport;
    return this;
  }

  withUploadFactory(factory: IAttachmentUploadFactory): this {
    this.customUploadFactory = factory;
    return this;
  }

  async build(): Promise<AttachmentBuildResult> {
    const result = await runAttachmentMigrations(this.db, ATTACHMENT_SCHEMA);
    if (!result.success && result.error) {
      throw result.error;
    }

    const scopedDb = this.db.withSchema(
      ATTACHMENT_SCHEMA,
    ) as Kysely<AttachmentDatabase>;

    const store = new KyselyAttachmentStore(
      scopedDb,
      this.transport,
      this.storagePath,
    );
    const reservations = new KyselyReservationStore(scopedDb);

    const uploadFactory =
      this.customUploadFactory ??
      new DirectAttachmentUploadFactory(
        scopedDb,
        this.storagePath,
        reservations,
      );

    const service = new AttachmentService(store, reservations, uploadFactory);

    return { service, store, reservations, uploadFactory };
  }
}

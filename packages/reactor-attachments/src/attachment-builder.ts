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
  /** Stops the reservation sweep timer, if one was configured via withReservationSweepMs(). */
  destroy: () => void;
};

export class AttachmentBuilder {
  private transport: IAttachmentTransport = new NullAttachmentTransport();
  private customUploadFactory?: IAttachmentUploadFactory;
  private maxUploadBytes?: number;
  private reservationSweepMs?: number;

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

  withMaxUploadBytes(maxBytes: number): this {
    this.maxUploadBytes = maxBytes;
    return this;
  }

  /**
   * Configure a recurring sweep that deletes expired reservations.
   * The sweep calls reservations.deleteExpired() on the given interval.
   * When set, the built result's destroy() clears the timer.
   * Without this option no sweep runs -- deleteExpired() is never called
   * automatically. Call withReservationSweepMs in production to prevent
   * expired reservation rows from accumulating indefinitely.
   */
  withReservationSweepMs(intervalMs: number): this {
    this.reservationSweepMs = intervalMs;
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
        this.maxUploadBytes,
      );

    const service = new AttachmentService(store, reservations, uploadFactory);

    let sweepTimer: ReturnType<typeof setInterval> | undefined;
    if (this.reservationSweepMs !== undefined) {
      const intervalMs = this.reservationSweepMs;
      sweepTimer = setInterval(() => {
        void reservations.deleteExpired();
      }, intervalMs);
    }

    const destroy = (): void => {
      if (sweepTimer !== undefined) {
        clearInterval(sweepTimer);
        sweepTimer = undefined;
      }
    };

    return { service, store, reservations, uploadFactory, destroy };
  }
}

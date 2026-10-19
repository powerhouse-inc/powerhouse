import type { PGliteWithLive } from "@electric-sql/pglite/live";
import {
  createReactorHostModuleBase,
  type IReadModel,
} from "@powerhousedao/reactor";
import {
  createAttachmentClient,
  type AttachmentDownloadTarget,
  type AttachmentHeader,
  type AttachmentResponse,
  type IAttachmentService,
} from "@powerhousedao/reactor-attachments/client";
import {
  createAnalyticsStore,
  type IProcessorHostModule,
  type IReactorClient,
  setPGliteDB,
} from "@powerhousedao/reactor-browser";
import { getDb } from "../pglite.db.js";

/** @deprecated Use IReactorClient from @powerhousedao/reactor-browser */
export type IReactorDispatch = IReactorClient;

class NullAttachmentService implements IAttachmentService {
  reserve(): Promise<never> {
    return Promise.reject(
      new Error("NullAttachmentService: no attachment service configured"),
    );
  }
  stat(): Promise<AttachmentHeader> {
    return Promise.reject(
      new Error("NullAttachmentService: no attachment service configured"),
    );
  }
  get(): Promise<AttachmentResponse> {
    return Promise.reject(
      new Error("NullAttachmentService: no attachment service configured"),
    );
  }
  getDownloadTarget(): Promise<AttachmentDownloadTarget> {
    return Promise.reject(
      new Error("NullAttachmentService: no attachment service configured"),
    );
  }
}

export async function createProcessorHostModule(
  reactorClient: IReactorClient,
  readModels: ReadonlyArray<Pick<IReadModel, "name">>,
  attachmentService?: IAttachmentService,
): Promise<IProcessorHostModule | undefined> {
  try {
    const { pgLite, relationalDb } = await getDb();
    // Publish the tab's PGlite for the relational hooks (useRelationalDb /
    // useRelationalQuery). The worker path seeds a proxy in
    // reactor-worker-client; the in-process path has the instance itself.
    setPGliteDB({
      db: pgLite as unknown as PGliteWithLive,
      isLoading: false,
      error: null,
    });
    const { store: analyticsStore } = await createAnalyticsStore({
      pgLite,
    });
    return {
      ...createReactorHostModuleBase({
        client: reactorClient,
        readModels,
        relationalDb,
        analyticsStore,
        processorApp: "connect",
      }),
      attachments: createAttachmentClient(
        attachmentService ?? new NullAttachmentService(),
      ),
    };
  } catch (error) {
    console.error(`Failed to initialize processor host module:`);
    console.error(error);
  }
}

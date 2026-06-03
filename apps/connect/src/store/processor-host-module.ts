import {
  createAttachmentClient,
  type AttachmentHeader,
  type AttachmentResponse,
  type IAttachmentService,
} from "@powerhousedao/reactor-attachments/client";
import {
  createAnalyticsStore,
  type IReactorClient,
  type IReactorProcessorHostModule,
} from "@powerhousedao/reactor-browser";
import { getDb } from "../pglite.db.js";

/** @deprecated Use IReactorClient from @powerhousedao/reactor-browser */
export type IReactorDispatch = IReactorClient;

class NullAttachmentService implements IAttachmentService {
  async reserve(): Promise<never> {
    throw new Error("NullAttachmentService: no attachment service configured");
  }
  async stat(): Promise<AttachmentHeader> {
    throw new Error("NullAttachmentService: no attachment service configured");
  }
  async get(): Promise<AttachmentResponse> {
    throw new Error("NullAttachmentService: no attachment service configured");
  }
}

interface INamedReadModel {
  readonly name: string;
}

export async function createProcessorHostModule(
  reactorClient: IReactorClient,
  readModels: INamedReadModel[],
  attachmentService?: IAttachmentService,
): Promise<IReactorProcessorHostModule | undefined> {
  try {
    const { pgLite, relationalDb } = await getDb();
    const { store: analyticsStore } = await createAnalyticsStore({
      pgLite,
    });
    const processorApp = "connect" as const;
    return {
      relationalDb,
      analyticsStore,
      processorApp,
      client: reactorClient,
      attachments: createAttachmentClient(
        attachmentService ?? new NullAttachmentService(),
      ),
      dispatch: {
        async execute(docId, branch, actions, signal) {
          const jobInfo = await reactorClient.executeAsync(
            docId,
            branch,
            actions,
            signal,
          );
          return { id: jobInfo.id, status: jobInfo.status };
        },
      },
      getReadModel<T>(name: string): T {
        const model = readModels.find((m) => m.name === name);
        if (!model) {
          throw new Error(`Read model "${name}" not found`);
        }
        return model as unknown as T;
      },
    };
  } catch (error) {
    console.error(`Failed to initialize processor host module:`);
    console.error(error);
  }
}

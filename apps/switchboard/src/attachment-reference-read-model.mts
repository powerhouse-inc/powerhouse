import {
  REACTOR_SCHEMA,
  supportsLiveReadModelRegistration,
  type DocumentViewDatabase,
  type InProcessReactorClientModule,
  type ReactorBuilder,
} from "@powerhousedao/reactor";
import type { AttachmentReferenceProjectionCapability } from "@powerhousedao/reactor-api";
import {
  AttachmentReferenceReadModel,
  AttachmentSchemaCompiler,
  type IAttachmentReferenceWriter,
} from "@powerhousedao/reactor-attachments";
import type { Kysely } from "kysely";

export type AttachmentReferenceReadModelRegistration = {
  attachmentReferenceWriter: IAttachmentReferenceWriter;
  baseKysely: Kysely<unknown>;
};

const attachmentSchemaCompiler = new AttachmentSchemaCompiler();

function createAttachmentReferenceReadModel(
  baseKysely: Kysely<unknown>,
  dependencies: {
    operationIndex: ConstructorParameters<
      typeof AttachmentReferenceReadModel
    >[1];
    writeCache: ConstructorParameters<typeof AttachmentReferenceReadModel>[2];
    processorManagerConsistencyTracker: ConstructorParameters<
      typeof AttachmentReferenceReadModel
    >[3];
    documentModelRegistry: ConstructorParameters<
      typeof AttachmentReferenceReadModel
    >[4];
  },
  attachmentReferenceWriter: IAttachmentReferenceWriter,
): AttachmentReferenceReadModel {
  return new AttachmentReferenceReadModel(
    baseKysely.withSchema(
      REACTOR_SCHEMA,
    ) as unknown as Kysely<DocumentViewDatabase>,
    dependencies.operationIndex,
    dependencies.writeCache,
    dependencies.processorManagerConsistencyTracker,
    dependencies.documentModelRegistry,
    attachmentSchemaCompiler,
    attachmentReferenceWriter,
  );
}

export function registerAttachmentReferenceReadModel(
  reactorBuilder: ReactorBuilder,
  registration: AttachmentReferenceReadModelRegistration,
): void {
  reactorBuilder.withReadModelFactory(
    async ({
      documentModelRegistry,
      operationIndex,
      writeCache,
      processorManagerConsistencyTracker,
    }) => {
      const readModel = createAttachmentReferenceReadModel(
        registration.baseKysely,
        {
          operationIndex,
          writeCache,
          processorManagerConsistencyTracker,
          documentModelRegistry,
        },
        registration.attachmentReferenceWriter,
      );
      await readModel.init();
      return readModel;
    },
  );
}

export async function registerAttachmentReferenceReadModelOnModule(
  clientModule: InProcessReactorClientModule,
  attachmentReferenceWriter: IAttachmentReferenceWriter,
): Promise<AttachmentReferenceProjectionCapability> {
  const reactorModule = clientModule.reactorModule;
  if (!reactorModule) {
    return {
      status: "unavailable",
      reason: "in-process-reactor-module-unavailable",
    };
  }

  const coordinator = reactorModule.readModelCoordinator;
  if (!supportsLiveReadModelRegistration(coordinator)) {
    return {
      status: "unavailable",
      reason: "live-read-model-registration-unsupported",
    };
  }

  const readModel = createAttachmentReferenceReadModel(
    reactorModule.database as unknown as Kysely<unknown>,
    {
      operationIndex: reactorModule.operationIndex,
      writeCache: reactorModule.writeCache,
      processorManagerConsistencyTracker:
        reactorModule.processorManagerConsistencyTracker,
      documentModelRegistry: reactorModule.documentModelRegistry,
    },
    attachmentReferenceWriter,
  );

  await readModel.init();
  coordinator.addReadModel(readModel, "pre_ready");
  await readModel.init();

  return { status: "available" };
}

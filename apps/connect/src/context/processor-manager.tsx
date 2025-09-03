import type { PGlite } from "@electric-sql/pglite";
import { live, type PGliteWithLive } from "@electric-sql/pglite/live";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { connectConfig } from "@powerhousedao/connect";
import type {
  IAnalyticsStore,
  Processors,
} from "@powerhousedao/reactor-browser";
import {
  AnalyticsProvider,
  useAnalyticsStoreAsync,
  useProcessorManager,
  useProcessors,
  useRelationalDb,
  useSetPGliteDB,
} from "@powerhousedao/reactor-browser";
import type { IRelationalDb, ProcessorManager } from "document-drive";
import { childLogger } from "document-drive";
import { generateUUIDBrowser } from "document-model";
import type { PropsWithChildren } from "react";
import { useEffect, useRef } from "react";
import PGWorker from "../workers/pglite-worker.js?worker";
import { processorFactory } from "@powerhousedao/common";
const logger = childLogger(["reactor-analytics"]);

function createPgLiteFactoryWorker(databaseName: string) {
  return async () => {
    const worker = new PGWorker({
      name: "pglite-worker",
    });

    worker.onmessage = (event) => {
      logger.verbose(event.data);
    };

    worker.onerror = (event) => {
      logger.error(event.message);
      throw event.error;
    };

    const pgLiteWorker = new PGliteWorker(worker, {
      meta: {
        databaseName,
      },
      extensions: {
        live,
      },
    });

    await pgLiteWorker.waitReady;

    return pgLiteWorker as unknown as PGlite;
  };
}

async function registerExternalProcessors(
  manager: ProcessorManager,
  analyticsStore: IAnalyticsStore,
  relationalDb: IRelationalDb,
  processorName: string,
  processorFactory: Processors,
) {
  return manager.registerFactory(
    processorName,
    processorFactory({ analyticsStore, relationalDb }),
  );
}

// async function registerDiffAnalyzer(
//   manager: ProcessorManager,
//   analyticsStore: IAnalyticsStore,
// ) {
//   const { processorFactory } = await import(
//     "@powerhousedao/diff-analyzer/processors"
//   );

//   const unsafeWrappedFactory = (driveHeader: PHDocumentHeader) => {
//     return processorFactory({ analyticsStore })(
//       driveHeader.id,
//     ) as ProcessorRecord[];
//   };

//   return manager.registerFactory(
//     "@powerhousedao/diff-analyzer",
//     unsafeWrappedFactory,
//   );
// }

async function registerDriveAnalytics(
  manager: ProcessorManager,
  analyticsStore: IAnalyticsStore,
) {
  return manager.registerFactory(
    "@powerhousedao/common/drive-analytics",
    processorFactory({ analyticsStore }),
  );
}

export function DiffAnalyzerProcessor() {
  const store = useAnalyticsStoreAsync();
  const manager = useProcessorManager();
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (!store.data || !manager || hasRegistered.current) {
      return;
    }

    hasRegistered.current = true;
    // registerDiffAnalyzer(manager, store.data).catch(logger.error);
  }, [store.data, manager]);

  return null;
}

export function DriveAnalyticsProcessor() {
  const store = useAnalyticsStoreAsync();
  const manager = useProcessorManager();
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (!store.data || !manager || hasRegistered.current) {
      return;
    }

    hasRegistered.current = true;
    registerDriveAnalytics(manager, store.data)
      .then(() => {
        logger.verbose("Drive analytics processor registered");
      })
      .catch(logger.error);
  }, [store.data, manager]);

  return null;
}

export function ExternalProcessors() {
  const processors = useProcessors();
  const store = useAnalyticsStoreAsync();
  const relationalDb = useRelationalDb();
  const manager = useProcessorManager();
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (
      !store.data ||
      !manager ||
      hasRegistered.current ||
      processors?.length === 0 ||
      !relationalDb.db
    ) {
      return;
    }

    hasRegistered.current = true;

    if (!processors) {
      return;
    }
    for (const processor of processors) {
      registerExternalProcessors(
        manager,
        store.data,
        relationalDb.db,
        generateUUIDBrowser(),
        processor,
      ).catch(logger.error);
    }
  }, [store.data, manager, relationalDb]);

  return null;
}

export function ProcessorManagerProvider({ children }: PropsWithChildren) {
  const pgLiteFactory = connectConfig.analytics.useWorker
    ? createPgLiteFactoryWorker(connectConfig.analytics.databaseName)
    : undefined;

  const setPGliteDB = useSetPGliteDB();

  // Initialize and handle PGlite factory
  useEffect(() => {
    if (!pgLiteFactory) {
      // If no factory, set to not loading with null db
      setPGliteDB({
        db: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    // Resolve the factory
    pgLiteFactory()
      .then((db) => {
        setPGliteDB({
          db: db as unknown as PGliteWithLive,
          isLoading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        setPGliteDB({
          db: null,
          isLoading: false,
          error,
        });
      });
  }, []);

  const content = (
    <>
      {connectConfig.analytics.diffProcessorEnabled && (
        <DiffAnalyzerProcessor />
      )}
      {connectConfig.analytics.driveAnalyticsEnabled && (
        <DriveAnalyticsProcessor />
      )}
      {connectConfig.analytics.externalProcessorsEnabled && (
        <ExternalProcessors />
      )}
      {children}
    </>
  );

  return (
    <AnalyticsProvider
      options={{
        databaseName: connectConfig.analytics.databaseName,
        pgLiteFactory,
      }}
    >
      {content}
    </AnalyticsProvider>
  );
}

export default ProcessorManagerProvider;

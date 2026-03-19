/**
 * Development script for running reactor-api locally.
 *
 * Starts an HTTP server with the GraphQL endpoint using in-memory storage
 * and PGlite for the read model (no external database required).
 *
 * Usage:
 *   pnpm dev
 *
 * Environment variables:
 *   PORT          - Server port (default: 4001)
 *   DB_PATH       - PGlite database path (default: in-memory)
 *   LOG_LEVEL     - Log level (default: info)
 */
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  DocumentAlreadyExistsError,
  InMemoryCache,
  ReactorBuilder as LegacyReactorBuilder,
  logger,
  MemoryStorage,
} from "document-drive";
import dotenv from "dotenv";
import { startAPI } from "./server.js";

dotenv.config();

const DEFAULT_PORT = 4001;
const DEFAULT_DRIVE = {
  id: "powerhouse",
  slug: "powerhouse",
  global: {
    name: "Powerhouse",
    icon: "https://ipfs.io/ipfs/QmcaTDBYn8X2psGaXe7iQ6qd8q6oqHLgxvMX9yXf7f9uP7",
  },
  local: {
    availableOffline: true,
    listeners: [],
    sharingType: "public" as const,
    triggers: [],
  },
};

async function main() {
  process.setMaxListeners(0);

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const dbPath = process.env.DB_PATH; // undefined = in-memory PGlite

  process.env.LOG_LEVEL = process.env.LOG_LEVEL || "info";

  // Build legacy drive server with in-memory storage
  const cache = new InMemoryCache();
  const storage = new MemoryStorage();
  const driveServer = new LegacyReactorBuilder([])
    .withCache(cache)
    .withStorage(storage)
    .withOptions({
      featureFlags: {
        enableDualActionCreate: true,
      },
    })
    .build();

  // Build reactor client
  const eventBus = new EventBus();
  const builder = new ReactorBuilder()
    .withEventBus(eventBus)
    .withChannelScheme(ChannelScheme.SWITCHBOARD);
  const clientModule = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .buildModule();

  const client = clientModule.client;
  const syncManager = clientModule.reactorModule?.syncModule?.syncManager;
  if (!syncManager) {
    throw new Error("SyncManager not available from ReactorClientBuilder");
  }

  const registry = clientModule.reactorModule?.documentModelRegistry;
  if (!registry) {
    throw new Error(
      "DocumentModelRegistry not available from ReactorClientBuilder",
    );
  }

  // Initialize drive server and add a default drive
  await driveServer.initialize();

  try {
    await driveServer.addDrive(DEFAULT_DRIVE);
  } catch (e) {
    if (!(e instanceof DocumentAlreadyExistsError)) {
      throw e;
    }
  }

  // Start the API
  await startAPI(
    driveServer,
    client,
    registry,
    syncManager,
    {
      port,
      dbPath,
      mcp: true,
      enableDocumentModelSubgraphs: true,
    },
    "switchboard",
  );

  const driveUrl = `http://localhost:${port}/d/${DEFAULT_DRIVE.id}`;

  logger.info(`  Reactor API running:`);
  logger.info(`    GraphQL:      http://localhost:${port}/graphql`);
  logger.info(`    Explorer:     http://localhost:${port}/explorer`);
  logger.info(`    Drive:        ${driveUrl}`);
  logger.info(`    Health:       http://localhost:${port}/health`);
  logger.info(`    MCP:          http://localhost:${port}/mcp`);
}

main().catch((err) => {
  console.error("Failed to start reactor-api dev server:", err);
  process.exit(1);
});

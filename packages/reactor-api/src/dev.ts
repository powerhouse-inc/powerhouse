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
import type { DocumentModelModule } from "document-model";
import { logger } from "document-model";
import dotenv from "dotenv";
import { initializeAndStartAPI } from "./server.js";

dotenv.config();

const DEFAULT_PORT = 4001;

async function main() {
  process.setMaxListeners(0);

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const dbPath = process.env.DB_PATH; // undefined = in-memory PGlite

  process.env.LOG_LEVEL = process.env.LOG_LEVEL || "info";

  const initializeClient = async (documentModels: DocumentModelModule[]) => {
    const eventBus = new EventBus();
    const builder = new ReactorBuilder()
      .withEventBus(eventBus)
      .withDocumentModels(documentModels)
      .withChannelScheme(ChannelScheme.SWITCHBOARD);

    return new ReactorClientBuilder().withReactorBuilder(builder).buildModule();
  };

  // Start the API
  await initializeAndStartAPI(
    initializeClient,
    {
      port,
      dbPath,
      mcp: true,
      enableDocumentModelSubgraphs: true,
    },
    "switchboard",
  );

  logger.info(`  Reactor API running:`);
  logger.info(`    GraphQL:      http://localhost:${port}/graphql`);
  logger.info(`    Explorer:     http://localhost:${port}/explorer`);
  logger.info(`    Health:       http://localhost:${port}/health`);
  logger.info(`    MCP:          http://localhost:${port}/mcp`);
}

main().catch((err) => {
  console.error("Failed to start reactor-api dev server:", err);
  process.exit(1);
});

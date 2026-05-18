// Opt-in: excluded from default vitest runs by vitest.config.ts; enable with
// RUN_HUB_SPOKE_INTEGRATION=1. Requires a Postgres reachable at the host/port
// in REACTOR_TEST_PG_* (defaults to localhost:5433 via `pnpm --filter
// @powerhousedao/reactor docker:up`) and outbound access to PH_REGISTRY_URL.
import { type ISyncManager, type ReactorModule } from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { httpsHooksPath } from "@powerhousedao/reactor-api/https-hooks";
import { HttpPackageLoader } from "../src/packages/http-loader.js";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";
import {
  type FixtureMetadata,
  assertSpokeMatchesHub,
  buildHubModule,
  buildSpokeModule,
  registerHubAsRemote,
  waitForAllSpokesConverged,
} from "./utils/hub-spoke-helpers.js";
import {
  createPostgresKysely,
  createTestDatabase,
  deriveFixtureMetadataFromDb,
  dropTestDatabase,
  purgeDeletedDocuments,
  readPostgresTestConfigFromEnv,
  requireDockerComposePostgres,
  restoreFromDump,
} from "./utils/postgres-test-db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRIVE_TYPES = [
  {
    driveType: "powerhouse/document-drive",
    dumpFile: "hub-large-doc.dump",
    metadataFile: "hub-large-doc.fixture.json",
  },
  {
    driveType: "powerhouse/reactor-drive",
    dumpFile: "hub-large-doc-reactor-drive.dump",
    metadataFile: "hub-large-doc-reactor-drive.fixture.json",
  },
] as const;

const DEFAULT_BRANCH = "main";
const CONVERGENCE_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 300_000;
const REGISTRY_URL =
  process.env.PH_REGISTRY_URL ?? "https://registry.dev.vetra.io/";

const PINNED_KNOWLEDGE_NOTE_SPEC = "@powerhousedao/knowledge-note@1.0.32";

describe.each(DRIVE_TYPES)(
  "hub-spoke catch-up [$driveType]",
  ({ driveType, dumpFile, metadataFile }) => {
    const FIXTURE_DUMP_PATH = path.resolve(__dirname, "fixtures", dumpFile);
    const FIXTURE_METADATA_PATH = path.resolve(
      __dirname,
      "fixtures",
      metadataFile,
    );

    const fixtureAvailable = existsSync(FIXTURE_DUMP_PATH);
    if (!fixtureAvailable) {
      console.warn(
        `[hub-spoke-catchup ${driveType}] skipping: fixture not found at ${FIXTURE_DUMP_PATH}. ` +
          `Capture one with: PH_REACTOR_DATABASE_URL=<url> pnpm --filter @powerhousedao/reactor-api capture-hub-dump --drive-type ${driveType}`,
      );
      it.skip(`fixture missing for ${driveType}`, () => {});
      return;
    }

    const config = readPostgresTestConfigFromEnv();
    const dbName = `reactor_test_hubspoke_${process.pid}_${Date.now()}`;
    const logger = new ConsoleLogger([`hub-spoke-test:${driveType}`]);

    let metadata: FixtureMetadata;
    let hub: ReactorModule | undefined;
    let hubKysely: Kysely<unknown> | undefined;
    let hubPool: Pool | undefined;
    let httpLoader: HttpPackageLoader;
    let pinnedModules: DocumentModelModule[] = [];
    const realFetch = globalThis.fetch.bind(globalThis);

    beforeAll(async () => {
      register(httpsHooksPath, import.meta.url);
      httpLoader = new HttpPackageLoader({ registryUrl: REGISTRY_URL });

      pinnedModules = await httpLoader.loadDocumentModels(
        PINNED_KNOWLEDGE_NOTE_SPEC,
      );
      logger.info(
        `pinned ${pinnedModules.length} document model(s) from ${PINNED_KNOWLEDGE_NOTE_SPEC}`,
      );

      await requireDockerComposePostgres(config);

      const connStr = await createTestDatabase(dbName, config);
      await restoreFromDump(connStr, FIXTURE_DUMP_PATH, dbName);
      const purged = await purgeDeletedDocuments(connStr);
      if (purged.length > 0) {
        logger.info(
          `purged ${purged.length} deleted document(s) from test DB`,
        );
      }

      const fileMetadata = JSON.parse(
        readFileSync(FIXTURE_METADATA_PATH, "utf-8"),
      ) as FixtureMetadata;
      const derived = await deriveFixtureMetadataFromDb(connStr, driveType);
      logger.info(
        `derived metadata: ${derived.documents.length} docs / ${derived.totalOpCount} ops (sidecar: ${fileMetadata.documents.length} docs / ${fileMetadata.totalOpCount} ops)`,
      );
      metadata = derived as FixtureMetadata;

      const handle = createPostgresKysely(connStr);
      hubKysely = handle.kysely as unknown as Kysely<unknown>;
      hubPool = handle.pool;

      hub = await buildHubModule(
        logger,
        handle.kysely,
        httpLoader.documentModelLoader,
        pinnedModules,
      );
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      globalThis.fetch = realFetch;
      if (hub) {
        hub.reactor.kill();
      }
      if (hubKysely) {
        await hubKysely.destroy();
      }
      if (hubPool) {
        await hubPool.end().catch(() => undefined);
      }
      await dropTestDatabase(dbName, config);
    }, TEST_TIMEOUT_MS);

    it.each([1, 3])(
      "converges %i spoke(s) to hub state from pre-seeded dump",
      async (spokeCount) => {
        vi.useFakeTimers();
        try {
          if (!hub) throw new Error("hub not initialized");
          const hubModule = hub;
          const drives = metadata.documents.filter(
            (d) => d.documentType === driveType,
          );
          expect(
            drives.length,
            "fixture must contain at least one drive document",
          ).toBeGreaterThan(0);

          const branches = new Set(
            metadata.opCountsByDocScopeBranch.map((e) => e.branch),
          );
          if (branches.size === 0) {
            branches.add(DEFAULT_BRANCH);
          }

          const syncRegistry = new Map<string, ISyncManager>();
          syncRegistry.set("hub", hubModule.syncModule!.syncManager);
          const bridge = createResolverBridge(syncRegistry, {
            log: false,
            passthroughFetch: realFetch,
          });

          globalThis.fetch = bridge;

          const spokes: ReactorModule[] = [];
          for (let i = 0; i < spokeCount; i++) {
            spokes.push(
              await buildSpokeModule(
                logger,
                httpLoader.documentModelLoader,
                pinnedModules,
              ),
            );
          }

          try {
            for (let i = 0; i < spokes.length; i++) {
              const spoke = spokes[i];
              for (const drive of drives) {
                for (const branch of branches) {
                  await registerHubAsRemote(
                    spoke,
                    `hub-${drive.id}-${branch}-${i}`,
                    drive.id,
                    branch,
                    bridge,
                  );
                }
              }
            }

            await waitForAllSpokesConverged(spokes, metadata, {
              timeoutMs: CONVERGENCE_TIMEOUT_MS,
              advanceFn: async (ms: number) => {
                await vi.advanceTimersByTimeAsync(ms);
              },
              stepMs: 100,
            });

            for (let i = 0; i < spokes.length; i++) {
              await assertSpokeMatchesHub(spokes[i], hubModule, metadata, i);
            }
          } finally {
            for (const spoke of spokes) {
              spoke.reactor.kill();
            }
          }
        } finally {
          vi.useRealTimers();
        }
      },
      TEST_TIMEOUT_MS,
    );
  },
);

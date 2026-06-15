import {
  DocumentModelRegistry,
  DocumentModelResolver,
  EventBus,
  GqlRequestChannelFactory,
  GqlResponseChannelFactory,
  InMemoryQueue,
  NullDocumentModelResolver,
  ReactorBuilder,
  SyncBuilder,
  DriveCollectionId,
  type IDocumentModelLoader,
  type IDocumentModelResolver,
  type IReactor,
  type ReactorModule,
} from "@powerhousedao/reactor";
import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { ConsoleLogger } from "document-model";
import { type Kysely } from "kysely";
import type { Database } from "@powerhousedao/reactor";
import { expect } from "vitest";

export type FixtureMetadata = {
  capturedAt: string;
  sourceDescription: string;
  documents: Array<{
    id: string;
    documentType: string;
    slug: string | null;
  }>;
  opCountsByDocScopeBranch: Array<{
    documentId: string;
    scope: string;
    branch: string;
    opCount: number;
    latestTimestampUtcMs: string | null;
  }>;
  totalOpCount: number;
};

const REGISTERED_DOCUMENT_MODELS = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
  reactorDriveDocumentModelModule,
] as unknown as DocumentModelModule[];

export function getRegisteredDocumentModelTypes(): string[] {
  return REGISTERED_DOCUMENT_MODELS.map(
    (module) =>
      (module as unknown as { documentModel: { id: string } }).documentModel.id,
  );
}

function buildResolver(
  registry: DocumentModelRegistry,
  documentModelLoader?: IDocumentModelLoader,
): IDocumentModelResolver {
  if (documentModelLoader) {
    return new DocumentModelResolver(registry, documentModelLoader);
  }
  return new NullDocumentModelResolver(registry);
}

export async function buildHubModule(
  logger: ConsoleLogger,
  kysely: Kysely<Database>,
  documentModelLoader?: IDocumentModelLoader,
  extraModules: DocumentModelModule[] = [],
): Promise<ReactorModule> {
  const eventBus = new EventBus();
  const modelRegistry = new DocumentModelRegistry();
  const allModules = [...REGISTERED_DOCUMENT_MODELS, ...extraModules];
  modelRegistry.registerModules(...allModules);
  const resolver = buildResolver(modelRegistry, documentModelLoader);
  const queue = new InMemoryQueue(eventBus, resolver);

  const builder = new ReactorBuilder()
    .withEventBus(eventBus)
    .withQueue(queue)
    .withKysely(kysely)
    .withMigrationStrategy("none")
    .withDocumentModels(allModules)
    .withSync(
      new SyncBuilder().withChannelFactory(
        new GqlResponseChannelFactory(logger),
      ),
    );

  if (documentModelLoader) {
    builder.withDocumentModelLoader(documentModelLoader);
  }

  return builder.buildModule();
}

export async function buildSpokeModule(
  logger: ConsoleLogger,
  documentModelLoader?: IDocumentModelLoader,
  extraModules: DocumentModelModule[] = [],
): Promise<ReactorModule> {
  const eventBus = new EventBus();
  const modelRegistry = new DocumentModelRegistry();
  const allModules = [...REGISTERED_DOCUMENT_MODELS, ...extraModules];
  modelRegistry.registerModules(...allModules);
  const resolver = buildResolver(modelRegistry, documentModelLoader);
  const queue = new InMemoryQueue(eventBus, resolver);

  const builder = new ReactorBuilder()
    .withEventBus(eventBus)
    .withQueue(queue)
    .withDocumentModels(allModules)
    .withSync(
      new SyncBuilder().withChannelFactory(
        new GqlRequestChannelFactory(logger, undefined, queue),
      ),
    );

  if (documentModelLoader) {
    builder.withDocumentModelLoader(documentModelLoader);
  }

  return builder.buildModule();
}

export async function registerHubAsRemote(
  spoke: ReactorModule,
  remoteName: string,
  documentId: string,
  branch: string,
  fetchFn: typeof fetch,
): Promise<void> {
  await spoke.syncModule!.syncManager.add(
    remoteName,
    DriveCollectionId.forDrive(documentId, branch),
    {
      type: "gql",
      parameters: {
        url: "http://hub/graphql",
        pollIntervalMs: 25,
        retryBaseDelayMs: 10,
        retryMaxDelayMs: 200,
        fetchFn,
      },
    },
    { documentId: [], scope: [], branch },
  );
}

type CountsByKey = Map<string, number>;

function buildExpectedCounts(metadata: FixtureMetadata): CountsByKey {
  const map: CountsByKey = new Map();
  for (const entry of metadata.opCountsByDocScopeBranch) {
    map.set(
      `${entry.documentId}:${entry.scope}:${entry.branch}`,
      entry.opCount,
    );
  }
  return map;
}

async function getActualCounts(
  reactor: IReactor,
  metadata: FixtureMetadata,
): Promise<CountsByKey> {
  const counts: CountsByKey = new Map();
  const branches = new Set(
    metadata.opCountsByDocScopeBranch.map((e) => e.branch),
  );

  for (const doc of metadata.documents) {
    for (const branch of branches) {
      let opsByScope: Record<string, { results: unknown[] }>;
      try {
        opsByScope = (await reactor.getOperations(doc.id, {
          branch,
        })) as Record<string, { results: unknown[] }>;
      } catch {
        continue;
      }
      for (const [scope, paged] of Object.entries(opsByScope)) {
        counts.set(`${doc.id}:${scope}:${branch}`, paged.results.length);
      }
    }
  }

  return counts;
}

export async function waitForAllSpokesConverged(
  spokes: ReactorModule[],
  metadata: FixtureMetadata,
  options: {
    timeoutMs: number;
    advanceFn: (ms: number) => Promise<void>;
    stepMs?: number;
  },
): Promise<void> {
  const stepMs = options.stepMs ?? 100;
  const expected = buildExpectedCounts(metadata);
  const deadline = Date.now() + options.timeoutMs;
  let lastShortfall = "";

  while (Date.now() < deadline) {
    let allConverged = true;
    lastShortfall = "";

    for (let i = 0; i < spokes.length; i++) {
      const counts = await getActualCounts(spokes[i].reactor, metadata);
      for (const [key, expectedCount] of expected) {
        const actual = counts.get(key) ?? 0;
        if (actual < expectedCount) {
          allConverged = false;
          lastShortfall = `spoke[${i}] ${key}: ${actual}/${expectedCount}`;
          break;
        }
      }
      if (!allConverged) break;
    }

    if (allConverged) return;

    await options.advanceFn(stepMs);
  }

  const deadLettersBySpoke = spokes.map((spoke, i) => {
    const items =
      spoke.syncModule?.syncManager.list().flatMap((r) =>
        r.channel.deadLetter.items.map((d) => {
          const err: unknown = d.error;
          const detail =
            err instanceof Error ? err.message : JSON.stringify(err);
          return `${d.documentId}/${d.scopes.join(",")}: ${detail}`;
        }),
      ) ?? [];
    return items.length > 0
      ? `spoke[${i}] dead letters: ${items.join("; ")}`
      : `spoke[${i}] dead letters: (none)`;
  });

  throw new Error(
    `Spokes failed to converge within ${options.timeoutMs}ms. Last shortfall: ${lastShortfall || "(none captured)"}\n${deadLettersBySpoke.join("\n")}`,
  );
}

export async function assertSpokeMatchesHub(
  spoke: ReactorModule,
  hub: ReactorModule,
  metadata: FixtureMetadata,
  spokeIndex: number,
): Promise<void> {
  const branches = new Set(
    metadata.opCountsByDocScopeBranch.map((e) => e.branch),
  );

  for (const doc of metadata.documents) {
    for (const branch of branches) {
      const docMetadataForBranch = metadata.opCountsByDocScopeBranch.filter(
        (e) => e.documentId === doc.id && e.branch === branch,
      );
      if (docMetadataForBranch.length === 0) continue;

      const hubOpsByScope = await hub.reactor.getOperations(doc.id, {
        branch,
      });
      const spokeOpsByScope = await spoke.reactor.getOperations(doc.id, {
        branch,
      });

      const hubMap = hubOpsByScope as Record<
        string,
        { results: unknown[] } | undefined
      >;
      const spokeMap = spokeOpsByScope as Record<
        string,
        { results: unknown[] } | undefined
      >;
      for (const meta of docMetadataForBranch) {
        const hubBucket = hubMap[meta.scope];
        const spokeBucket = spokeMap[meta.scope];
        const hubOps = hubBucket ? hubBucket.results : [];
        const spokeOps = spokeBucket ? spokeBucket.results : [];

        expect(
          spokeOps.length,
          `spoke[${spokeIndex}] ${doc.id}:${meta.scope}:${branch} op count`,
        ).toBe(hubOps.length);

        for (let i = 0; i < spokeOps.length; i++) {
          const spokeOp = spokeOps[i] as {
            id: string;
            skip: number;
            index: number;
          };
          const hubOp = hubOps[i] as { id: string; index: number };

          expect(
            spokeOp.skip,
            `spoke[${spokeIndex}] ${doc.id}:${meta.scope}:${branch}[${i}] skip`,
          ).toBe(0);

          expect(
            spokeOp.id,
            `spoke[${spokeIndex}] ${doc.id}:${meta.scope}:${branch}[${i}] id`,
          ).toBe(hubOp.id);

          expect(
            spokeOp.index,
            `spoke[${spokeIndex}] ${doc.id}:${meta.scope}:${branch}[${i}] index`,
          ).toBe(hubOp.index);
        }
      }

      const hubDoc = (await hub.reactor.get(doc.id, { branch })) as PHDocument;
      const spokeDoc = (await spoke.reactor.get(doc.id, {
        branch,
      })) as PHDocument;

      expect(
        spokeDoc.state,
        `spoke[${spokeIndex}] ${doc.id} branch=${branch} state`,
      ).toEqual(hubDoc.state);
    }
  }

  const deadLetters =
    spoke.syncModule?.syncManager
      .list()
      .flatMap((r) => r.channel.deadLetter.items) ?? [];

  expect(
    deadLetters.length,
    `spoke[${spokeIndex}] dead letters: ${deadLetters
      .map((d) => `${d.documentId}/${d.scopes.join(",")}`)
      .join("; ")}`,
  ).toBe(0);
}

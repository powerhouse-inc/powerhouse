import { generateSubgraph } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";
import {
  initAndFlush,
  makeDriveModule,
  makeHarness,
  makeHarnessLogger,
  makeMockReactorClient,
} from "../../../packages/reactor-api/test/utils/graphql-manager-harness.js";
import { StitchingGatewayAdapter } from "../../../packages/reactor-api/src/graphql/gateway/adapter-gateway-stitching.js";
import type { SubgraphClass } from "../../../packages/reactor-api/src/graphql/types.js";

const REPOSITORY = resolve(import.meta.dirname, "..", "..", "..");
const REACTOR_API = join(REPOSITORY, "packages", "reactor-api");

const disposals: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

const REVIEW_ITEM_MODEL = `import { defineDocumentModel, ph } from "document-model";
export const model = defineDocumentModel({
  id: "review/item",
  name: "ReviewItem",
  description: "",
  extension: "review",
  version: 1,
  author: { name: "Review", website: null },
  specifications: {
    global: {
      schema: ph.object("ReviewItemState", { fields: { title: ph.String() } }),
      initialValue: { title: null },
    },
    local: { schema: null, initialValue: {} },
  },
}).finalize({ modules: [] });
`;

function reviewItemPackage(): string {
  const { root, dispose } = materializeFixturePackage("schema-first");
  disposals.push(dispose);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "model.ts"), REVIEW_ITEM_MODEL);
  writeFileSync(
    join(root, "powerhouse.config.json"),
    JSON.stringify({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/model.ts" }],
      },
    }),
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "@review/package",
      version: "0.0.0",
      type: "module",
    }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }),
  );
  const modules = join(root, "node_modules");
  mkdirSync(join(modules, "@powerhousedao"), { recursive: true });
  symlinkSync(REACTOR_API, join(modules, "@powerhousedao", "reactor-api"));
  symlinkSync(
    join(REPOSITORY, "packages", "shared"),
    join(modules, "@powerhousedao", "shared"),
  );
  symlinkSync(
    realpathSync(join(REACTOR_API, "node_modules", "graphql")),
    join(modules, "graphql"),
  );
  return root;
}

it("serves a generated subgraph beside a ReviewItem document model", async () => {
  const root = reviewItemPackage();
  const project = buildTsMorphProject(root);
  await generateSubgraph("review", project);
  await project.save();

  const { model } = (await import(join(root, "src", "model.ts"))) as {
    model: DocumentModelModule;
  };
  const { ReviewSubgraph } = (await import(
    join(root, "subgraphs", "review", "index.ts")
  )) as { ReviewSubgraph: SubgraphClass };

  vi.useFakeTimers();
  const logger = makeHarnessLogger();
  const { manager, gatewayAdapter } = makeHarness({
    logger,
    enableDocumentModelSubgraphs: true,
    reactorClient: makeMockReactorClient({
      getDocumentModelModules: vi
        .fn()
        .mockResolvedValue({ results: [makeDriveModule(), model] }),
    }),
  });
  const gateway = new StitchingGatewayAdapter(logger);
  gatewayAdapter.createHandler.mockImplementation(
    gateway.createHandler.bind(gateway),
  );
  try {
    await initAndFlush(manager);
    const registered = await manager.registerSubgraph(
      ReviewSubgraph,
      "graphql",
      false,
      "@review/package",
    );
    const routed = manager.updateRouter();
    await vi.runAllTimersAsync();
    await routed;

    expect(registered).toBeInstanceOf(ReviewSubgraph);
    expect(logger.error).not.toHaveBeenCalled();
    vi.useRealTimers();
    await expect(
      manager.executeSubgraphQuery(
        "review",
        'query { reviewItem(id: "item-1") { id label } __type(name: "ReviewItem") { name } }',
        {},
      ),
    ).resolves.toEqual({
      reviewItem: { id: "item-1", label: "Example" },
      __type: { name: "ReviewItem" },
    });
  } finally {
    vi.useRealTimers();
    await manager.shutdown();
    await gateway.stop();
  }
}, 60_000);

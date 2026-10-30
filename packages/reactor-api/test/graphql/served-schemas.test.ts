/**
 * Regenerate after an intended change, from the repository root. Removing the
 * goldens first drops those of endpoints no longer served:
 *
 *   rm -rf packages/reactor-api/test/graphql/goldens apps/switchboard/test/goldens && \
 *   UPDATE_GOLDENS=1 pnpm --workspace-concurrency=1 \
 *     --filter @powerhousedao/reactor-api --filter @powerhousedao/switchboard \
 *     exec vitest run served-schemas && pnpm exec oxfmt \
 *     packages/reactor-api/test/graphql/goldens apps/switchboard/test/goldens
 */
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createServedSchemaHost,
  expectSchemaGolden,
  jsonGolden,
  type ServedSchemaHost,
  type ServedSchemas,
} from "./served-schemas.js";

const goldens = (file: string) =>
  fileURLToPath(new URL(`./goldens/${file}`, import.meta.url));

const SUBGRAPHS = [
  "analytics",
  "auth",
  "document-drive",
  "document-model",
  "inspection",
  "inspection-admin",
  "r",
  "system",
];

let host: ServedSchemaHost | undefined;
let served: ServedSchemas;

beforeAll(async () => {
  host = await createServedSchemaHost();
  served = await host.serve();
}, 60_000);

afterAll(async () => {
  await host?.close();
});

describe("reactor-api served schemas", () => {
  it("mounts every core subgraph over HTTP and the reactor's SSE streams, and routes WebSocket subscriptions to the reactor", () => {
    expect(served.mounts).toEqual({
      graphql: ["/graphql", ...SUBGRAPHS.map((name) => `/graphql/${name}`)],
      sse: ["/graphql/r/stream", "/graphql/stream"],
    });
    expect(served.websocketRoutes).toEqual(["/graphql/r"]);
  });

  it.each(SUBGRAPHS)("serves /graphql/%s as its golden", async (name) => {
    const schema = served.subgraphs.get(name);
    assert(schema, `/graphql/${name} is not served`);
    await expectSchemaGolden(schema, goldens(`${name}.graphql`));
  });

  it("serves /graphql as supergraph.graphql", async () => {
    await expectSchemaGolden(served.supergraph, goldens("supergraph.graphql"));
  });

  it("binds the resolvers in resolvers.json", async () => {
    expect(served.resolvers).toEqual(
      await jsonGolden(goldens("resolvers.json"), served.resolvers),
    );
  });
});

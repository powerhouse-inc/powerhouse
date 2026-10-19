import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { legacySubgraphHints } from "../src/services/definitions/legacy-subgraph-hint.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

function packageWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ph-legacy-hint-"));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

const RELEASED = `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { schema } from "./schema.js";
import { getResolvers } from "./resolvers.js";

export class ExampleSubgraph extends BaseSubgraph {
  name = "example";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
`;

it("names the old-style fields of the released subgraph template from tsc's errors", () => {
  const root = packageWith({ "subgraphs/example/index.ts": RELEASED });
  const output = `subgraphs/example/index.ts(7,3): error TS2416: Property 'name' in type 'ExampleSubgraph' is not assignable to the same property in base type 'BaseSubgraph<Context$1>'.
  Type 'string' is not assignable to type 'undefined'.
subgraphs/example/index.ts(7,3): error TS4114: This member must have an 'override' modifier because it overrides a member in the base class 'BaseSubgraph<Context$1>'.
subgraphs/example/index.ts(8,3): error TS4114: This member must have an 'override' modifier because it overrides a member in the base class 'BaseSubgraph<Context$1>'.
subgraphs/example/index.ts(9,28): error TS2345: Argument of type 'this' is not assignable to parameter of type 'BaseSubgraph<Context$1>'.
subgraphs/example/index.ts(11,9): error TS4114: This member must have an 'override' modifier because it overrides a member in the base class 'BaseSubgraph<Context$1>'.
`;

  expect(legacySubgraphHints(output, root)).toEqual([
    "subgraphs/example/index.ts declares the old-style subgraph fields name, typeDefs. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
  ]);
});

it("counts an assignment to this.<field> in a BaseSubgraph file, and nothing else", () => {
  const root = packageWith({
    "subgraphs/assigned/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
export class AssignedSubgraph extends BaseSubgraph {
  constructor() {
    super();
    this.path = "/old";
  }
}
`,
    "src/other.ts": `export class Other {
  readonly name = "x";
  rename() {
    this.name = "y";
  }
}
`,
  });
  const output = `subgraphs/assigned/index.ts(5,10): error TS2540: Cannot assign to 'path' because it is a read-only property.
src/other.ts(4,10): error TS2540: Cannot assign to 'name' because it is a read-only property.
src/other.ts(2,3): error TS2416: Property 'name' in type 'Other' is not assignable to the same property in base type 'Base'.
`;

  expect(legacySubgraphHints(output, root)).toEqual([
    "subgraphs/assigned/index.ts declares the old-style subgraph field path. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
  ]);
});

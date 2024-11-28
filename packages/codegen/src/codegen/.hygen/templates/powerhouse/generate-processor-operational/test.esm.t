---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/test/example.test.ts"
force: true
---

import { options, transmit } from "../src/listener";
import { actions } from "../../../document-models/document-model";
import { drizzle } from "drizzle-orm/connect";
import { exampleTable } from "../src/schema";
import { PgDatabase } from "drizzle-orm/pg-core";
import { resolvers } from "../src/resolvers";
import { buildSchema, graphql } from "graphql";
import { typeDefs } from "../src";
import { describe, it, beforeAll, afterAll } from "vitest";

describe("processor example test", () => {
  let db: PgDatabase<any, any, any>;
  beforeAll(async () => {
    db = await drizzle("pglite", "./dev.db");
    await db.delete(exampleTable).execute();
  });

  it("should count amount of operations", async () => {
    const exampleEntry = actions.addExampleEntry({
      value: 100,
      id: "cc29b53f-57a0-4ee3-b3cf-b4fb08170c47",
      projectCode: "POW-001",
      description: "1",
    });

    await transmit(
      [
        {
          branch: "main",
          documentId: "1",
          driveId: "1",
          operations: [{ ...exampleEntry, timestamp: "1", index: 1, skip: 0, hash: "1" }],
          scope: "global",
          state: {},
        },
      ],
      db
    );

    const [result] = await db.select().from(exampleTable);
    expect(result.value).toBe(1);
  });

});

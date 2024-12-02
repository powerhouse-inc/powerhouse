---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/test/example.test.ts"
force: true
---
import { actions } from "document-model-libs/document-drive";
import { drizzle } from "drizzle-orm/connect";
import { PgDatabase } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";
import { exampleTable } from "../src/db-schema";
import { transmit } from "../src/transmit";

describe("processor example test", () => {
  let db: PgDatabase<any, any, any>;
  beforeAll(async () => {
    db = await drizzle("pglite", "./dev.db");
    await db.delete(exampleTable).execute();
  });

  it("should count amount of operations", async () => {
    const exampleEntry = actions.addFile({
      documentType: "example",
      id: "1",
      name: "example",
      synchronizationUnits: [],
    });

    await transmit(
      [
        {
          branch: "main",
          documentId: "1",
          driveId: "1",
          operations: [
            { ...exampleEntry, timestamp: "1", index: 1, skip: 0, hash: "1" },
          ],
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

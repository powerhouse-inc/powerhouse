import { options, transmit } from "../src/listener";
import { actions } from "../../../document-models/contributor-bill";
import { drizzle } from "drizzle-orm/connect";
import { powtCompensation, powtLineItem } from "../src/schema";
import { PgDatabase } from "drizzle-orm/pg-core";
import { resolvers } from "../src/resolvers";
import { buildSchema, graphql } from "graphql";
import { typeDefs } from "../src";
import { describe, it, beforeAll, afterAll } from "vitest";

describe("powt calculation", () => {
  let db: PgDatabase<any, any, any>;
  beforeAll(async () => {
    db = await drizzle("pglite", "./dev.db");
    await db.delete(powtCompensation).execute();
    await db.delete(powtLineItem).execute();
  });

  afterAll(async () => {});

  it("should add powt line item", async () => {
    const powtLineItem = actions.addPowtLineItem({
      amount: 100,
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
          operations: [
            { ...powtLineItem, timestamp: "1", index: 1, skip: 0, hash: "1" },
          ],
          scope: "global",
          state: {},
        },
      ],
      db
    );

    const powtLineItem2 = actions.addPowtLineItem({
      amount: 100,
      id: "3f4c9d93-f344-4cfe-8e6d-bf7387f39097",
      projectCode: "POW-001",
      description: "1",
    });
    await transmit(
      [
        {
          branch: "main",
          documentId: "1",
          driveId: "1",
          operations: [
            {
              ...powtLineItem2,
              timestamp: "1",
              index: 2,
              skip: 0,
              hash: "1",
            },
          ],
          scope: "global",
          state: {},
        },
      ],
      db
    );

    const result = await db.select().from(powtCompensation);
    expect(result[0].amount).toBe(200);
  });

  it("should update powt line item", async () => {
    const powtLineItem2 = actions.updatePowtLineItem({
      amount: 10,
      lineItemId: "3f4c9d93-f344-4cfe-8e6d-bf7387f39097",
      projectCode: "POW-001",
    });

    await transmit(
      [
        {
          branch: "main",
          documentId: "1",
          driveId: "1",
          operations: [
            { ...powtLineItem2, timestamp: "1", index: 3, skip: 0, hash: "1" },
          ],
          scope: "global",
          state: {},
        },
      ],
      db
    );

    const result = await db.select().from(powtCompensation);

    expect(result[0].amount).toBe(110);
  });

  it("should delete powt line item", async () => {
    const powtLineItem2 = actions.deletePowtLineItem({
      lineItemId: "3f4c9d93-f344-4cfe-8e6d-bf7387f39097",
    });

    await transmit(
      [
        {
          operations: [
            { ...powtLineItem2, timestamp: "1", index: 4, skip: 0, hash: "1" },
          ],
          driveId: "1",
          documentId: "1",
          branch: "main",
          scope: "global",
          state: {},
        },
      ],
      db
    );

    const result = await db.select().from(powtCompensation);

    expect(result[0].amount).toBe(100);
  });

  it("should get powt compensation", async () => {
    const [entry] = await resolvers.Query.powtComp(
      null,
      { projectCode: "POW-001" },
      { db }
    );

    expect(entry.amount).toBe(100);
  });

  it.only("should get powt compentation with graphql query", async () => {
    const schema = buildSchema(typeDefs);
    const { data, errors } = await graphql({
      schema,
      source: `{ powtComp { amount } } `,
      rootValue: {
        resolvers,
      },
    });

    expect(errors).toBeNull();
    expect(data).toBeDefined();

    const powtComp = data?.powtComp;

    // @ts-ignore
    expect(powtComp[0].amount).toBe(100);
  });
});

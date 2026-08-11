import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  runMigrations,
  type IReactorClient,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  addMember,
  ReactorGroup,
  removeMember,
  setGroupName,
  utils,
  type ReactorGroupDocument,
} from "document-models/reactor-group/v1";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ReactorGroup reactor integration", () => {
  let pg: PGlite;
  let db: Kysely<unknown>;
  let client: IReactorClient;
  let killReactor: () => void;

  beforeEach(async () => {
    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<unknown>({ dialect: new PGliteDialect(pg) });
    const result = await runMigrations(db, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Reactor migration failed: ${result.error.message}`);
    }

    const reactorBuilder = new ReactorBuilder()
      .withDocumentModelSources([
        ReactorGroup as unknown as DocumentModelModule,
        documentModelDocumentModelModule,
      ])
      .withKysely(db as never)
      .withMigrationStrategy("manual");

    const built = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();
    client = built.client;
    killReactor = () => built.reactor.kill();
  });

  afterEach(async () => {
    killReactor();
    await db.destroy();
    await pg.close();
  });

  it("creates a group document and folds membership operations", async () => {
    const document = utils.createDocument();
    document.header.name = "Legal Assistants";

    const created = await client.create<ReactorGroupDocument>(document);
    expect(created.header.documentType).toBe("powerhouse/reactor-group");

    const afterAdd = await client.execute<ReactorGroupDocument>(
      created.header.id,
      "main",
      [
        setGroupName({ name: "Legal Assistants" }),
        addMember({ address: "0xAbC1" }),
        addMember({ address: "0xDeF2" }),
      ],
    );
    expect(afterAdd.state.global.name).toBe("Legal Assistants");
    expect(afterAdd.state.global.members).toEqual(["0xAbC1", "0xDeF2"]);

    const afterRemove = await client.execute<ReactorGroupDocument>(
      created.header.id,
      "main",
      [removeMember({ address: "0XABC1" })],
    );
    expect(afterRemove.state.global.members).toEqual(["0xDeF2"]);

    const fetched = await client.get<ReactorGroupDocument>(created.header.id);
    expect(fetched.state.global.members).toEqual(["0xDeF2"]);
  });
});

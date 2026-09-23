import { PGlite } from "@electric-sql/pglite";
import type { DocumentPurgeService } from "@powerhousedao/reactor";
import {
  ConsistencyTracker,
  KyselyDocumentPurger,
  REACTOR_SCHEMA,
  runMigrations,
  type IOperationIndex,
  type IWriteCache,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyService } from "../src/privacy-service.js";
import { SubjectDocumentsReadModel } from "../src/subject-documents-read-model.js";
import { GROUP_DOCUMENT_TYPE, jwkIdentifier } from "../src/subject.js";
import { op, SECRET, signer } from "./helpers.js";

const X = "0xAbC0000000000000000000000000000000000001";
const Y = "0x00000000000000000000000000000000000000b2";
const Z = "0x00000000000000000000000000000000000000C3";
const MEMBER = "0x00000000000000000000000000000000000000d4";
const KEY_X = "did:key:zAppX";
const KEY_Y = "did:key:zAppY";
const KEY_DISTINCT = "did:key:zDistinct";
const JWK = { kty: "EC", crv: "P-256", x: "abc", y: "def" };

describe("documents by subject", () => {
  let baseDb: Kysely<unknown>;
  let model: SubjectDocumentsReadModel;
  let privacy: PrivacyService;

  beforeEach(async () => {
    baseDb = new Kysely<unknown>({ dialect: new PGliteDialect(new PGlite()) });
    const migrated = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!migrated.success && migrated.error) throw migrated.error;

    model = new SubjectDocumentsReadModel(
      baseDb,
      REACTOR_SCHEMA,
      {
        getSinceOrdinal: vi.fn().mockResolvedValue({ results: [] }),
      } as unknown as IOperationIndex,
      {} as IWriteCache,
      new ConsistencyTracker(),
      SECRET,
    );
    await model.init();

    privacy = new PrivacyService({
      db: baseDb.withSchema(REACTOR_SCHEMA),
      purgeService: {} as DocumentPurgeService,
      secret: SECRET,
    });

    const history: OperationWithContext[] = [
      op({
        ordinal: 1,
        documentId: "doc-a",
        type: "CREATE_DOCUMENT",
        scope: "document",
        input: { signing: { publicKey: JWK } },
        signer: signer(X, KEY_X),
      }),
      op({
        ordinal: 2,
        documentId: "doc-a",
        type: "SET_NAME",
        signer: signer(X, KEY_X),
      }),
      op({
        ordinal: 3,
        documentId: "doc-b",
        type: "SET_NAME",
        signer: signer(X, KEY_DISTINCT),
      }),
      op({
        ordinal: 4,
        documentId: "doc-c",
        type: "INITIALIZE_AUTH",
        scope: "auth",
        signer: signer(Y, KEY_Y),
        input: {
          grants: [
            {
              id: "g1",
              effect: "allow",
              principal: { address: Z },
              capability: { can: "execute" },
            },
          ],
        },
      }),
      op({
        ordinal: 5,
        documentId: "doc-a",
        type: "SET_NAME",
        signer: signer(X, KEY_X),
      }),
      op({
        ordinal: 6,
        documentId: "group-1",
        documentType: GROUP_DOCUMENT_TYPE,
        type: "ADD_MEMBER",
        input: { member: `did:pkh:eip155:1:${MEMBER}` },
      }),
    ];
    await model.indexOperations(history);
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  async function disclosed(identifier: string) {
    const report = await privacy.listDocuments(identifier);
    return report.documents.map(({ documentId, roles }) => ({
      documentId,
      roles,
    }));
  }

  it("lists exactly the documents and roles of each identifier", async () => {
    expect(await disclosed(X)).toEqual([
      { documentId: "doc-a", roles: ["signer"] },
      { documentId: "doc-b", roles: ["signer"] },
    ]);
    expect(await disclosed(Y)).toEqual([
      { documentId: "doc-c", roles: ["signer"] },
    ]);
    expect(await disclosed(Z)).toEqual([
      { documentId: "doc-c", roles: ["named"] },
    ]);
    expect(await disclosed(KEY_X)).toEqual([
      { documentId: "doc-a", roles: ["app-key"] },
    ]);
    expect(await disclosed(KEY_DISTINCT)).toEqual([
      { documentId: "doc-b", roles: ["app-key"] },
    ]);
    expect(await disclosed(KEY_Y)).toEqual([
      { documentId: "doc-c", roles: ["app-key", "creator"] },
    ]);
    expect(await disclosed(jwkIdentifier(JWK))).toEqual([
      { documentId: "doc-a", roles: ["header-key"] },
    ]);
    expect(await disclosed(MEMBER)).toEqual([
      { documentId: "group-1", roles: ["named"] },
    ]);
    expect(
      await disclosed("0x0000000000000000000000000000000000000fff"),
    ).toEqual([]);
  });

  it("matches addresses case-insensitively and keeps the ordinal range", async () => {
    expect(await disclosed(X.toLowerCase())).toEqual(await disclosed(X));
    expect(await disclosed(Z.toLowerCase())).toEqual(await disclosed(Z));

    const report = await privacy.listDocuments(
      X.toUpperCase().replace("0X", "0x"),
    );
    expect(report.documents[0]).toMatchObject({
      documentId: "doc-a",
      firstOrdinal: 1,
      lastOrdinal: 5,
    });
    expect(report.notIndexed.length).toBeGreaterThan(0);
  });

  it("stores a keyed hash, not the identifier", async () => {
    const rows = await baseDb
      .withSchema(REACTOR_SCHEMA)
      .selectFrom("subject_documents" as never)
      .selectAll()
      .execute();
    const serialized = JSON.stringify(rows).toLowerCase();
    expect(serialized).not.toContain(X.toLowerCase().slice(2));
    expect(serialized).not.toContain("zappx");
  });

  it("drops a purged document's rows when the journal is applied", async () => {
    await new KyselyDocumentPurger(
      baseDb.withSchema(REACTOR_SCHEMA) as never,
    ).purge(["doc-b"], { directiveId: "erase-b" });

    const outcomes = await model.reconcilePurges();

    expect(outcomes).toEqual([
      {
        readModelId: model.name,
        rowsAffected: 2,
        covered: true,
      },
    ]);
    expect(await disclosed(X)).toEqual([
      { documentId: "doc-a", roles: ["signer"] },
    ]);
    expect(await disclosed(KEY_DISTINCT)).toEqual([]);

    // A late payload for the purged document writes nothing back.
    await model.indexOperations([
      op({
        ordinal: 7,
        documentId: "doc-b",
        type: "SET_NAME",
        signer: signer(X, KEY_X),
      }),
    ]);
    expect(await disclosed(X)).toEqual([
      { documentId: "doc-a", roles: ["signer"] },
    ]);
  });
});

import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  withSignaturePolicy,
  type AuthSubject,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { AuthorizationPolicy } from "../src/services/authorization.service.js";
import { buildSyncServingGate } from "../src/services/sync-serving-gate.js";
import { holdsGlobal, OUTSIDER, READER } from "./utils/read-gate-fixture.js";

const SUBJECTS: Array<[string, AuthSubject]> = [
  ["anonymous", {}],
  ["outsider", { address: OUTSIDER }],
  ["reader", { address: READER }],
];

describe("sync serving decides what the client read gate decides", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  it.each([
    ["on", { documentDecisions: true, authEnforcement: true }],
    ["off", { documentDecisions: true, authEnforcement: false }],
    ["off, no decisions", { documentDecisions: false, authEnforcement: false }],
  ])("with authEnforcement %s", async (_level, featureFlags) => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({ featureFlags }),
      )
      .buildModule();
    const client = module.client;
    const id = "serving-policed";
    await client.create(
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
        { id },
      ),
    );
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-read",
            description: "the reader reads the domain",
            effect: "allow",
            principal: { address: READER },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);

    const gate = buildSyncServingGate(
      module.reactorModule,
      {
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      },
      new ConsoleLogger(["serving-gate-test"]),
    );
    expect(gate).toBeDefined();

    for (const [name, subject] of SUBJECTS) {
      const served = (await gate!.scopePredicateById(id, subject, "main"))(
        "global",
      );
      const read = holdsGlobal(await client.get(id, { subject }));
      expect(served, name).toBe(read);
      expect(served, name).toBe(name === "reader");
    }
  });
});

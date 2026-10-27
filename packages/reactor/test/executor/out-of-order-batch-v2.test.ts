import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  Grant,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  garbageCollect,
  initializeAuth,
  setGrant,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

const ANYONE_AUTH: Grant = {
  id: "g-auth-admin",
  description: "anyone may administer the policy",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "auth" },
};

const ANYONE_GLOBAL: Grant = {
  id: "g-global",
  description: "anyone may write the global scope",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "global" },
};

describe.each([1, 2])(
  "an execute batch stamped out of order on base-reducer %i",
  (baseReducer) => {
    let author: InProcessReactorModule | undefined;
    let receiver: InProcessReactorModule | undefined;

    afterEach(() => {
      author?.reactor.kill();
      receiver?.reactor.kill();
      author = undefined;
      receiver = undefined;
    });

    function build(
      documentDecisions: boolean,
      authEnforcement: boolean,
    ): Promise<InProcessReactorModule> {
      return new ReactorBuilder()
        .withDocumentModelSources([
          documentModelDocumentModelModule as never,
          driveDocumentModelModule as never,
        ])
        .withExecutorConfig({
          featureFlags: { documentDecisions, authEnforcement },
        })
        .buildModule();
    }

    async function settle(
      module: InProcessReactorModule,
      job: Promise<JobInfo>,
    ): Promise<JobInfo> {
      const deadline = Date.now() + 10_000;
      const { id } = await job;
      let status = await module.reactor.getJobStatus(id);
      while (
        status.status !== JobStatus.READ_READY &&
        status.status !== JobStatus.FAILED
      ) {
        if (Date.now() > deadline) {
          throw new Error(`job ${id} did not settle: ${status.status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        status = await module.reactor.getJobStatus(id);
      }
      return status;
    }

    async function run(
      module: InProcessReactorModule,
      job: Promise<JobInfo>,
    ): Promise<void> {
      const status = await settle(module, job);
      expect(status.error?.message ?? status.status).toBe(JobStatus.READ_READY);
    }

    async function stored(
      module: InProcessReactorModule,
      docId: string,
      scope: string,
    ): Promise<Operation[]> {
      const result = (await module.reactor.getOperations(docId, {
        branch: "main",
        scopes: [scope],
      })) as Record<string, { results: Operation[] } | undefined>;
      return result[scope]?.results ?? [];
    }

    async function live(
      module: InProcessReactorModule,
      docId: string,
    ): Promise<string[]> {
      return garbageCollect(
        sortOperations(await stored(module, docId, "global")),
      ).map((operation) => (operation.action.input as { id: string }).id);
    }

    function legacyDocument(id?: string) {
      return createDocModelDocument({
        id,
        signaturePolicy: "legacy",
        protocolVersions: { "base-reducer": baseReducer },
      });
    }

    it.each([
      { documentDecisions: false, authEnforcement: false, offsetMs: 60_000 },
      { documentDecisions: true, authEnforcement: false, offsetMs: 60_000 },
      { documentDecisions: true, authEnforcement: false, offsetMs: -60_000 },
      { documentDecisions: true, authEnforcement: true, offsetMs: 60_000 },
      { documentDecisions: true, authEnforcement: true, offsetMs: -60_000 },
    ])(
      "converges split with documentDecisions $documentDecisions, authEnforcement $authEnforcement, stamped $offsetMs ms from now",
      async ({ documentDecisions, authEnforcement, offsetMs }) => {
        author = await build(documentDecisions, authEnforcement);
        receiver = await build(documentDecisions, authEnforcement);
        const document = legacyDocument();
        const docId = document.header.id;
        await run(author, author.reactor.create(document));
        await run(
          receiver,
          receiver.reactor.load(
            docId,
            "main",
            await stored(author, docId, "document"),
          ),
        );

        const base = Date.now() + offsetMs;
        const stamped = (id: string, offsetMs: number): Action => ({
          ...addModule({ id, name: id }),
          timestampUtcMs: new Date(base + offsetMs).toISOString(),
        });
        await run(
          author,
          author.reactor.execute(docId, "main", [
            stamped("a", 100),
            stamped("b", 90),
          ]),
        );

        for (const operation of await stored(author, docId, "global")) {
          await run(
            receiver,
            receiver.reactor.load(docId, "main", [operation]),
          );
        }
        const fromReceiver = await stored(receiver, docId, "global");
        await run(author, author.reactor.load(docId, "main", fromReceiver));
        const fromAuthor = await stored(author, docId, "global");
        await run(receiver, receiver.reactor.load(docId, "main", fromAuthor));

        expect(await live(receiver, docId)).toEqual(await live(author, docId));
        if (documentDecisions) {
          expect(await live(author, docId)).toEqual(["b", "a"]);
        }
      },
    );

    it.each([true, false])(
      "with authEnforcement %s, a batch whose own auth actions run backwards is rejected only under enforcement",
      async (authEnforcement) => {
        author = await build(true, authEnforcement);
        const document = legacyDocument(
          `backwards-v${baseReducer}-${authEnforcement}`,
        );
        const docId = document.header.id;
        await run(author, author.reactor.create(document));
        await run(
          author,
          author.reactor.execute(docId, "main", [
            initializeAuth({
              version: 1,
              grants: [ANYONE_AUTH, ANYONE_GLOBAL],
            }),
          ]),
        );

        const at = (offsetMs: number) =>
          new Date(Date.now() + offsetMs).toISOString();
        const status = await settle(
          author,
          author.reactor.execute(docId, "main", [
            {
              ...setGrant({
                grant: { ...ANYONE_GLOBAL, description: "second" },
              }),
              timestampUtcMs: at(2_000),
            },
            {
              ...setGrant({
                grant: { ...ANYONE_GLOBAL, description: "first" },
              }),
              timestampUtcMs: at(1_000),
            },
          ]),
        );

        if (authEnforcement) {
          expect(status.error?.message).toMatch(/Auth timestamp not monotonic/);
        } else {
          expect(status.error?.message ?? status.status).toBe(
            JobStatus.READ_READY,
          );
        }
      },
    );
  },
);

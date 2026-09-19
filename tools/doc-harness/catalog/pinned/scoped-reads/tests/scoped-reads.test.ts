import {
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactor,
  type IReactorClient,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  addMember,
  ReactorGroup,
  removeMember,
  utils as groupUtils,
} from "@powerhousedao/reactor-group/document-models/reactor-group";
import {
  initializeAuth,
  type Grant,
  type ISigner,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import type { Action, ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import {
  addReviewNote,
  ExpenseReport,
  submitExpense,
  utils as expenseUtils,
} from "document-models/expense-report/v1";

const ALICE = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const BOB = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";
const CAROL = "0xCCcccCcCCCcCcccCCccCcCccCCCCccCCcCCcCcC2";
const MALLORY = "0xDDdddDdDDDdDdddDDddDdDddDDDDddDDdDDdDdD3";

const ALL_FLAGS = {
  documentDecisions: true,
  authEnforcement: true,
  authGroups: true,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function quietLogger(): ILogger {
  const drop = () => {};
  return {
    level: "error",
    errorHandler: drop,
    child: () => quietLogger(),
    verbose: drop,
    debug: drop,
    info: drop,
    warn: drop,
    error: drop,
  };
}

function signerFor(address: string): ISigner {
  return {
    user: { address, networkId: "eip155", chainId: 1 },
    app: { name: "scoped-reads", key: `did:test:${address}` },
    publicKey: {} as CryptoKey,
    sign: () => Promise.resolve(new Uint8Array(0)),
    verify: () => Promise.resolve(),
    signAction: () => Promise.resolve(["", "", "", "", ""] as never),
  } as ISigner;
}

function signedBy<A extends Action>(action: A, address: string): A {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address, networkId: "eip155", chainId: 1 },
        app: { name: "scoped-reads", key: `did:test:${address}` },
        signatures: [],
      },
    },
  };
}

function expensePolicy(rosterId: string): Grant[] {
  return [
    {
      id: "g-alice-admin",
      description: "Alice administers the policy",
      effect: "allow",
      principal: { address: ALICE },
      capability: { can: "execute", scope: "auth" },
    },
    {
      id: "g-alice-submit",
      description: "Alice submits expenses",
      effect: "allow",
      principal: { address: ALICE },
      capability: {
        can: "execute",
        scope: "global",
        operation: ["SUBMIT_EXPENSE"],
      },
    },
    {
      id: "g-carol-read",
      description: "Carol reads the expenses",
      effect: "allow",
      principal: { address: CAROL },
      capability: { can: "read", scope: "global" },
    },
    {
      id: "g-reviewers-read",
      description: "reviewers read the expenses",
      effect: "allow",
      principal: { group: rosterId },
      capability: { can: "read", scope: "global" },
    },
    {
      id: "g-reviewers-notes",
      description: "reviewers write the confidential notes",
      effect: "allow",
      principal: { group: rosterId },
      capability: { can: "execute", scope: "local" },
    },
  ];
}

/** The expenses a gated read served, if that scope came back at all. */
function expensesIn(document: PHDocument): unknown[] {
  const state = document.state as unknown as {
    global?: { expenses: unknown[] };
  };
  return state.global?.expenses ?? [];
}

type Fixture = {
  reactor: IReactor;
  client: IReactorClient;
  reportId: string;
  rosterId: string;
};

describe("scoped reads", () => {
  let live: IReactor | undefined;

  afterEach(() => {
    live?.kill();
    live = undefined;
  });

  async function waitForJob(reactor: IReactor, job: JobInfo): Promise<JobInfo> {
    for (;;) {
      const status = await reactor.getJobStatus(job.id);
      if (
        status.status === JobStatus.READ_READY ||
        status.status === JobStatus.FAILED
      ) {
        return status;
      }
      await sleep(5);
    }
  }

  async function step(
    reactor: IReactor,
    docId: string,
    caller: string,
    action: Action,
  ): Promise<JobInfo> {
    await sleep(15);
    const job = await reactor.execute(docId, "main", [
      signedBy(action, caller),
    ]);
    return waitForJob(reactor, job);
  }

  /** One reactor, one client signing as Alice, a roster and a governed report. */
  async function boot(
    flags: Partial<typeof ALL_FLAGS> = ALL_FLAGS,
  ): Promise<Fixture> {
    const module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            ExpenseReport,
            ReactorGroup,
            documentModelDocumentModelModule,
          ])
          .withLogger(quietLogger())
          .withExecutorConfig({ featureFlags: flags }),
      )
      .withSigner(signerFor(ALICE))
      .buildModule();

    const reactor = module.reactor;
    live = reactor;

    const roster = groupUtils.createDocument();
    const rosterId = roster.header.id;
    await waitForJob(reactor, await reactor.create(roster));
    await step(
      reactor,
      rosterId,
      ALICE,
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-alice-roster",
            description: "Alice administers the roster",
            effect: "allow",
            principal: { address: ALICE },
            capability: { can: "execute", scope: "*" },
          },
        ],
      }),
    );
    await step(reactor, rosterId, ALICE, addMember({ address: BOB }));

    const report = expenseUtils.createDocument();
    const reportId = report.header.id;
    await waitForJob(reactor, await reactor.create(report));
    await step(
      reactor,
      reportId,
      ALICE,
      initializeAuth({ version: 1, grants: expensePolicy(rosterId) }),
    );
    await step(
      reactor,
      reportId,
      ALICE,
      submitExpense({ id: "e-1", memo: "Taxi", amountCents: 4200 }),
    );
    await step(
      reactor,
      reportId,
      BOB,
      addReviewNote({ expenseId: "e-1", note: "Receipt looks altered." }),
    );

    return { reactor, client: module.client, reportId, rosterId };
  }

  async function scopesFor(
    client: IReactorClient,
    documentId: string,
    address: string,
  ): Promise<string[]> {
    const document = await client.get(documentId, { subject: { address } });
    return Object.keys(document.state).sort();
  }

  it("serves everything through the reactor and the policy through the client", async () => {
    const { reactor, client, reportId } = await boot();

    const raw = await reactor.getByIdOrSlug<PHDocument>(reportId);

    expect(Object.keys(raw.state).sort()).toEqual([
      "auth",
      "document",
      "global",
      "local",
    ]);
    expect(await scopesFor(client, reportId, MALLORY)).toEqual([
      "auth",
      "document",
    ]);
  });

  /** Admission is flagged; the read gate is not. */
  it("filters reads with every feature flag off", async () => {
    const { client, reportId } = await boot({});

    expect(await scopesFor(client, reportId, CAROL)).toContain("global");
    expect(await scopesFor(client, reportId, MALLORY)).toEqual([
      "auth",
      "document",
    ]);
  });

  it("gives four identities three views, and withholds by absence", async () => {
    const { client, reportId } = await boot();

    expect(await scopesFor(client, reportId, ALICE)).toEqual([
      "auth",
      "document",
      "global",
    ]);
    expect(await scopesFor(client, reportId, BOB)).toEqual([
      "auth",
      "document",
      "global",
      "local",
    ]);
    expect(await scopesFor(client, reportId, CAROL)).toEqual([
      "auth",
      "document",
      "global",
    ]);
    expect(await scopesFor(client, reportId, MALLORY)).toEqual([
      "auth",
      "document",
    ]);

    const mallory = await client.get(reportId, {
      subject: { address: MALLORY },
    });
    expect("global" in mallory.state).toBe(false);
  });

  /** Alice holds no read grant, and her execute grant names one operation. */
  it("lets an allow on execute confer read, ignoring the operation list", async () => {
    const { reactor, client, reportId } = await boot();

    const alice = await client.get(reportId, { subject: { address: ALICE } });
    expect(expensesIn(alice)).toHaveLength(1);

    // Carol reads the same scope and still cannot write it.
    const refused = await step(
      reactor,
      reportId,
      CAROL,
      submitExpense({ id: "e-2", memo: "Dinner", amountCents: 9900 }),
    );
    expect(refused.status).toBe(JobStatus.FAILED);
  });

  it("gates the document a write hands back", async () => {
    const { client, reportId } = await boot();

    const written = await client.execute(reportId, "main", [
      submitExpense({ id: "e-3", memo: "Hotel", amountCents: 18000 }),
    ]);

    expect(Object.keys(written.state).sort()).toEqual([
      "auth",
      "document",
      "global",
    ]);
    expect(Object.keys(written.state).sort()).toEqual(
      await scopesFor(client, reportId, ALICE),
    );
  });

  it("moves a read with a roster change and no policy write", async () => {
    const { reactor, client, reportId, rosterId } = await boot();

    const authBefore = (await client.get(reportId)).header.revision.auth;
    expect(await scopesFor(client, reportId, BOB)).toContain("local");

    await step(reactor, rosterId, ALICE, removeMember({ address: BOB }));
    expect(await scopesFor(client, reportId, BOB)).toEqual([
      "auth",
      "document",
    ]);

    await step(reactor, rosterId, ALICE, addMember({ address: BOB }));
    expect(await scopesFor(client, reportId, BOB)).toContain("local");

    expect((await client.get(reportId)).header.revision.auth).toBe(authBefore);
  });

  /** Past the roster's own policy, which serves nobody but Alice. */
  it("serves the named roster to the report's audience", async () => {
    const { client, rosterId } = await boot();

    expect(await scopesFor(client, rosterId, CAROL)).toContain("global");
    expect(await scopesFor(client, rosterId, MALLORY)).toEqual([
      "auth",
      "document",
    ]);
  });

  it("withholds the roster below authGroups", async () => {
    const { client, rosterId } = await boot({
      documentDecisions: true,
      authEnforcement: true,
    });

    expect(await scopesFor(client, rosterId, CAROL)).toEqual([
      "auth",
      "document",
    ]);
  });
});

// The resume routes wired to a real runtime over a real socket: a POST, a
// /sync POST and the confirm page each resume a waiting run.
import {
  createHttpAdapter,
  getDbClient,
  HttpRouteService,
} from "@powerhousedao/reactor-api";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
  createWorkflowRuntime,
  type WorkflowRuntimeService,
} from "@powerhousedao/reactor-workflow";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import {
  actions,
  reducer,
  utils,
  type WorkflowDocument,
} from "@powerhousedao/workflow/document-models/workflow";
import type { Action } from "document-model";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  registerWaitpointRoutes,
  waitpointBaseUrlOf,
} from "../../src/workflow/waitpoint-routes.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
const POLL = { timeout: 15_000, interval: 25 };

const documents = new Map<string, WorkflowDocument>();
let service: WorkflowRuntimeService;
let close: () => Promise<void>;

// Manual trigger → Respond and wait for webhook → a Stop run answering `text`.
function workflow(id: string, text: string) {
  let document = utils.createDocument();
  document.header.id = id;
  const step = (key: string, actionName: string, config: object) =>
    actions.addStep({
      id: key,
      key,
      name: key,
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      actionName,
      config,
    });
  const list: Action[] = [
    actions.setTrigger({
      id: "t1",
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    step("wait", "waitForWebhook", {}),
    step("stop", "stop", {
      responseType: "raw",
      text,
    }),
    actions.addEdge({ id: "e0", from: "t1", to: "wait", port: "next" }),
    actions.addEdge({ id: "e1", from: "wait", to: "stop", port: "next" }),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  ];
  for (const action of list) document = reducer(document, action as never);
  documents.set(id, document);
}

// Fires the workflow to WAITING; returns the run and its resume URL.
async function waiting(id: string, text = "done") {
  workflow(id, text);
  const fired = await service.fire(id, undefined, "manual", undefined, CTX);
  expect(fired.status).toBe("WAITING");
  const runId = fired.runId!;
  const wait = (await (await service.store())!.getSteps(runId)).find(
    (row) => row.step_key === "wait",
  )!;
  const { resumeUrl } = JSON.parse(wait.output!) as { resumeUrl: string };
  return { runId, resumeUrl };
}

async function settles(runId: string) {
  await expect
    .poll(
      async () => (await (await service.store())!.getRun(runId))?.status,
      POLL,
    )
    .toBe("SUCCEEDED");
  const rows = await (await service.store())!.getSteps(runId);
  return Object.fromEntries(rows.map((row) => [row.step_key, row]));
}

beforeAll(async () => {
  const { adapter } = await createHttpAdapter("express");
  adapter.setupMiddleware({});
  const server = await adapter.listen(0, undefined, "127.0.0.1");
  const { port } = server.address() as { port: number };
  const routes = new HttpRouteService({
    httpAdapter: adapter,
    publicUrl: `http://127.0.0.1:${port}`,
  });
  const scope = routes.scopeFor("@powerhousedao/workflow");
  const { db } = getDbClient();
  service = createWorkflowRuntime({
    relationalDb: createRelationalDb(
      db as unknown as Kysely<unknown>,
    ) as IRelationalDb,
    reactorClient: {
      find: () => Promise.resolve({ results: [] }),
      get: (id: string) => {
        const document = documents.get(id);
        return document
          ? Promise.resolve(structuredClone(document))
          : Promise.reject(new Error(`No document ${id}`));
      },
    },
    assertCanRead: () => Promise.resolve(undefined),
    assertCanWrite: () => Promise.resolve(undefined),
    waitpointBaseUrl: waitpointBaseUrlOf(scope),
  } as never);
  const handles = registerWaitpointRoutes(scope, service);
  close = async () => {
    for (const handle of handles) handle.dispose();
    service.shutdown();
    await new Promise((done) => server.close(() => done(undefined)));
  };
});

afterAll(() => close());

describe("a resume URL served by the switchboard", () => {
  it("resumes the run on a POST, with its body and query", async () => {
    const { runId, resumeUrl } = await waiting("wf-route-post");
    expect(resumeUrl).toMatch(/\/api\/@powerhousedao\/workflow\/waitpoints\//);

    const response = await fetch(`${resumeUrl}?action=go`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 1 }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "resumed" });

    const steps = await settles(runId);
    expect(JSON.parse(steps.wait!.output!)).toMatchObject({
      body: { n: 1 },
      queryParams: { action: "go" },
    });
    // Used once.
    const again = await fetch(resumeUrl, { method: "POST" });
    expect(await again.json()).toMatchObject({ status: "already" });
  });

  it("answers a /sync POST with the resumed run's reply", async () => {
    const { runId, resumeUrl } = await waiting(
      "wf-route-sync",
      "got {{steps.wait.output.body.n}}",
    );

    const response = await fetch(`${resumeUrl}/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 7 }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("got 7");
    await settles(runId);
  });

  it("shows the confirm page, and resumes on its form", async () => {
    const { runId, resumeUrl } = await waiting("wf-route-confirm");

    const page = await fetch(`${resumeUrl}/confirm`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<form");
    expect((await (await service.store())!.getRun(runId))?.status).toBe(
      "WAITING",
    );

    const form = await fetch(`${resumeUrl}/confirm?action=approve`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "text/html",
      },
      body: new URLSearchParams({ reason: "ok" }).toString(),
    });
    expect(form.status).toBe(200);
    expect(await form.text()).toContain("You approved");

    const steps = await settles(runId);
    expect(JSON.parse(steps.wait!.output!)).toMatchObject({
      body: { reason: "ok" },
      queryParams: { action: "approve" },
    });
    expect((await fetch(`${resumeUrl}/confirm`)).status).toBe(200);
  });
});

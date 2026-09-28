// Testing a the core webhook trigger over HTTP: the next real delivery to the
// workflow's endpoint becomes the trigger's test sample, and runs nothing.
import {
  actions,
  reducer,
  utils,
  type WorkflowDocument,
} from "@powerhousedao/workflow/document-models/workflow";
import type { Action } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW,
  startWebhookHost,
  WEBHOOK_TRIGGER,
  type WebhookHost,
} from "./harness.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

let document: WorkflowDocument;
let host: WebhookHost;

function apply(...list: Action[]): void {
  for (const action of list) document = reducer(document, action as never);
}

beforeAll(async () => {
  document = utils.createDocument();
  document.header.id = DEFAULT_WORKFLOW;
  // A draft, never enabled: nothing is armed but the test's listener.
  apply(
    actions.setTrigger({
      id: "t1",
      ...WEBHOOK_TRIGGER,
      config: { scheme: "none", responseStatus: 202 },
    }),
  );
  host = await startWebhookHost({
    reactorClient: {
      get: () => Promise.resolve(structuredClone(document)),
      find: () => Promise.resolve({ results: [] }),
      execute: (_id: string, _branch: string, list: Action[]) => {
        apply(...list);
        return Promise.resolve(document);
      },
    },
  });
});

afterAll(async () => {
  host.service.shutdown();
  await host.stop();
});

describe("the core webhook trigger test", () => {
  it("saves the next delivery as the trigger's last test", async () => {
    const endpoint = await host.service.webhookEndpoint(DEFAULT_WORKFLOW, CTX);
    const token = endpoint!.url.slice(endpoint!.url.lastIndexOf("/") + 1);
    // Unarmed: a delivery before the test starts is refused.
    expect((await host.deliver(token, { body: "{}" })).status).toBe(404);

    const testing = host.service.testTrigger(DEFAULT_WORKFLOW, CTX);
    let reply: Response | undefined;
    for (let attempt = 0; attempt < 100 && reply?.status !== 202; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      reply = await host.deliver(token, {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "evt_1" }),
        query: { source: "provider" },
      });
    }

    expect(reply?.status).toBe(202);
    expect(await testing).toMatchObject({
      method: "POST",
      queryParams: { source: "provider" },
      body: { id: "evt_1" },
    });
    expect(document.state.global.trigger?.lastTest?.runId).toBeTruthy();
    expect(host.fired).toEqual([]);
  });
});

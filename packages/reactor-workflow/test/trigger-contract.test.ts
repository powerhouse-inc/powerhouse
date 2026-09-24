// The trigger and connection contract a piece is written against, as upstream's
// engine and webhook converter implement it (Activepieces 0.91.0).
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebhookRequest } from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import { PieceWorker } from "../src/pieces/activepieces/worker/host.js";
import type { CheckConnectionOutcome } from "../src/pieces/activepieces/worker/protocol.js";
import { packagePieces } from "../src/reactor/piece-registry.js";
import type { WorkflowRuntimeService } from "../src/reactor/service.js";
import { testRuntime } from "./helpers/runtime.js";

const PIECE = "@fixture/piece-contract";
const VERSION = "1.0.0";

// A stock webhook trigger maps the delivery, a dropdown filters by what was
// typed, and the account label is the auth the hook was handed.
const FIXTURE = `
const app = {
  displayName: "Contract Fixture",
  auth: {
    type: "CUSTOM_AUTH",
    props: {},
    validate: async () => ({ valid: true }),
    getConnectionIdentifier: async (ctx) => JSON.stringify(ctx.auth),
  },
  actions: {
    pick: {
      name: "pick",
      displayName: "Pick",
      props: {
        choice: {
          type: "DROPDOWN",
          displayName: "Choice",
          required: true,
          refreshers: [],
          options: async (_values, ctx) => ({
            options: [{ label: "searched", value: ctx.searchValue ?? null }],
          }),
        },
      },
      run: async () => ({}),
    },
  },
  triggers: {
    delivery: {
      name: "delivery",
      displayName: "Delivery",
      type: "WEBHOOK",
      props: {},
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      run: async (ctx) => [{ payload: ctx.payload, body: ctx.payload.body }],
    },
  },
};
module.exports = { app };
`;

// A failing validate's reason is the one message a check reports back.
const VALIDATE_FIXTURE = `
const app = {
  displayName: "Validate Fixture",
  auth: {
    type: "CUSTOM_AUTH",
    props: {},
    validate: async (ctx) => ({ valid: false, error: JSON.stringify(ctx.auth) }),
  },
  actions: {},
};
module.exports = { app };
`;

let root = "";
let bundleDir = "";
let validateDir = "";
let worker: PieceWorker;

async function writeBundle(name: string, source: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: PIECE, version: VERSION, main: "index.js" }),
  );
  await writeFile(join(dir, "index.js"), source);
  return dir;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ap-trigger-contract-"));
  bundleDir = await writeBundle("contract", FIXTURE);
  validateDir = await writeBundle("validate", VALIDATE_FIXTURE);
  worker = new PieceWorker();
});

afterAll(async () => {
  worker.dispose();
  await rm(root, { recursive: true, force: true });
});

describe("trigger payload", () => {
  // #3090: upstream hands a hook `payload: triggerPayload ?? {}`; ours passes undefined.
  it.fails("defaults to {} when the hook runs outside a delivery", async () => {
    const result = await worker.runTriggerHook({
      bundleDir,
      triggerName: "delivery",
      hook: "run",
      propsValue: {},
    });

    expect(result.output).toEqual([{ payload: {} }]);
  });
});

describe("webhook delivery", () => {
  const WORKFLOW = "wf-contract";
  const RAW = '{"id":"evt_1"}';
  let service: WorkflowRuntimeService;
  let fired: unknown[];

  const request = (overrides: Partial<WebhookRequest>): WebhookRequest => ({
    key: WORKFLOW,
    method: "POST",
    path: "/webhooks/0123456789abcdef0123456789abcdef",
    queryParams: {},
    headers: { "content-type": "application/json" },
    raw: Buffer.from(RAW, "utf8"),
    body: { id: "evt_1" },
    ...overrides,
  });

  beforeEach(async () => {
    fired = [];
    service = testRuntime();
    vi.spyOn(service, "fire").mockImplementation((_id, payload) => {
      fired.push(payload);
      return Promise.resolve({
        runId: "run-1",
        status: "SUCCEEDED",
        steps: [],
      } as never);
    });
    await service.onOperations([
      {
        operation: {
          index: 1,
          timestampUtcMs: "1",
          action: { type: "SET_WORKFLOW_NAME", input: {} },
          resultingState: JSON.stringify({
            name: "Hook",
            status: "ENABLED",
            version: 1,
            trigger: { id: "t1", blockType: "core#webhook", config: {} },
            steps: [],
            edges: [],
            variables: [],
          }),
        },
        context: {
          documentId: WORKFLOW,
          documentType: "powerhouse/workflow",
          scope: "global",
          branch: "main",
          ordinal: 1,
        },
      } as unknown as OperationWithContext,
    ]);
  });

  afterEach(() => {
    service.shutdown();
  });

  // #3090: webhookPayload() builds the payload a piece trigger also gets, and drops the raw bytes.
  it.fails("carries the raw body for a text content type", async () => {
    await service.deliverWebhook(request({}));

    expect(fired).toEqual([expect.objectContaining({ rawBody: RAW })]);
  });

  it("carries no raw body for a binary content type", async () => {
    await service.deliverWebhook(
      request({ headers: { "content-type": "image/png" }, body: RAW }),
    );

    expect(fired).toHaveLength(1);
    expect(fired[0]).not.toHaveProperty("rawBody");
  });

  // The signature header a piece verifies itself is stripped before this
  // point, by reactor-api's transport; see its test/http/webhooks.test.ts.
  it("hands the trigger every header the transport delivered", async () => {
    await service.deliverWebhook(
      request({
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=abc",
        },
      }),
    );

    expect(fired).toEqual([
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-hub-signature-256": "sha256=abc",
        }) as unknown,
      }),
    ]);
  });
});

describe("dropdown search", () => {
  it("hands options() the searchValue the worker was given", async () => {
    const result = await worker.resolveOptions({
      bundleDir,
      actionName: "pick",
      propName: "choice",
      searchValue: "acme",
    });

    expect(result.output).toEqual({
      options: [{ label: "searched", value: "acme" }],
    });
  });

  // #3091: blockOptions takes no search value, so the editor cannot send one.
  it.fails("reaches options() from the runtime's blockOptions", async () => {
    packagePieces.setPieces([{ name: PIECE, version: VERSION, bundleDir }]);
    const service = testRuntime();
    try {
      const withSearch = service.blockOptions.bind(service) as (
        ...args: unknown[]
      ) => Promise<unknown>;
      const output = await withSearch(
        `${PIECE}@${VERSION}#pick`,
        "choice",
        {},
        undefined,
        undefined,
        "acme",
      );

      expect(output).toEqual({
        options: [{ label: "searched", value: "acme" }],
      });
    } finally {
      packagePieces.reset();
      service.shutdown();
    }
  });
});

// Upstream's validateAuth and resolveConnectionIdentifier (piece-helper.ts)
// hand both hooks the flat value, not the connection envelope.
describe.each([
  {
    hook: "auth.validate",
    seen: async (auth: unknown) => {
      const result = await worker.checkConnection({
        bundleDir: validateDir,
        auth,
      });
      const { detail } = result.output as CheckConnectionOutcome;
      return JSON.parse(detail ?? "null") as unknown;
    },
  },
  {
    hook: "auth.getConnectionIdentifier",
    seen: async (auth: unknown) => {
      const result = await worker.checkConnection({ bundleDir, auth });
      const { accountLabel } = result.output as CheckConnectionOutcome;
      return JSON.parse(accountLabel ?? "null") as unknown;
    },
  },
])("$hook", ({ seen }) => {
  it("receives a SECRET_TEXT value as the secret itself", async () => {
    expect(await seen({ type: "SECRET_TEXT", secret_text: "tok" })).toBe("tok");
  });

  it("receives a CUSTOM_AUTH value as its props", async () => {
    expect(
      await seen({ type: "CUSTOM_AUTH", props: { apiKey: "k", region: "eu" } }),
    ).toEqual({ apiKey: "k", region: "eu" });
  });

  it("receives a BASIC_AUTH value with its username and password", async () => {
    expect(
      await seen({ type: "BASIC_AUTH", username: "u", password: "p" }),
    ).toMatchObject({ username: "u", password: "p" });
  });
});

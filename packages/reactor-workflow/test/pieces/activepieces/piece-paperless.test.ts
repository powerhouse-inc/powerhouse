// E2E: the published-shape bundle through the real piece worker, against a
// real paperless-ngx. This is the worker protocol the workflow-runtime
// subgraph drives: run (with host-staged attachments), check-connection,
// trigger hooks with a store-state round trip, and error classification
// across the IPC boundary. Skipped unless PAPERLESS_E2E_URL is set — same
// stack as the piece package's live suite:
//   docker compose -f packages/piece-paperless-ngx/test/e2e-compose.yml up -d
//   pnpm --filter @powerhousedao/reactor-workflow build   # the worker entry
//   PAPERLESS_E2E_URL=http://localhost:18000 \
//   PAPERLESS_E2E_USER=admin PAPERLESS_E2E_PASSWORD=paperless-e2e \
//   pnpm --filter @powerhousedao/reactor-workflow vitest run test/pieces/activepieces/piece-paperless.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";
import type { CheckConnectionOutcome } from "../../../src/pieces/activepieces/worker/protocol.js";

const PIECE_PKG = path.resolve("../piece-paperless-ngx");
const BUNDLE = path.join(PIECE_PKG, "dist");

const baseUrl = process.env.PAPERLESS_E2E_URL;
const username = process.env.PAPERLESS_E2E_USER ?? "admin";
const password = process.env.PAPERLESS_E2E_PASSWORD ?? "paperless-e2e";

const stamp = Date.now();

// A real one-page PDF, the same one the piece package's live suite uses for
// its archive-version test.
function minimalPdf(text: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 14 Tf 20 150 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const fileName = `worker-e2e-${stamp}.pdf`;
const fileData = minimalPdf(`Worker e2e invoice ${stamp}`);

async function mintToken(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`Could not mint an API token: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { token: string };
  return body.token;
}

async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  label: string,
  timeoutMs = 180_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

interface Delivery {
  token?: string;
  path: string;
  body: unknown;
}

describe.skipIf(!baseUrl)("paperless piece through the worker (E2E)", () => {
  let worker: PieceWorker;
  let token = "";
  let listener: http.Server;
  let listenerUrl = "";
  let deliveries: Delivery[] = [];
  let stagingDir = "";

  beforeAll(async () => {
    if (!existsSync(path.join(BUNDLE, "src", "index.js"))) {
      execFileSync("node", ["scripts/bundle.mjs"], { cwd: PIECE_PKG });
    }
    token = await mintToken();
    worker = new PieceWorker();
    stagingDir = mkdtempSync(
      path.join(tmpdir(), `paperless-e2e-staging-${stamp}-`),
    );

    // Stands in for the reactor's webhook endpoint, the way the piece
    // package's live suite does: paperless must reach it, and on the host
    // netns of e2e-compose.yml that is plain loopback.
    listener = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // keep the raw text
        }
        deliveries.push({
          token: request.headers["x-powerhouse-webhook-token"] as
            | string
            | undefined,
          path: request.url ?? "",
          body: parsed,
        });
        // What the reactor's webhook endpoint answers an accepted delivery.
        response.writeHead(202);
        response.end();
      });
    });
    const { promise: listening, resolve: resolveListening } =
      Promise.withResolvers<void>();
    listener.listen(0, "0.0.0.0", resolveListening);
    await listening;
    const port = (listener.address() as AddressInfo).port;
    listenerUrl = `http://127.0.0.1:${port}/graphql/workflow-runtime`;
  }, 120_000);

  afterAll(async () => {
    worker.dispose();
    await new Promise((resolve) => listener.close(resolve));
    rmSync(stagingDir, { recursive: true, force: true });
  });

  const auth = () => ({
    type: "CUSTOM_AUTH",
    props: { base_url: baseUrl, token },
  });

  it("describes the published bundle", async () => {
    const { output } = await worker.describePiece({
      bundleDir: BUNDLE,
      packageName: "@powerhousedao/piece-paperless-ngx",
      version: "0.1.0",
    });
    const descriptor = output as {
      displayName: string;
      actions: { name: string }[];
      triggers: { name: string; strategy: string }[];
      auth?: {
        type: string;
        displayName: string;
        required: boolean;
      };
    };
    expect(descriptor.displayName).toBe("Paperless-ngx");
    expect(descriptor.actions.map((action) => action.name).sort()).toEqual(
      [
        "bulk_edit_documents",
        "custom_api_call",
        "find_or_create_object",
        "get_document",
        "get_document_file",
        "get_task",
        "search_documents",
        "update_document",
        "upload_document",
      ].sort(),
    );
    expect(descriptor.triggers.map((trigger) => trigger.name).sort()).toEqual([
      "document_updated",
      "new_document",
    ]);
    expect(
      descriptor.triggers.every((trigger) => trigger.strategy === "WEBHOOK"),
    ).toBe(true);
    expect(descriptor.auth?.type).toBe("CUSTOM_AUTH");
    expect(descriptor.auth?.displayName).toBe("paperless-ngx");
    expect(descriptor.auth?.required).toBe(true);
  });

  it("checks the connection with worker-side credentials", async () => {
    const { output } = await worker.checkConnection({
      bundleDir: BUNDLE,
      auth: auth(),
    });
    const outcome = output as CheckConnectionOutcome;
    expect(outcome).toMatchObject({ declared: true, valid: true });
    // The live server's ceiling, reached by negotiation rather than pinned.
    expect(outcome.accountLabel).toMatch(
      new RegExp(`^${username}@.+, API (9|10)\\)$`),
    );
  });

  it("reports a bad token as a failed check with the credential message", async () => {
    const { output } = await worker.checkConnection({
      bundleDir: BUNDLE,
      auth: {
        type: "CUSTOM_AUTH",
        props: { base_url: baseUrl, token: "not-a-real-token" },
      },
    });
    const outcome = output as CheckConnectionOutcome;
    expect(outcome).toMatchObject({ declared: true, valid: false });
    expect(outcome.detail).toMatch(/token was rejected/);
  }, 60_000);

  it("uploads a host-staged attachment and reads it back through the bridge", async () => {
    // The host materializes the attachment next to the worker; the piece's
    // FILE prop carries only the ref, and the bytes cross the shared
    // filesystem, not the IPC channel.
    const stagedPath = path.join(stagingDir, `input-${fileName}`);
    writeFileSync(stagedPath, fileData);
    const ref = `apfile://worker-e2e-${stamp}`;

    const upload = await worker.runAction(
      {
        bundleDir: BUNDLE,
        actionName: "upload_document",
        propsValue: {
          file: ref,
          title: `Worker E2E ${stamp}`,
          wait_for_consumption: true,
          timeout_seconds: 240,
        },
        auth: auth(),
        stagingDir,
        stagedInputs: [
          { ref, path: stagedPath, fileName, contentType: "application/pdf" },
        ],
      },
      { timeoutMs: 300_000 },
    );
    const uploaded = upload.output as {
      status: string;
      document_id: number;
      adopted: boolean;
    };
    expect(uploaded.status).toBe("success");
    expect(uploaded.adopted).toBe(false);
    expect(typeof uploaded.document_id).toBe("number");

    // The read-back writes through ctx.files: the worker stages the bytes on
    // disk and reports them on the response; the output still carries the
    // provisional ref the host would rewrite after ingesting the file.
    const read = await worker.runAction(
      {
        bundleDir: BUNDLE,
        actionName: "get_document_file",
        propsValue: { id: uploaded.document_id, variant: "original" },
        auth: auth(),
        stagingDir,
      },
      { timeoutMs: 120_000 },
    );
    expect(read.files).toHaveLength(1);
    const staged = read.files?.[0];
    if (!staged) throw new Error("expected the staged file to be reported");
    expect(readFileSync(staged.path)).toEqual(fileData);
    // The piece names the staged file from the server's Content-Disposition,
    // which for a download is paperless's generated name, not the upload's.
    expect(staged.fileName).toMatch(/\.pdf$/);
    const readOutput = read.output as { ref: string; mime_type: string };
    expect(readOutput.ref).toBe(staged.token);
    expect(readOutput.mime_type).toBe("application/pdf");
  });

  describe("trigger lifecycle through the worker protocol", () => {
    let storeState: Record<string, unknown> | undefined;
    const triggerToken = `worker-e2e-token-${stamp}`;

    // The worker seeds the trigger's store from the snapshot the supervisor
    // persisted, and returns the updated one. Keys are flow-scoped by the
    // context layer, so address them by suffix rather than the raw piece key.
    const registrationIn = (state: Record<string, unknown> | undefined) => {
      for (const [key, value] of Object.entries(state ?? {})) {
        if (key.endsWith("paperless:webhook-registration")) {
          return value as { workflow_id: number } | null;
        }
      }
      return undefined;
    };

    it("registers the trigger onEnable, with the store round trip", async () => {
      const result = await worker.runTriggerHook({
        bundleDir: BUNDLE,
        triggerName: "new_document",
        hook: "onEnable",
        auth: auth(),
        propsValue: { sources: [2] },
        webhookUrl: `${listenerUrl}/webhooks/${triggerToken}`,
      });
      storeState = result.storeState;
      expect(storeState).toBeDefined();

      // Registered in paperless itself, readable back through the API.
      const listed = await worker.runAction({
        bundleDir: BUNDLE,
        actionName: "custom_api_call",
        propsValue: { method: "GET", path: "workflows/" },
        auth: auth(),
      });
      const body = listed.output as {
        body: { results: { id: number; name: string }[] };
      };
      const registration = registrationIn(storeState);
      expect(registration).toBeDefined();
      expect(typeof registration?.workflow_id).toBe("number");
      const mine = body.body.results.find(
        (row) => row.id === registration?.workflow_id,
      );
      expect(mine).toBeDefined();
      expect(mine?.name).toContain("added");
    }, 120_000);

    it("delivers a real webhook to the listener, then hydrates it on run", async () => {
      deliveries = [];

      // A worker-side upload is a real API upload, so paperless's own
      // workflow engine must fire the registered webhook.
      const stagedPath = path.join(stagingDir, `trigger-${stamp}.txt`);
      const triggerBody = `Worker trigger document ${stamp}\n`;
      writeFileSync(stagedPath, triggerBody);
      const ref = `apfile://worker-trigger-${stamp}`;
      await worker.runAction(
        {
          bundleDir: BUNDLE,
          actionName: "upload_document",
          propsValue: {
            file: ref,
            title: `Worker E2E Trigger ${stamp}`,
            adopt_existing_task: false,
            wait_for_consumption: true,
            timeout_seconds: 240,
          },
          auth: auth(),
          stagingDir,
          stagedInputs: [
            {
              ref,
              path: stagedPath,
              fileName: `trigger-${stamp}.txt`,
              contentType: "text/plain",
            },
          ],
        },
        { timeoutMs: 300_000 },
      );

      const delivery = await waitFor(
        () => Promise.resolve(deliveries[0]),
        "paperless to POST the webhook",
        120_000,
      );
      // No token header: the reactor addresses the endpoint by the token in
      // the path, so paperless is given a URL and nothing else.
      expect(delivery.token).toBeUndefined();
      expect(delivery.path).toContain(triggerToken);

      const body = (delivery.body ?? {}) as Record<string, unknown>;
      expect(body.event).toBe("DOCUMENT_ADDED");
      expect(JSON.stringify(body)).not.toContain("{{");

      // Paperless substitutes into the param value, so the id arrives as a
      // string; the piece's run accepts either form.
      const docId = Number(body.doc_id);
      expect(docId).toBeGreaterThan(0);
      const event = String(body.event);

      // The supervisor's exact call: the delivered payload plus the stored
      // state; the response carries the (unchanged) state back out.
      const run = await worker.runTriggerHook({
        bundleDir: BUNDLE,
        triggerName: "new_document",
        hook: "run",
        auth: auth(),
        propsValue: {},
        payload: { docId, event },
        storeState,
      });
      storeState = run.storeState;
      const items = run.output as Record<string, unknown>[];
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe(`Worker E2E Trigger ${stamp}`);
      expect(String(items[0]._dedupe_key)).toMatch(
        new RegExp(`^\\d+:DOCUMENT_ADDED:.+`),
      );
      expect(registrationIn(run.storeState)).toEqual(
        registrationIn(storeState),
      );
    }, 420_000);

    it("removes the registration on onDisable", async () => {
      // Captured before the disable: that is the workflow the assertions
      // must see disappear from paperless.
      const registration = registrationIn(storeState);
      expect(registration).toBeDefined();
      expect(typeof registration?.workflow_id).toBe("number");

      const result = await worker.runTriggerHook({
        bundleDir: BUNDLE,
        triggerName: "new_document",
        hook: "onDisable",
        auth: auth(),
        propsValue: {},
        storeState,
      });
      storeState = result.storeState;
      expect(registrationIn(storeState) ?? null).toBeNull();

      const listed = await worker.runAction({
        bundleDir: BUNDLE,
        actionName: "custom_api_call",
        propsValue: { method: "GET", path: "workflows/" },
        auth: auth(),
      });
      const body = listed.output as {
        body: { results: { id: number }[] };
      };
      expect(
        body.body.results.some((row) => row.id === registration?.workflow_id),
      ).toBe(false);
    }, 120_000);
  });
});

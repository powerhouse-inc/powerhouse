// A pooled child is forked inside one run and then serves others: its host
// calls must still be attributed to the run that made them.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";

const PIECE = "@acme/piece-pooled-upload";
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const FIXTURE = `
export const pooled = {
  displayName: "Pooled upload",
  actions: {
    upload: {
      name: "upload",
      displayName: "Upload",
      props: { text: { displayName: "Text", type: "SHORT_TEXT", required: true } },
      run: async (ctx) => {
        const uploaded = await ctx.files.upload({
          fileName: "note.txt",
          data: Buffer.from(ctx.propsValue.text),
        });
        return { ref: uploaded.id };
      },
    },
    consume: {
      name: "consume",
      displayName: "Consume",
      props: { attachment: { type: "FILE", required: true, displayName: "File" } },
      run: async (ctx) => ({
        text: Buffer.from(ctx.propsValue.attachment.base64, "base64").toString("utf8"),
      }),
    },
  },
  triggers: {},
};
`;

let dir = "";
let documents: Documents;
let service: WorkflowRuntimeService;
const stored = new Map<string, Uint8Array>();
const downloads: { documentId: string; ref: string }[] = [];

function workflow(id: string, text: string) {
  documents.apply(
    id,
    actions.setTrigger({
      id: "t1",
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    ...[
      ["up", "upload", { text }],
      ["read", "consume", { attachment: "{{steps.up.output.ref}}" }],
    ].map(([key, actionName, config]) =>
      actions.addStep({
        id: key as string,
        key: key as string,
        name: key as string,
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName: actionName as string,
        config: config as object,
      }),
    ),
    actions.addEdge({ id: "e0", from: "t1", to: "up", port: "next" }),
    actions.addEdge({ id: "e1", from: "up", to: "read", port: "next" }),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
}

async function journal(runId: string) {
  const rows = await (await service.store())!.getSteps(runId);
  return Object.fromEntries(rows.map((row) => [row.step_key, row]));
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "rw-pooled-upload-"));
  const entryPath = join(dir, "index.mjs");
  await writeFile(entryPath, FIXTURE);
  packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  documents = new Documents();
  service = testRuntime({
    relationalDb: createFreshRelationalDb(),
    reactorClient: {
      ...documents.client(),
      getOperations: () =>
        Promise.resolve({ results: [], options: { cursor: "", limit: 0 } }),
    } as never,
    attachments: {
      upload: async ({ file }) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ref = `attachment://v1:${createHash("sha256").update(bytes).digest("hex")}`;
        stored.set(ref, bytes);
        return { ref };
      },
      download: ({ documentId, ref }) => {
        downloads.push({ documentId, ref });
        const bytes = stored.get(ref)!;
        return Promise.resolve({
          header: {
            sizeBytes: bytes.byteLength,
            mimeType: "text/plain",
            fileName: "note.txt",
          },
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
        });
      },
    },
    // Only what the run wrote itself is readable.
    canReadAttachmentRef: () => Promise.resolve(false),
  });
});

afterAll(async () => {
  service.shutdown();
  packagePieces.reset();
  await rm(dir, { recursive: true, force: true });
});

describe("ctx.files.upload from a warm pooled child", () => {
  it("attributes a later run's upload to that run, not the one that forked the child", async () => {
    // Unique bytes, so the host's attachment cache cannot answer the read.
    const text = `from-second-${randomUUID()}`;
    workflow("wf-first", `from-first-${randomUUID()}`);
    workflow("wf-second", text);

    // Forks the child inside this run.
    const first = await service.fire(
      "wf-first",
      undefined,
      "manual",
      undefined,
      CTX,
    );
    expect(first.status).toBe("SUCCEEDED");

    const second = await service.fire(
      "wf-second",
      undefined,
      "manual",
      undefined,
      CTX,
    );
    const steps = await journal(second.runId!);
    expect(steps.read!.error ?? null).toBeNull();
    expect(second.status).toBe("SUCCEEDED");
    expect(JSON.parse(steps.read!.output!)).toEqual({ text });
    const ref = (JSON.parse(steps.up!.output!) as { ref: string }).ref;
    expect(downloads.find((entry) => entry.ref === ref)?.documentId).toBe(
      "wf-second",
    );
  });
});

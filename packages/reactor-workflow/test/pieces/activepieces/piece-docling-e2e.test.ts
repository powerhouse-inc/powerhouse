// E2E: the published-shape docling bundle through the real piece worker,
// against a live docling-serve v1.32.0. This is the worker protocol the
// workflow-runtime subgraph drives: run (with file props in every shape a
// workflow can produce), check-connection, and typed-error classification
// across the IPC boundary. Skipped unless DOCLING_E2E_URL is set — same
// stack as the piece package's live suite:
//   docker compose -f packages/piece-docling/test/e2e-compose.yml up -d
//   pnpm --filter @powerhousedao/piece-docling build          # the bundle
//   pnpm --filter @powerhousedao/reactor-workflow build     # the worker entry
//   DOCLING_E2E_URL=http://localhost:5001 \
//   DOCLING_E2E_API_KEY=docling-e2e-key \
//   pnpm --filter @powerhousedao/reactor-workflow vitest run test/pieces/activepieces/piece-docling-e2e.test.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";
import type { CheckConnectionOutcome } from "../../../src/pieces/activepieces/worker/protocol.js";
import path from "node:path";

const PIECE_PKG = path.resolve("../piece-docling");
const BUNDLE = path.join(PIECE_PKG, "dist");

const baseUrl = process.env.DOCLING_E2E_URL;
const apiKey = process.env.DOCLING_E2E_API_KEY ?? "docling-e2e-key";

const stamp = Date.now();
const marker = `Docling W2E ${stamp}`;

// A real one-page PDF with a text layer (same construction the piece
// package's live suite uses).
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

describe.skipIf(!baseUrl)("docling piece through the worker (E2E)", () => {
  let worker: PieceWorker;
  const auth = () => ({
    type: "CUSTOM_AUTH",
    props: { base_url: baseUrl, api_key: apiKey },
  });

  beforeAll(async () => {
    if (!existsSync(path.join(BUNDLE, "src", "index.js"))) {
      execFileSync("node", ["scripts/bundle.mjs"], { cwd: PIECE_PKG });
    }
    worker = new PieceWorker();
    await waitFor(
      async () => {
        const res = await fetch(`${baseUrl}/health`, {
          headers: { "x-api-key": apiKey },
        });
        if (res.status !== 200) return undefined;
        const body = (await res.json().catch(() => ({}))) as {
          status?: string;
        };
        return body.status === "ok" ? true : undefined;
      },
      "docling-serve /health",
      600_000,
    );
  }, 600_000);

  afterAll(() => {
    worker.dispose();
  });

  it("describes the published bundle", async () => {
    const { output } = await worker.describePiece({
      bundleDir: BUNDLE,
      packageName: "@powerhousedao/piece-docling",
      version: "1.0.0",
    });
    const descriptor = output as {
      displayName: string;
      actions: { name: string }[];
      triggers: unknown[];
      auth?: {
        type: string;
        displayName: string;
        required: boolean;
      };
    };
    expect(descriptor.displayName).toBe("Docling");
    expect(descriptor.actions.map((action) => action.name).sort()).toEqual(
      [
        "chunk",
        "convert_file",
        "convert_url",
        "get_result",
        "health",
        "submit_job",
      ].sort(),
    );
    expect(descriptor.triggers).toHaveLength(0);
    expect(descriptor.auth?.type).toBe("CUSTOM_AUTH");
    expect(descriptor.auth?.displayName).toBe("Docling Serve");
    expect(descriptor.auth?.required).toBe(true);
  });

  it("checks the connection with worker-side credentials", async () => {
    const { output } = await worker.checkConnection({
      bundleDir: BUNDLE,
      auth: auth(),
    });
    // auth.getConnectionIdentifier labels the connection with the server version.
    const outcome = output as CheckConnectionOutcome;
    expect(outcome).toMatchObject({ declared: true, valid: true });
    expect(outcome.accountLabel).toMatch(/^docling-serve \d/);
  });

  it("reports a rejected key as a failed check with the 401", async () => {
    const { output } = await worker.checkConnection({
      bundleDir: BUNDLE,
      auth: {
        type: "CUSTOM_AUTH",
        props: { base_url: baseUrl, api_key: `${apiKey}-wrong` },
      },
    });
    const outcome = output as CheckConnectionOutcome;
    expect(outcome).toMatchObject({ declared: true, valid: false });
    expect(outcome.detail).toContain("401");
    expect(outcome.accountLabel).toBeUndefined();
  }, 60_000);

  it("converts a real PDF from a Buffer file prop (the ApFile shape)", async () => {
    const { output } = await worker.runAction(
      {
        bundleDir: BUNDLE,
        actionName: "convert_file",
        propsValue: {
          file: { filename: `w2e-${stamp}.pdf`, data: minimalPdf(marker) },
          ocr: false,
          execution: "async",
          timeout_seconds: 600,
        },
        auth: auth(),
      },
      { timeoutMs: 600_000 },
    );
    const md =
      (output as { document?: { md_content?: string | null } }).document
        ?.md_content ?? "";
    expect(md).toContain(marker);
  }, 600_000);

  it("converts a JSON-IPC-shaped file prop (a rehydrated Buffer)", async () => {
    // What a Buffer becomes after crossing a JSON boundary (the workflow
    // journal): { type: "Buffer", data: [...] }.
    const pdf = minimalPdf(marker);
    const { output } = await worker.runAction(
      {
        bundleDir: BUNDLE,
        actionName: "convert_file",
        propsValue: {
          file: {
            filename: `w2e-json-${stamp}.pdf`,
            data: { type: "Buffer", data: Array.from(pdf) },
          },
          ocr: false,
          execution: "async",
          timeout_seconds: 600,
        },
        auth: auth(),
      },
      { timeoutMs: 600_000 },
    );
    const md =
      (output as { document?: { md_content?: string | null } }).document
        ?.md_content ?? "";
    expect(md).toContain(marker);
  }, 600_000);

  it("converts a data-URI string file prop (the reactor config shape)", async () => {
    const uri =
      "data:application/pdf;base64," + minimalPdf(marker).toString("base64");
    const { output } = await worker.runAction(
      {
        bundleDir: BUNDLE,
        actionName: "convert_file",
        propsValue: {
          file: uri,
          ocr: false,
          execution: "async",
          timeout_seconds: 600,
        },
        auth: auth(),
      },
      { timeoutMs: 600_000 },
    );
    const md =
      (output as { document?: { md_content?: string | null } }).document
        ?.md_content ?? "";
    expect(md).toContain(marker);
  }, 600_000);

  it("runs the submit_job + get_result pair across two worker calls", async () => {
    const submitted = (
      await worker.runAction(
        {
          bundleDir: BUNDLE,
          actionName: "submit_job",
          propsValue: {
            file: {
              filename: `w2e-job-${stamp}.pdf`,
              data: minimalPdf(marker),
            },
            ocr: false,
          },
          auth: auth(),
        },
        { timeoutMs: 60_000 },
      )
    ).output as { task_id: string; task_status: string };
    expect(submitted.task_id).toBeTruthy();

    const deadline = Date.now() + 300_000;
    for (;;) {
      const polled = (
        await worker.runAction(
          {
            bundleDir: BUNDLE,
            actionName: "get_result",
            propsValue: { task_id: submitted.task_id, wait_seconds: 5 },
            auth: auth(),
          },
          { timeoutMs: 60_000 },
        )
      ).output as {
        done: boolean;
        document?: { md_content?: string | null };
      };
      if (polled.done) {
        expect(polled.document?.md_content ?? "").toContain(marker);
        return;
      }
      expect(Date.now()).toBeLessThan(deadline);
    }
  }, 330_000);

  it("health through the worker reports the server", async () => {
    const { output } = await worker.runAction(
      {
        bundleDir: BUNDLE,
        actionName: "health",
        propsValue: {},
        auth: auth(),
      },
      { timeoutMs: 30_000 },
    );
    expect(output as { status: string }).toMatchObject({ status: "ok" });
  }, 30_000);
});

async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  label: string,
  timeoutMs = 300_000,
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

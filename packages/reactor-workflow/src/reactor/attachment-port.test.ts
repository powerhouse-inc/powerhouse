// Reading an attachment into a step's workspace: the workflow document has to
// vouch for the ref, and the bytes are capped as they arrive.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAttachmentPort } from "./attachment-port.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKFLOW = "wf-1";
const REF = "attachment://v1:" + "a".repeat(64);

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

let dir: string | undefined;
async function destPath(): Promise<string> {
  dir ??= await mkdtemp(join(tmpdir(), "workflow-attachment-"));
  return join(dir, "payload.bin");
}

afterEach(async () => {
  delete process.env.PH_PIECE_MAX_FILE_BYTES;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

function clientOver(
  chunks: Uint8Array[],
  header: Record<string, unknown> = {},
) {
  const download = vi.fn(() =>
    Promise.resolve({
      header: { sizeBytes: 4, mimeType: "text/plain", ...header },
      body: streamOf(chunks),
    }),
  );
  return { download, upload: vi.fn() };
}

describe("the attachment port's read", () => {
  it("refuses a ref the workflow document does not reference", async () => {
    const client = clientOver([new Uint8Array([1, 2, 3, 4])]);
    const port = createAttachmentPort(
      client as never,
      () => WORKFLOW,
      () => Promise.resolve(false),
    );

    await expect(port.read(REF, await destPath())).rejects.toThrow(
      "does not reference it",
    );
    // Refused before the store is ever asked for the bytes.
    expect(client.download).not.toHaveBeenCalled();
  });

  it("writes the bytes out when the document vouches for the ref", async () => {
    const client = clientOver([new Uint8Array([1, 2, 3, 4])]);
    const port = createAttachmentPort(
      client as never,
      () => WORKFLOW,
      () => Promise.resolve(true),
    );
    const path = await destPath();

    const result = await port.read(REF, path);

    expect([...(await readFile(path))]).toEqual([1, 2, 3, 4]);
    expect(result.contentType).toBe("text/plain");
  });

  it("refuses a declared size over the limit without reading the body", async () => {
    process.env.PH_PIECE_MAX_FILE_BYTES = "8";
    const cancel = vi.fn(() => Promise.resolve());
    const body = streamOf([new Uint8Array(4)]);
    body.cancel = cancel as never;
    const download = vi.fn(() =>
      Promise.resolve({ header: { sizeBytes: 1024 }, body }),
    );
    const port = createAttachmentPort(
      { download, upload: vi.fn() } as never,
      () => WORKFLOW,
      () => Promise.resolve(true),
    );

    await expect(port.read(REF, await destPath())).rejects.toThrow(
      "exceeds the 8 byte limit",
    );
    expect(cancel).toHaveBeenCalled();
  });

  it("stops a body that outgrows the limit and leaves no partial file", async () => {
    process.env.PH_PIECE_MAX_FILE_BYTES = "8";
    // A body with no end to it: the header understates it, so only counting
    // what arrives stops this, and only streaming stops it in time.
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(4));
      },
      cancel() {
        cancelled = true;
      },
    });
    const port = createAttachmentPort(
      {
        download: () => Promise.resolve({ header: { sizeBytes: 4 }, body }),
        upload: vi.fn(),
      } as never,
      () => WORKFLOW,
      () => Promise.resolve(true),
    );
    const path = await destPath();

    await expect(port.read(REF, path)).rejects.toThrow("exceeds the 8 byte");
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
    expect(existsSync(path)).toBe(false);
  });
});

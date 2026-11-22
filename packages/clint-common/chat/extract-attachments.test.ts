import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type {
  ContentPart,
  Message,
} from "@powerhousedao/clint-common/document-models/chat-session";
import type {
  IAttachmentService,
  AttachmentRef,
  AttachmentHeader,
} from "@powerhousedao/clint";
import {
  extensionForMediaType,
  resolveFilename,
  extractAttachments,
  resetExtractedCache,
} from "./extract-attachments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "..", "prometheus.png");
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);

// A fake attachment ref used in tests.
const TEST_REF = "attachment://v1:deadbeef" as AttachmentRef;

/** Build a ReadableStream<Uint8Array> from a Buffer. */
function streamFromBuffer(buf: Buffer): ReadableStream<Uint8Array> {
  return new Response(new Uint8Array(buf)).body!;
}

/** Minimal stub that returns `bytes` for any get() call. */
function makeService(
  bytes: Buffer,
  mimeType = "image/png",
): IAttachmentService {
  return {
    get: (
      _ref: AttachmentRef,
    ): Promise<{
      header: AttachmentHeader;
      body: ReadableStream<Uint8Array>;
    }> =>
      Promise.resolve({
        header: {
          hash: "deadbeef",
          mimeType,
          fileName: "fixture.png",
          sizeBytes: bytes.byteLength,
          extension: ".png",
          status: "available" as const,
          source: "local" as const,
          createdAtUtc: new Date().toISOString(),
          lastAccessedAtUtc: new Date().toISOString(),
          expiresAtUtc: null,
        },
        body: streamFromBuffer(bytes),
      }),
    reserve: () => {
      throw new Error("not implemented");
    },
    stat: () => {
      throw new Error("not implemented");
    },
    getDownloadTarget: () => {
      throw new Error("not implemented");
    },
  };
}

function makePart(
  overrides: Partial<ContentPart> & { id: string; type: ContentPart["type"] },
): ContentPart {
  return {
    args: null,
    attachment: null,
    error: null,
    filename: null,
    isError: null,
    mediaType: null,
    result: null,
    text: null,
    toolCallId: null,
    toolName: null,
    url: null,
    ...overrides,
  };
}

function makeMessage(parts: ContentPart[]): Message {
  return {
    id: "msg-001",
    role: "USER",
    content: parts,
    createdAt: "2026-05-07T00:00:00.000Z",
    stepIndex: null,
    usage: null,
    finishedAt: null,
    finishReason: null,
    pickedUpAt: null,
    failure: null,
  };
}

describe("extensionForMediaType", () => {
  it("returns correct extension for known MIME types", () => {
    expect(extensionForMediaType("image/png", "IMAGE")).toBe(".png");
    expect(extensionForMediaType("image/jpeg", "IMAGE")).toBe(".jpg");
    expect(extensionForMediaType("application/pdf", "FILE")).toBe(".pdf");
    expect(extensionForMediaType("text/csv", "FILE")).toBe(".csv");
  });

  it("falls back to .png for unknown IMAGE types", () => {
    expect(extensionForMediaType("image/x-custom", "IMAGE")).toBe(".png");
    expect(extensionForMediaType(null, "IMAGE")).toBe(".png");
    expect(extensionForMediaType(undefined, "IMAGE")).toBe(".png");
  });

  it("falls back to .bin for unknown FILE types", () => {
    expect(extensionForMediaType("application/octet-stream", "FILE")).toBe(
      ".bin",
    );
    expect(extensionForMediaType(null, "FILE")).toBe(".bin");
  });
});

describe("resolveFilename", () => {
  it("uses part.filename basename with truncated id suffix", () => {
    const part = makePart({
      id: "abcdef1234567890",
      type: "IMAGE",
      filename: "photo.jpg",
      mediaType: "image/jpeg",
    });
    expect(resolveFilename(part)).toBe("photo_abcdef.jpg");
  });

  it('uses "attachment" as basename when no filename provided', () => {
    const part = makePart({
      id: "xyz789abcdef",
      type: "IMAGE",
      mediaType: "image/png",
    });
    expect(resolveFilename(part)).toBe("attachment_xyz789.png");
  });

  it("handles filename without extension", () => {
    const part = makePart({
      id: "aabbcc112233",
      type: "FILE",
      filename: "report",
      mediaType: "application/pdf",
    });
    expect(resolveFilename(part)).toBe("report_aabbcc.pdf");
  });

  it("derives extension from mediaType, not original filename extension", () => {
    const part = makePart({
      id: "112233aabbcc",
      type: "FILE",
      filename: "data.xlsx",
      mediaType: "text/csv",
    });
    expect(resolveFilename(part)).toBe("data_112233.csv");
  });
});

describe("extractAttachments", () => {
  let workdir: string;

  beforeEach(async () => {
    resetExtractedCache();
    workdir = await mkdtemp(join(tmpdir(), "extract-attachments-"));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it("extracts IMAGE via service.get and verifies file content and bytes", async () => {
    const part = makePart({
      id: "img001abcdef",
      type: "IMAGE",
      mediaType: "image/png",
      attachment: TEST_REF,
    });
    const message = makeMessage([part]);
    const service = makeService(FIXTURE_BYTES);

    const results = await extractAttachments(message, {
      workdir,
      documentId: "doc-1",
      service,
    });

    expect(results).toHaveLength(1);
    expect(results[0].partId).toBe("img001abcdef");
    expect(results[0].partType).toBe("IMAGE");
    expect(results[0].filename).toBe("attachment_img001.png");
    expect(results[0].localPath).toBe(
      join(workdir, "downloads", "attachment_img001.png"),
    );
    expect(results[0].mediaType).toBe("image/png");

    // Verify the file was written correctly
    const written = await readFileAsync(results[0].localPath);
    expect(written.equals(FIXTURE_BYTES)).toBe(true);

    // Verify bytes are returned in the result
    expect(results[0].bytes.equals(FIXTURE_BYTES)).toBe(true);
  });

  it("reads each attachment through the document it extracts for", async () => {
    const part = makePart({
      id: "bydoc1abcdef",
      type: "IMAGE",
      mediaType: "image/png",
      attachment: TEST_REF,
    });
    const service = makeService(FIXTURE_BYTES);
    const reads: unknown[][] = [];
    const get = service.get.bind(service);
    service.get = (...args) => {
      reads.push(args);
      return get(...args);
    };

    await extractAttachments(makeMessage([part]), {
      workdir,
      documentId: "doc-reads",
      service,
    });

    // A switchboard serves an attachment only through a document that
    // references it.
    expect(reads).toEqual([[TEST_REF, { documentId: "doc-reads" }]]);
  });

  it("skips a part with attachment ref when no service is provided", async () => {
    const part = makePart({
      id: "noservice1abc",
      type: "IMAGE",
      mediaType: "image/png",
      attachment: TEST_REF,
    });
    const message = makeMessage([part]);

    const results = await extractAttachments(message, {
      workdir,
      documentId: "doc-noservice",
    });

    expect(results).toHaveLength(0);
    expect(existsSync(join(workdir, "downloads"))).toBe(false);
  });

  it("skips TEXT parts", async () => {
    const part = makePart({
      id: "txt001aaaaaa",
      type: "TEXT",
      text: "Hello world",
    });
    const message = makeMessage([part]);

    const results = await extractAttachments(message, {
      workdir,
      documentId: "doc-2",
    });

    expect(results).toHaveLength(0);
    expect(existsSync(join(workdir, "downloads"))).toBe(false);
  });

  it("deduplicates: second call for same document returns empty", async () => {
    const part = makePart({
      id: "dup001abcdef",
      type: "IMAGE",
      mediaType: "image/png",
      attachment: TEST_REF,
    });
    const message = makeMessage([part]);
    const opts = {
      workdir,
      documentId: "doc-3",
      service: makeService(FIXTURE_BYTES),
    };

    const first = await extractAttachments(message, opts);
    expect(first).toHaveLength(1);

    const second = await extractAttachments(message, opts);
    expect(second).toHaveLength(0);
  });

  it("returns already-extracted parts again when asked, read back from disk", async () => {
    const part = makePart({
      id: "again01abcdef",
      type: "IMAGE",
      mediaType: "image/png",
      attachment: TEST_REF,
    });
    const message = makeMessage([part]);
    const service = makeService(FIXTURE_BYTES);
    const opts = { workdir, documentId: "doc-again", service };

    const first = await extractAttachments(message, opts);
    const again = await extractAttachments(message, {
      ...opts,
      includeExtracted: true,
    });

    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({
      partId: first[0].partId,
      localPath: first[0].localPath,
      filename: first[0].filename,
    });
    expect(Buffer.compare(again[0].bytes, first[0].bytes)).toBe(0);
  });

  it("extracts a part again when its saved file is gone", async () => {
    const part = makePart({
      id: "gone01abcdef",
      type: "IMAGE",
      mediaType: "image/png",
      attachment: TEST_REF,
    });
    const message = makeMessage([part]);
    const opts = {
      workdir,
      documentId: "doc-gone",
      service: makeService(FIXTURE_BYTES),
    };

    const first = await extractAttachments(message, opts);
    rmSync(first[0].localPath);
    const again = await extractAttachments(message, {
      ...opts,
      includeExtracted: true,
    });

    expect(again).toHaveLength(1);
    expect(existsSync(again[0].localPath)).toBe(true);
    expect(Buffer.compare(again[0].bytes, first[0].bytes)).toBe(0);
  });

  it("preserves partType from the original content part, not the resolved mediaType", async () => {
    // A FILE part whose service header returns image/png should still have partType 'FILE'.
    const part = makePart({
      id: "fileasimg1ab",
      type: "FILE",
      mediaType: "image/png",
      attachment: TEST_REF,
    });
    const message = makeMessage([part]);
    // Service returns image/png in the header (same as the part's declared mediaType).
    const service = makeService(FIXTURE_BYTES, "image/png");

    const results = await extractAttachments(message, {
      workdir,
      documentId: "doc-parttype",
      service,
    });

    expect(results).toHaveLength(1);
    expect(results[0].partType).toBe("FILE");
    expect(results[0].mediaType).toBe("image/png");
  });

  it("handles parts with no attachment and no url gracefully", async () => {
    const part = makePart({
      id: "empty1abcdef",
      type: "FILE",
      mediaType: "application/pdf",
    });
    const message = makeMessage([part]);

    const results = await extractAttachments(message, {
      workdir,
      documentId: "doc-4",
    });

    expect(results).toHaveLength(0);
  });

  it("extracts multiple attachments from one message", async () => {
    const fakePdfBytes = Buffer.from("fake pdf content");
    const imgPart = makePart({
      id: "multi1abcdef",
      type: "IMAGE",
      mediaType: "image/png",
      attachment: TEST_REF,
    });
    const filePart = makePart({
      id: "multi2abcdef",
      type: "FILE",
      mediaType: "application/pdf",
      filename: "report.pdf",
      attachment: "attachment://v1:cafebabe",
    });
    const textPart = makePart({
      id: "multi3aaaaaa",
      type: "TEXT",
      text: "Check these files",
    });
    const message = makeMessage([textPart, imgPart, filePart]);

    // Service returns different bytes depending on the ref
    const serviceStub: IAttachmentService = {
      get: (
        ref: AttachmentRef,
      ): Promise<{
        header: AttachmentHeader;
        body: ReadableStream<Uint8Array>;
      }> => {
        const refBytes = ref.includes("deadbeef")
          ? FIXTURE_BYTES
          : fakePdfBytes;
        const mimeType = ref.includes("deadbeef")
          ? "image/png"
          : "application/pdf";
        return Promise.resolve({
          header: {
            hash: ref,
            mimeType,
            fileName: "file",
            sizeBytes: refBytes.byteLength,
            extension: null,
            status: "available" as const,
            source: "local" as const,
            createdAtUtc: new Date().toISOString(),
            lastAccessedAtUtc: new Date().toISOString(),
            expiresAtUtc: null,
          },
          body: streamFromBuffer(refBytes),
        });
      },
      reserve: () => {
        throw new Error("not implemented");
      },
      stat: () => {
        throw new Error("not implemented");
      },
      getDownloadTarget: () => {
        throw new Error("not implemented");
      },
    };

    const results = await extractAttachments(message, {
      workdir,
      documentId: "doc-5",
      service: serviceStub,
    });

    expect(results).toHaveLength(2);
    expect(results[0].filename).toBe("attachment_multi1.png");
    expect(results[0].partType).toBe("IMAGE");
    expect(results[1].filename).toBe("report_multi2.pdf");
    expect(results[1].partType).toBe("FILE");

    // Both files exist on disk
    expect(existsSync(results[0].localPath)).toBe(true);
    expect(existsSync(results[1].localPath)).toBe(true);

    // Bytes are present
    expect(results[0].bytes.equals(FIXTURE_BYTES)).toBe(true);
    expect(results[1].bytes.equals(fakePdfBytes)).toBe(true);
  });
});

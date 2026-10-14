// Drives createAttachmentCommands() against a REAL local reactor-attachments
// service (in-memory PGlite + temp storage via AttachmentBuilder), no daemon
// or network — exercises the command wiring through the hash-first
// submit-before-upload contract. Matches the "real implementations, no mocks"
// testing convention.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kysely } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { PGliteDialect } from "kysely-pglite-dialect";
import {
  AttachmentBuilder,
  type IAttachmentService,
} from "@powerhousedao/reactor-attachments";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import type { Command, CommandContext } from "../src/core/types.js";
// Import the module directly (not the powerhouse barrel) to avoid loading
// switchboard/connect, which trip jest's CJS→ESM (p-map) break.
import { createAttachmentCommands } from "../src/integrations/powerhouse/attachment-commands.js";
import {
  inferMimeType,
  isAttachmentAlreadyExists,
} from "../src/integrations/powerhouse/attachment.js";

const cmds = createAttachmentCommands();
const cmd = (id: string): Command => {
  const c = cmds.find((x) => x.id === id);
  if (!c) throw new Error(`no command ${id}`);
  return c;
};
const run = async (
  id: string,
  input: unknown,
  ctx: CommandContext,
): Promise<string> => {
  const r = (await cmd(id).execute(input as never, ctx)) as { text: string };
  return r.text;
};

function makeCtx(
  workdir: string,
  attachments?: IAttachmentService,
): CommandContext {
  return {
    workdir,
    workspace: createMemoryWorkdirStore(),
    config: {},
    stdout: () => {},
    // folders truthy = "reactor running" signal the commands gate on.
    folders: attachments ? ({} as never) : undefined,
    reactor: async () => (attachments ? ({ attachments } as never) : undefined),
  } as unknown as CommandContext;
}

function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const CONTENT = "ph-clint attachment command test";
const EXPECTED_HASH = createHash("sha256")
  .update(Buffer.from(CONTENT))
  .digest("hex");
const EXPECTED_REF = `attachment://v1:${EXPECTED_HASH}`;
const REF_RE = /^attachment:\/\/v1:[0-9a-f]{64}$/;

describe("createAttachmentCommands (local service, end-to-end)", () => {
  let db: Kysely<unknown>;
  let service: IAttachmentService;
  let destroyService: () => void;
  let workdir: string;
  let storagePath: string;
  let ctx: CommandContext;
  let filePath: string;

  beforeAll(async () => {
    db = new Kysely<unknown>({ dialect: new PGliteDialect(new PGlite()) });
    storagePath = mkdtempSync(join(tmpdir(), "phc-attach-store-"));
    const built = await new AttachmentBuilder(db, storagePath).build();
    service = built.service;
    destroyService = built.destroy;

    workdir = mkdtempSync(join(tmpdir(), "phc-attach-wd-"));
    filePath = join(workdir, "note.txt");
    writeFileSync(filePath, CONTENT);
    ctx = makeCtx(workdir, service);
  });

  afterAll(async () => {
    destroyService?.();
    await db?.destroy();
    rmSync(storagePath, { recursive: true, force: true });
    rmSync(workdir, { recursive: true, force: true });
  });

  it("preprocess yields the deterministic ref WITHOUT uploading", async () => {
    const out = parse(await run("attachment-preprocess", { filePath }, ctx));
    expect(out.ref).toBe(EXPECTED_REF);
    expect(out.ref).toMatch(REF_RE);
    expect(out.hash).toBe(EXPECTED_HASH);
    expect(out.sizeBytes).toBe(String(Buffer.byteLength(CONTENT)));
  });

  it("upload stores the bytes and returns the same ref (available)", async () => {
    const out = parse(await run("attachment-upload", { filePath }, ctx));
    expect(out.ref).toBe(EXPECTED_REF);
    expect(out.status).toBe("available");
    expect(out.fileName).toBe("note.txt");
  });

  it("stat reports available metadata for an uploaded ref", async () => {
    const out = parse(await run("attachment-stat", { ref: EXPECTED_REF }, ctx));
    expect(out.status).toBe("available");
    expect(out.sizeBytes).toBe(String(Buffer.byteLength(CONTENT)));
  });

  it("get streams the stored bytes back to disk byte-for-byte", async () => {
    const outPath = join(workdir, "roundtrip.txt");
    const text = await run(
      "attachment-get",
      { ref: EXPECTED_REF, outPath },
      ctx,
    );
    expect(text).toMatch(/Wrote \d+ bytes/);
    expect(readFileSync(outPath, "utf8")).toBe(CONTENT);
  });

  it("re-uploading identical bytes dedups to the same ref without error", async () => {
    const out = parse(await run("attachment-upload", { filePath }, ctx));
    expect(out.ref).toBe(EXPECTED_REF);
    expect(out.status).toBe("available");
  });

  it("different bytes produce a different ref", async () => {
    const otherPath = join(workdir, "other.txt");
    writeFileSync(otherPath, "a completely different payload");
    const out = parse(
      await run("attachment-preprocess", { filePath: otherPath }, ctx),
    );
    expect(out.ref).toMatch(REF_RE);
    expect(out.ref).not.toBe(EXPECTED_REF);
  });

  it("stat on an unknown ref reports not-found rather than throwing", async () => {
    const unknown = `attachment://v1:${"0".repeat(64)}`;
    const text = await run("attachment-stat", { ref: unknown }, ctx);
    expect(text).toMatch(/Not found or error/);
  });

  it("get on an unknown ref reports an error rather than throwing", async () => {
    const unknown = `attachment://v1:${"0".repeat(64)}`;
    const text = await run(
      "attachment-get",
      { ref: unknown, outPath: join(workdir, "x.bin") },
      ctx,
    );
    expect(text).toMatch(/Could not get/);
  });

  it("returns the unavailable message when no reactor is wired (one-shot)", async () => {
    for (const id of [
      "attachment-preprocess",
      "attachment-upload",
      "attachment-stat",
      "attachment-get",
    ]) {
      const text = await run(
        id,
        { filePath, ref: EXPECTED_REF, outPath: join(workdir, "x") },
        makeCtx(workdir, undefined),
      );
      expect(text).toMatch(/running reactor/);
    }
  });
});

describe("attachment helpers", () => {
  it("inferMimeType: extension map, override, octet-stream fallback", () => {
    expect(inferMimeType("a.png")).toBe("image/png");
    expect(inferMimeType("a.bin", "application/custom")).toBe(
      "application/custom",
    );
    expect(inferMimeType("a.unknownext")).toBe("application/octet-stream");
  });

  it("isAttachmentAlreadyExists: matches by name/ref shape, rejects others", () => {
    const real = Object.assign(
      new Error("Attachment already exists for hash: abc"),
      {
        ref: "attachment://v1:abc",
        hash: "abc",
      },
    );
    expect(isAttachmentAlreadyExists(real)).toBe(true);
    expect(isAttachmentAlreadyExists(new Error("nope"))).toBe(false);
    expect(isAttachmentAlreadyExists({ ref: "x", hash: "y" })).toBe(false);
    expect(isAttachmentAlreadyExists(null)).toBe(false);
  });
});

// ctx.files for actions, end to end over the worker boundary: the piece writes
// bytes into a staging directory the fork shares with the host, the host
// ingests them and rewrites the provisional tokens before the output is
// journalled, and an attachment reference on the way in reaches the piece as a
// real ApFile. Bytes never cross the IPC channel in either direction.
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivepiecesBlockExecutor,
  type AttachmentPort,
} from "../../../src/pieces/engine/blocks.js";
import type { BlockExecution } from "../../../src/pieces/engine/types.js";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";
import {
  DataUriFilesService,
  rewriteFileRefs,
  StagedFilesService,
} from "../../../src/pieces/activepieces/context/files.js";
import { FileTooLargeError } from "../../../src/pieces/activepieces/context/limits.js";

// Writes two files and nests one reference deep in the output, so the host's
// rewrite has to walk the whole value rather than string-replace the JSON.
const WRITER_FIXTURE = `
const app = {
  displayName: "Writer Fixture",
  actions: {
    emit: {
      name: "emit",
      displayName: "Emit",
      props: {},
      run: async (ctx) => {
        const first = await ctx.files.write({
          fileName: "report.pdf",
          data: Buffer.from("first-bytes"),
        });
        const second = await ctx.files.write({
          fileName: "thumb.webp",
          data: Buffer.from("second-bytes"),
        });
        return {
          ref: first,
          nested: { list: [{ deep: second }], note: "not a ref" },
        };
      },
    },
  },
};
module.exports = { app };
`;

// Echoes back what a FILE-typed prop actually looked like inside the piece.
const READER_FIXTURE = `
const app = {
  displayName: "Reader Fixture",
  actions: {
    consume: {
      name: "consume",
      displayName: "Consume",
      props: { attachment: { type: "FILE", required: true, displayName: "File" } },
      run: async (ctx) => {
        const file = ctx.propsValue.attachment;
        return {
          filename: file.filename,
          extension: file.extension,
          text: Buffer.from(file.base64, "base64").toString("utf8"),
          isBuffer: Buffer.isBuffer(file.data),
        };
      },
    },
  },
};
module.exports = { app };
`;

// The dispatch case: a reference travels through a text prop as data, and the
// action never opens it.
const CARRIER_FIXTURE = `
const app = {
  displayName: "Carrier Fixture",
  actions: {
    carry: {
      name: "carry",
      displayName: "Carry",
      props: {
        sourceDocument: { type: "SHORT_TEXT", required: true, displayName: "Ref" },
      },
      run: async (ctx) => ({ sourceDocument: ctx.propsValue.sourceDocument }),
    },
  },
};
module.exports = { app };
`;

const NO_STORE_FIXTURE = WRITER_FIXTURE;

let cacheDir = "";
let stagingRoot = "";
let storeDir = "";
let worker: PieceWorker;

// The production cache layout ensurePieceBundle looks in: a fixture written
// there is picked up without any network access.
async function writeFixture(name: string, source: string): Promise<string> {
  const dir = join(cacheDir, `${name.replace("/", "-")}-1.0.0`);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "index.js" }),
  );
  await writeFile(join(dir, "index.js"), source);
  return dir;
}

// Stands in for the reactor's attachment store: content-addressed writes and
// document-authorized reads, both over the filesystem.
function attachmentPort(): AttachmentPort & {
  written: { fileName: string; size: number; contentType?: string }[];
  seed: (ref: string, contents: string, fileName?: string) => Promise<void>;
} {
  const written: { fileName: string; size: number; contentType?: string }[] =
    [];
  const seeded = new Map<string, { contents: string; fileName?: string }>();
  return {
    written,
    async seed(ref, contents, fileName) {
      seeded.set(ref, { contents, fileName });
      await Promise.resolve();
    },
    async read(ref, destPath) {
      const entry = seeded.get(ref);
      if (!entry) throw new Error(`no seeded attachment for ${ref}`);
      await writeFile(destPath, entry.contents);
      return { fileName: entry.fileName, contentType: "application/pdf" };
    },
    async write(file) {
      const data = await readFile(file.path);
      written.push({
        fileName: file.fileName,
        size: file.size,
        contentType: file.contentType,
      });
      const digest = Buffer.from(data).toString("hex").slice(0, 12);
      await writeFile(join(storeDir, digest), data);
      return `attachment://v1:${digest}`;
    },
  };
}

function execution(blockType: string, config: unknown): BlockExecution {
  return {
    blockType,
    config,
    step: { id: "s1", key: "step", blockType } as BlockExecution["step"],
  };
}

describe("AttachmentBridge", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-attachments-"));
    stagingRoot = await mkdtemp(join(tmpdir(), "ap-staging-"));
    storeDir = await mkdtemp(join(tmpdir(), "ap-store-"));
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(storeDir, { recursive: true, force: true });
  });

  it("ingests written files and rewrites every token in the output", async () => {
    await writeFixture("@test/writer", WRITER_FIXTURE);
    const port = attachmentPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: port,
    });
    const result = await executor.execute(
      execution("@test/writer@1.0.0#emit", {}),
    );

    const output = result.output as {
      ref: string;
      nested: { list: { deep: string }[]; note: string };
    };
    expect(output.ref).toMatch(/^attachment:\/\/v1:/);
    expect(output.nested.list[0].deep).toMatch(/^attachment:\/\/v1:/);
    expect(output.nested.list[0].deep).not.toBe(output.ref);
    expect(output.nested.note).toBe("not a ref");

    expect(port.written).toEqual([
      { fileName: "report.pdf", size: 11, contentType: "application/pdf" },
      { fileName: "thumb.webp", size: 12, contentType: "image/webp" },
    ]);
    // The staging directory is gone once the step returns.
    expect(await readdir(stagingRoot)).toEqual([]);
  });

  it("hydrates an attachment reference into an ApFile for a FILE prop", async () => {
    await writeFixture("@test/reader", READER_FIXTURE);
    const port = attachmentPort();
    await port.seed("attachment://v1:abc", "scanned-bytes", "invoice.pdf");
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: port,
    });

    const result = await executor.execute(
      execution("@test/reader@1.0.0#consume", {
        attachment: "attachment://v1:abc",
      }),
    );

    expect(result.output).toEqual({
      filename: "invoice.pdf",
      extension: "pdf",
      text: "scanned-bytes",
      isBuffer: true,
    });
    expect(await readdir(stagingRoot)).toEqual([]);
  });

  it("carries a reference it cannot stage through to the piece as data", async () => {
    await writeFixture("@test/carrier", CARRIER_FIXTURE);
    // Nothing seeded, so every read is refused the way the reactor refuses a
    // ref the workflow document does not itself reference.
    const port = attachmentPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: port,
    });

    const result = await executor.execute(
      execution("@test/carrier@1.0.0#carry", {
        sourceDocument: "attachment://v1:unreadable",
      }),
    );

    expect(result.output).toEqual({
      sourceDocument: "attachment://v1:unreadable",
    });
    expect(await readdir(stagingRoot)).toEqual([]);
  });

  it("still fails the step when a FILE prop needed the reference", async () => {
    await writeFixture("@test/reader", READER_FIXTURE);
    const port = attachmentPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: port,
    });

    await expect(
      executor.execute(
        execution("@test/reader@1.0.0#consume", {
          attachment: "attachment://v1:missing",
        }),
      ),
    ).rejects.toThrow(
      /No staged file for reference "attachment:\/\/v1:missing"/,
    );
    expect(await readdir(stagingRoot)).toEqual([]);
  });

  it("fails loudly when a piece writes a file and no store is configured", async () => {
    await writeFixture("@test/nostore", NO_STORE_FIXTURE);
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
    });

    await expect(
      executor.execute(execution("@test/nostore@1.0.0#emit", {})),
    ).rejects.toThrow(/no attachment store is configured/);
  });

  it("falls back to inline data URIs when the host stages nothing", async () => {
    await writeFixture("@test/inline", WRITER_FIXTURE);
    const executor = new ActivepiecesBlockExecutor({ cacheDir, worker });

    const result = await executor.execute(
      execution("@test/inline@1.0.0#emit", {}),
    );

    expect((result.output as { ref: string }).ref).toMatch(
      /^data:application\/octet-stream;base64,/,
    );
  });
});

describe("StagedFilesService", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ap-staged-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes bytes to disk and reports them with a provisional token", async () => {
    const service = new StagedFilesService(join(dir, "run-1"));
    const token = await service.write({
      fileName: "a.pdf",
      data: Buffer.from("hello"),
    });

    expect(token).toMatch(/^apfile:\/\//);
    const [staged] = service.staged();
    expect(staged).toMatchObject({
      token,
      fileName: "a.pdf",
      size: 5,
      contentType: "application/pdf",
    });
    expect((await readFile(staged.path)).toString()).toBe("hello");
  });

  it("refuses an oversized file before writing it", async () => {
    process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES = "4";
    try {
      const service = new StagedFilesService(join(dir, "run-2"));
      await expect(
        service.write({ fileName: "big.pdf", data: Buffer.alloc(5) }),
      ).rejects.toBeInstanceOf(FileTooLargeError);
      expect(service.staged()).toEqual([]);
      await expect(readdir(join(dir, "run-2"))).rejects.toThrow();
    } finally {
      delete process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;
    }
  });

  it("applies the same cap to the inline fallback", async () => {
    process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES = "4";
    try {
      await expect(
        new DataUriFilesService().write({ data: Buffer.alloc(5) }),
      ).rejects.toBeInstanceOf(FileTooLargeError);
    } finally {
      delete process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;
    }
  });
});

describe("rewriteFileRefs", () => {
  it("replaces whole string values only", () => {
    const refs = new Map([["apfile://t1", "attachment://v1:aa"]]);
    expect(
      rewriteFileRefs(
        {
          exact: "apfile://t1",
          embedded: "see apfile://t1 for details",
          list: ["apfile://t1", 3, null],
        },
        refs,
      ),
    ).toEqual({
      exact: "attachment://v1:aa",
      embedded: "see apfile://t1 for details",
      list: ["attachment://v1:aa", 3, null],
    });
  });

  it("returns the value untouched when nothing was staged", () => {
    const value = { a: 1 };
    expect(rewriteFileRefs(value, new Map())).toBe(value);
  });
});

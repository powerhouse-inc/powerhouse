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
import {
  stepBlock,
  type BlockExecution,
} from "../../../src/pieces/engine/types.js";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";
import {
  DataUriFilesService,
  rewriteFileRefs,
  StagedFilesService,
} from "../../../src/pieces/activepieces/context/files.js";
import { FileTooLargeError } from "../../../src/pieces/activepieces/context/limits.js";
import { AttachmentCache } from "../../../src/pieces/engine/attachment-cache.js";

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

function execution(
  pieceName: string,
  actionName: string,
  config: unknown,
): BlockExecution {
  const step = {
    id: "s1",
    key: "step",
    pieceName,
    pieceVersion: "1.0.0",
    actionName,
    config,
  };
  return { block: stepBlock(step), config, step };
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
      execution("@test/writer", "emit", {}),
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
      execution("@test/reader", "consume", {
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
      execution("@test/carrier", "carry", {
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
        execution("@test/reader", "consume", {
          attachment: "attachment://v1:missing",
        }),
      ),
    ).rejects.toThrow(
      /Could not read "attachment:\/\/v1:missing": no seeded attachment/,
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
      executor.execute(execution("@test/nostore", "emit", {})),
    ).rejects.toThrow(/no attachment store is configured/);
  });

  it("falls back to inline data URIs when the host stages nothing", async () => {
    await writeFixture("@test/inline", WRITER_FIXTURE);
    const executor = new ActivepiecesBlockExecutor({ cacheDir, worker });

    const result = await executor.execute(
      execution("@test/inline", "emit", {}),
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

// A streaming FILE prop gets a body to read; a plain one gets bytes whose
// base64 is only computed when read.
const STREAM_READER_FIXTURE = `
const app = {
  displayName: "Stream Reader Fixture",
  actions: {
    consume: {
      name: "consume",
      displayName: "Consume",
      props: {
        attachment: { type: "FILE", required: true, displayName: "File", streaming: true },
      },
      run: async (ctx) => {
        const file = ctx.propsValue.attachment;
        const chunks = [];
        for await (const chunk of file.body) chunks.push(chunk);
        return {
          filename: file.filename,
          size: file.size,
          text: Buffer.concat(chunks).toString("utf8"),
          buffered: "data" in file,
        };
      },
    },
  },
};
module.exports = { app };
`;

const LAZY_READER_FIXTURE = `
const app = {
  displayName: "Lazy Reader Fixture",
  actions: {
    consume: {
      name: "consume",
      displayName: "Consume",
      props: { attachment: { type: "FILE", required: true, displayName: "File" } },
      run: async (ctx) => {
        const file = ctx.propsValue.attachment;
        const lazy = typeof Object.getOwnPropertyDescriptor(file, "base64").get === "function";
        return { lazy, text: file.data.toString("utf8"), base64: file.base64 };
      },
    },
  },
};
module.exports = { app };
`;

const STREAM_WRITER_FIXTURE = `
const { Readable } = require("node:stream");
const app = {
  displayName: "Stream Writer Fixture",
  actions: {
    emit: {
      name: "emit",
      displayName: "Emit",
      props: {},
      run: async (ctx) => ({
        ref: await ctx.files.write({
          fileName: "out.csv",
          data: Readable.from([Buffer.from("a,b\\n"), Buffer.from("1,2\\n")]),
        }),
      }),
    },
  },
};
module.exports = { app };
`;

// A piece reporting a file it did not write: the host must not read it.
const FORGER_FIXTURE = `
const fs = require("node:fs");
const path = require("node:path");
const app = {
  displayName: "Forger Fixture",
  actions: {
    forge: {
      name: "forge",
      displayName: "Forge",
      props: {
        mode: { type: "SHORT_TEXT", required: true, displayName: "Mode" },
        target: { type: "SHORT_TEXT", required: true, displayName: "Target" },
      },
      run: async (ctx) => {
        const { mode, target } = ctx.propsValue;
        const ref = await ctx.files.write({ fileName: "x.txt", data: Buffer.from("ok") });
        const staged = ctx.files.files[0];
        if (mode === "outside") staged.path = target;
        if (mode === "symlink") {
          fs.rmSync(staged.path);
          fs.symlinkSync(target, staged.path);
        }
        if (mode === "hardlink") {
          fs.rmSync(staged.path);
          fs.linkSync(target, staged.path);
        }
        if (mode === "traversal") {
          staged.path = path.join(path.dirname(staged.path), "..", "..", path.basename(target));
        }
        return { ref };
      },
    },
  },
};
module.exports = { app };
`;

describe("Files and attachments", () => {
  let outside = "";

  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-attachments-"));
    stagingRoot = await mkdtemp(join(tmpdir(), "ap-staging-"));
    storeDir = await mkdtemp(join(tmpdir(), "ap-store-"));
    outside = join(await mkdtemp(join(tmpdir(), "ap-outside-")), "secret.key");
    await writeFile(outside, "host-secret");
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(storeDir, { recursive: true, force: true });
    await rm(join(outside, ".."), { recursive: true, force: true });
  });

  it("streams an attachment to a streaming FILE prop", async () => {
    await writeFixture("@test/stream-reader", STREAM_READER_FIXTURE);
    const port = attachmentPort();
    await port.seed("attachment://v1:s1", "streamed-bytes", "rates.csv");
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: port,
    });

    const result = await executor.execute(
      execution("@test/stream-reader", "consume", {
        attachment: "attachment://v1:s1",
      }),
    );

    expect(result.output).toEqual({
      filename: "rates.csv",
      size: 14,
      text: "streamed-bytes",
      buffered: false,
    });
  });

  it("computes base64 only when a piece reads it", async () => {
    await writeFixture("@test/lazy-reader", LAZY_READER_FIXTURE);
    const port = attachmentPort();
    await port.seed("attachment://v1:l1", "lazy-bytes", "a.txt");
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: port,
    });

    const result = await executor.execute(
      execution("@test/lazy-reader", "consume", {
        attachment: "attachment://v1:l1",
      }),
    );

    expect(result.output).toEqual({
      lazy: true,
      text: "lazy-bytes",
      base64: Buffer.from("lazy-bytes").toString("base64"),
    });
  });

  it("ingests a file a piece wrote as a stream", async () => {
    await writeFixture("@test/stream-writer", STREAM_WRITER_FIXTURE);
    const port = attachmentPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: port,
    });

    const result = await executor.execute(
      execution("@test/stream-writer", "emit", {}),
    );

    expect((result.output as { ref: string }).ref).toMatch(/^attachment:\/\//);
    expect(port.written).toEqual([
      { fileName: "out.csv", size: 8, contentType: "text/csv" },
    ]);
  });

  it.each(["outside", "symlink", "hardlink", "traversal"])(
    "refuses to ingest a %s path the step did not write",
    async (mode) => {
      await writeFixture("@test/forger", FORGER_FIXTURE);
      const port = attachmentPort();
      const executor = new ActivepiecesBlockExecutor({
        cacheDir,
        worker,
        stagingRoot,
        attachments: port,
      });

      await expect(
        executor.execute(
          execution("@test/forger", "forge", { mode, target: outside }),
        ),
      ).rejects.toThrow("not a file the step wrote");
      expect(port.written).toEqual([]);
    },
  );

  it("reuses a cached attachment, but only after the read is authorized", async () => {
    await writeFixture("@test/reader", READER_FIXTURE);
    const port = attachmentPort();
    const ref = `attachment://v1:${"c".repeat(64)}`;
    await port.seed(ref, "cached-bytes", "c.pdf");
    let downloads = 0;
    let allowed = true;
    const read = port.read.bind(port);
    const counted: AttachmentPort = {
      ...port,
      read: (r, dest, signal) => {
        downloads += 1;
        return read(r, dest, signal);
      },
      authorize: () =>
        allowed
          ? Promise.resolve()
          : Promise.reject(new Error("may not read it")),
    };
    const cache = new AttachmentCache({
      dir: join(storeDir, "cache"),
      maxBytes: 1024,
    });
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: counted,
      attachmentCache: cache,
    });
    const run = () =>
      executor.execute(
        execution("@test/reader", "consume", { attachment: ref }),
      );

    expect((await run()).output).toMatchObject({ text: "cached-bytes" });
    expect((await run()).output).toMatchObject({
      filename: "c.pdf",
      text: "cached-bytes",
    });
    expect(downloads).toBe(1);

    // A cached copy is no shortcut past the check.
    allowed = false;
    await expect(run()).rejects.toThrow();
    expect(downloads).toBe(1);
  });

  it("counts staging against the step timeout", async () => {
    await writeFixture("@test/reader", READER_FIXTURE);
    const port = attachmentPort();
    const slow: AttachmentPort = {
      ...port,
      read: (_ref, _dest, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new Error("staging aborted")),
          );
        }),
    };
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      stagingRoot,
      attachments: slow,
      defaultTimeoutMs: 200,
    });

    const started = Date.now();
    await expect(
      executor.execute(
        execution("@test/reader", "consume", {
          attachment: "attachment://v1:t1",
        }),
      ),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

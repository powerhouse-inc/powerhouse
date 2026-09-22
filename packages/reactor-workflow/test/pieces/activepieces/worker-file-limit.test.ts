// The file ceiling is enforced in the worker child, which is forked without an
// environment, so it has to travel on the wire the way the egress policy does.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActivepiecesBlockExecutor } from "../../../src/pieces/engine/blocks.js";
import type { BlockExecution } from "../../../src/pieces/engine/types.js";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";

// Writes however many bytes it is asked for, through the same ctx.files a real
// piece uses.
const WRITER_FIXTURE = `
const app = {
  displayName: "Writer Fixture",
  actions: {
    emit: {
      name: "emit",
      displayName: "Emit",
      props: {},
      run: async (ctx) => {
        const bytes = Buffer.alloc(ctx.propsValue.size, 1);
        return { url: await ctx.files.write({ fileName: "out.bin", data: bytes }) };
      },
    },
  },
};
module.exports = { app, Writer: app };
`;

let cacheDir: string;
let worker: PieceWorker;

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

function emit(size: number): BlockExecution {
  const blockType = "@test/writer@1.0.0#emit";
  return {
    blockType,
    config: { size },
    step: { id: "s1", key: "step", blockType } as BlockExecution["step"],
  };
}

describe("the file ceiling reaches the worker child", () => {
  const original = process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;

  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-file-limit-"));
    worker = new PieceWorker();
    await writeFixture("@test/writer", WRITER_FIXTURE);
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;
    } else {
      process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES = original;
    }
  });

  it("refuses a write over the host's limit", async () => {
    process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES = "64";
    const executor = new ActivepiecesBlockExecutor({ cacheDir, worker });

    await expect(executor.execute(emit(128))).rejects.toThrow(
      /128 bytes exceeds the 64 byte limit/,
    );
  });

  // Read per request, so the same child answers the next one under whatever
  // the host says then.
  it("allows the same write once the limit is raised", async () => {
    process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES = "256";
    const executor = new ActivepiecesBlockExecutor({ cacheDir, worker });

    const result = await executor.execute(emit(128));

    expect((result.output as { url: string }).url).toContain(
      "data:application/octet-stream;base64,",
    );
  });

  it("falls back to the built-in default when the host sets nothing", async () => {
    delete process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;
    const executor = new ActivepiecesBlockExecutor({ cacheDir, worker });

    const result = await executor.execute(emit(128));

    expect((result.output as { url: string }).url).toContain(
      "data:application/octet-stream;base64,",
    );
  });
});

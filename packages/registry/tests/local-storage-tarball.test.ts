import { LocalDatabase } from "@verdaccio/local-storage";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  http: () => undefined,
  child: () => logger,
};

let dir: string | undefined;

afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("@verdaccio/local-storage readTarball", () => {
  // A stream closed while opening hands its 'open' listener a closed fd
  it("survives tarball streams closed while they open", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-registry-ls-"));
    const db = new LocalDatabase(
      {
        storage: dir,
        packages: {},
        configPath: path.join(dir, "config.yaml"),
        self_path: path.join(dir, "config.yaml"),
      } as never,
      logger as never,
    );
    const storage = db.getPackageStorage("pkg");
    fs.mkdirSync(path.join(dir, "pkg"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "pkg", "pkg-1.0.0.tgz"),
      Buffer.alloc(2048),
    );

    const rejections: unknown[] = [];
    const onRejection = (err: unknown) => rejections.push(err);
    process.on("unhandledRejection", onRejection);
    try {
      const signal = new AbortController().signal;
      await Promise.all(
        Array.from({ length: 2000 }, async () => {
          const stream = await storage.readTarball("pkg-1.0.0.tgz", { signal });
          stream.destroy();
          await new Promise((resolve) => stream.once("close", resolve));
        }),
      );
      // Lets late fstat callbacks settle
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      process.off("unhandledRejection", onRejection);
    }
    expect(rejections).toEqual([]);
  });
});

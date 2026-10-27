import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  migratePowerhouseConfig,
  SCAFFOLDED_CONNECT_INSTANCE,
} from "./migrate-powerhouse-config.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

function project(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-migrate-config-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "powerhouse.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  return dir;
}

const read = (dir: string): unknown =>
  JSON.parse(readFileSync(join(dir, "powerhouse.config.json"), "utf8"));

describe("migratePowerhouseConfig", () => {
  it("drops the instance block the old scaffold wrote", () => {
    const dir = project({
      reactor: { port: 7123 },
      connect: {
        app: { offline: true },
        instance: { ...SCAFFOLDED_CONNECT_INSTANCE },
      },
    });
    expect(migratePowerhouseConfig(dir)).toBe(true);
    expect(read(dir)).toEqual({
      reactor: { port: 7123 },
      connect: { app: { offline: true } },
    });
    expect(migratePowerhouseConfig(dir)).toBe(false);
  });

  it("keeps a multiReactor the project set itself", () => {
    const own = { connect: { instance: { multiReactor: false } } };
    const edited = {
      connect: {
        instance: { ...SCAFFOLDED_CONNECT_INSTANCE, reactorWorker: true },
      },
    };
    const added = {
      connect: {
        instance: { ...SCAFFOLDED_CONNECT_INSTANCE, reactorClient: "worker" },
      },
    };
    for (const config of [own, edited, added]) {
      const dir = project(config);
      expect(migratePowerhouseConfig(dir)).toBe(false);
      expect(read(dir)).toEqual(config);
    }
  });

  it("leaves a project without the file or a connect block alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-migrate-config-"));
    dirs.push(dir);
    expect(migratePowerhouseConfig(dir)).toBe(false);
    expect(migratePowerhouseConfig(project({ packages: [] }))).toBe(false);
  });
});

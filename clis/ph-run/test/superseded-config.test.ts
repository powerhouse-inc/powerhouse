import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MIGRATION_GUIDE_URL } from "@powerhousedao/shared/clis/deprecations";
import {
  findSupersededConfigKeys,
  refuseSupersededConfigKeys,
} from "../src/services/run/superseded-config.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function project(config: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-superseded-"));
  temporary.push(dir);
  writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify(config),
  );
  return dir;
}

function refusal(dir: string): string {
  try {
    refuseSupersededConfigKeys(dir);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected a refusal");
}

describe("refuseSupersededConfigKeys", () => {
  it("accepts a fresh scaffold shape (referenced keys are fine)", () => {
    const dir = project({
      studio: { port: 6064 },
      reactor: { port: 7064 },
      vetra: { connectPort: 2064 },
      connect: {
        // the whole connect block is handed to the runtime: referenced,
        // never refused, instance.* included
        instance: { reactorWorker: false, multiReactor: false },
        reactor: { createSignaturePolicy: "v2-required" },
      },
    });
    expect(findSupersededConfigKeys(dir)).toEqual([]);
    expect(() => refuseSupersededConfigKeys(dir)).not.toThrow();
  });

  it("refuses every present superseded key, naming its new home and ph migrate", () => {
    const dir = project({
      studio: { port: 6064, openBrowser: true },
      reactor: { port: 7064, storage: { type: "filesystem" } },
    });
    expect(findSupersededConfigKeys(dir)).toEqual([
      "studio.openBrowser",
      "reactor.storage",
    ]);
    expect(refusal(dir)).toBe(
      [
        'powerhouse.config.json "studio.openBrowser" was removed in 6.4. ' +
          "Set runner.openBrowser in hosts/connect/host.js and remove the key.",
        'powerhouse.config.json "reactor.storage" was removed in 6.4. ' +
          "Set reactor.backends.<name>.storage in hosts/switchboard/host.js and remove the key.",
        "`ph migrate` moves the keys it can and says what to do with the rest. " +
          `See ${MIGRATION_GUIDE_URL}`,
      ].join("\n"),
    );
  });

  it("refuses each of the six keys by name", () => {
    const dir = project({
      studio: { host: "0.0.0.0", https: false, openBrowser: false },
      reactor: { https: false, storage: "memory" },
      switchboard: { database: { url: "postgres://localhost/db" } },
    });
    const message = refusal(dir);
    for (const key of [
      "studio.host",
      "studio.https",
      "studio.openBrowser",
      "reactor.https",
      "reactor.storage",
      "switchboard.database.url",
    ]) {
      expect(message, key).toContain(`"${key}" was removed in 6.4.`);
    }
    expect(message).toContain(
      'powerhouse.config.json "studio.https" was removed in 6.4. ' +
        "No host setting replaces it: remove the key.",
    );
  });

  it("accepts a missing or corrupt config", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ph-superseded-"));
    temporary.push(dir);
    expect(() => refuseSupersededConfigKeys(dir)).not.toThrow();
    writeFileSync(path.join(dir, "powerhouse.config.json"), "{ not json");
    expect(() => refuseSupersededConfigKeys(dir)).not.toThrow();
  });
});

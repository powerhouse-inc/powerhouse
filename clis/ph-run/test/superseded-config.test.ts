import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { warnSupersededConfigKeys } from "../src/services/run/superseded-config.js";

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

describe("warnSupersededConfigKeys (P2.7 table)", () => {
  it("is silent on a fresh scaffold shape (referenced keys are fine)", () => {
    const messages: string[] = [];
    const warned = warnSupersededConfigKeys(
      project({
        studio: { port: 6064 },
        reactor: { port: 7064 },
        vetra: { connectPort: 2064 },
        connect: {
          // the whole connect block is handed to the runtime — referenced,
          // never warned, instance.* included
          instance: { reactorWorker: false, multiReactor: false },
          reactor: { createSignaturePolicy: "v2-required" },
        },
      }),
      (m) => messages.push(m),
    );
    expect(warned).toEqual([]);
    expect(messages).toEqual([]);
  });

  it("warns once per present superseded key, naming the new home", () => {
    const messages: string[] = [];
    const warned = warnSupersededConfigKeys(
      project({
        studio: { port: 6064, openBrowser: true },
        reactor: { port: 7064, storage: { type: "filesystem" } },
      }),
      (m) => messages.push(m),
    );
    expect(warned).toEqual(["studio.openBrowser", "reactor.storage"]);
    expect(messages[0]).toContain("runner.openBrowser");
    expect(messages[1]).toContain("reactor.backends.<name>.storage");
  });

  it("returns empty on a missing or corrupt config", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ph-superseded-"));
    temporary.push(dir);
    expect(warnSupersededConfigKeys(dir, () => undefined)).toEqual([]);
  });
});

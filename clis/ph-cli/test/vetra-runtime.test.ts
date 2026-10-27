import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearVetraRuntime,
  probeVetraRuntime,
  readVetraRuntime,
  syncMcpPort,
  writeVetraRuntime,
  type VetraRuntimeRecord,
} from "../src/utils/vetra-runtime.js";

const record: VetraRuntimeRecord = {
  pid: process.pid,
  projectName: "my-package",
  switchboardPort: 41837,
  connectPort: 32837,
  mcpUrl: "http://localhost:41837/mcp",
  startedAt: "2026-09-01T10:22:03.000Z",
};

const tmp = () => mkdtempSync(join(tmpdir(), "ph-rt-"));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vetra runtime record", () => {
  it("round-trips and clears", () => {
    const dir = tmp();
    writeVetraRuntime(dir, record);
    expect(readVetraRuntime(dir)).toEqual(record);
    clearVetraRuntime(dir);
    expect(readVetraRuntime(dir)).toBeUndefined();
  });

  it("clearing a record that is already gone is not an error", () => {
    const dir = tmp();
    expect(() => clearVetraRuntime(dir)).not.toThrow();
  });

  it("reports no instance when the file is absent", async () => {
    await expect(probeVetraRuntime(tmp(), "my-package")).resolves.toEqual({
      status: "none",
    });
  });

  it("reports no instance when the file is corrupt", async () => {
    const dir = tmp();
    mkdirSync(join(dir, ".ph"), { recursive: true });
    writeFileSync(join(dir, ".ph", "vetra-runtime.json"), "{not json");
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({
      status: "none",
    });
  });

  it("treats a dead pid as stale and deletes the record", async () => {
    const dir = tmp();
    // A pid this high is not allocated on any normal Linux/macOS system.
    writeVetraRuntime(dir, { ...record, pid: 2 ** 22 });
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({
      status: "stale",
    });
    expect(readVetraRuntime(dir)).toBeUndefined();
  });

  it("treats a live pid whose /ready never answers as stale", async () => {
    const dir = tmp();
    writeVetraRuntime(dir, record);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({
      status: "stale",
    });
    expect(readVetraRuntime(dir)).toBeUndefined();
  });

  it("treats a non-ok /ready as stale", async () => {
    const dir = tmp();
    writeVetraRuntime(dir, record);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({
      status: "stale",
    });
  });

  it("treats a mismatched projectName as a foreign instance", async () => {
    const dir = tmp();
    writeVetraRuntime(dir, record);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(probeVetraRuntime(dir, "other-package")).resolves.toEqual({
      status: "foreign",
      record,
    });
    // A foreign record must NOT be deleted — it belongs to something alive.
    expect(readVetraRuntime(dir)).toEqual(record);
  });

  it("reports a live instance", async () => {
    const dir = tmp();
    writeVetraRuntime(dir, record);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({
      status: "live",
      record,
    });
  });
});

describe("syncMcpPort", () => {
  const body = (port: number) => ({
    mcpServers: {
      "reactor-mcp": { type: "http", url: `http://localhost:${port}/mcp` },
    },
  });

  it("rewrites a drifted url and reports which files changed", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify(body(4001), null, 2));
    expect(syncMcpPort(dir, 41837)).toEqual([".mcp.json"]);
    const mcp = JSON.parse(
      readFileSync(join(dir, ".mcp.json"), "utf8"),
    ) as ReturnType<typeof body>;
    expect(mcp.mcpServers["reactor-mcp"].url).toBe(
      "http://localhost:41837/mcp",
    );
  });

  it("rewrites the cursor and gemini copies too", () => {
    const dir = tmp();
    mkdirSync(join(dir, ".cursor"), { recursive: true });
    mkdirSync(join(dir, ".gemini"), { recursive: true });
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify(body(4001), null, 2));
    writeFileSync(
      join(dir, ".cursor", "mcp.json"),
      JSON.stringify(body(4001), null, 2),
    );
    const gemini = { context: { fileName: ["AGENTS.md"] }, ...body(4001) };
    writeFileSync(
      join(dir, ".gemini", "settings.json"),
      JSON.stringify(gemini, null, 2),
    );
    expect(syncMcpPort(dir, 41837)).toEqual([
      ".mcp.json",
      join(".cursor", "mcp.json"),
      join(".gemini", "settings.json"),
    ]);
    expect(
      JSON.parse(readFileSync(join(dir, ".gemini", "settings.json"), "utf8")),
    ).toEqual({ context: { fileName: ["AGENTS.md"] }, ...body(41837) });
  });

  it("does nothing when the port already matches", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify(body(41837), null, 2));
    expect(syncMcpPort(dir, 41837)).toEqual([]);
  });

  it("preserves unrelated keys and other servers", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            "reactor-mcp": { type: "http", url: "http://localhost:4001/mcp" },
            other: { type: "http", url: "http://localhost:9999/mcp" },
          },
        },
        null,
        2,
      ),
    );
    syncMcpPort(dir, 41837);
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, { type: string; url: string }>;
    };
    expect(mcp.mcpServers["reactor-mcp"].url).toBe(
      "http://localhost:41837/mcp",
    );
    expect(mcp.mcpServers.other.url).toBe("http://localhost:9999/mcp");
    expect(mcp.mcpServers["reactor-mcp"].type).toBe("http");
  });

  it("skips a missing or unparseable file without throwing", () => {
    const dir = tmp();
    expect(syncMcpPort(dir, 41837)).toEqual([]);
    writeFileSync(join(dir, ".mcp.json"), "{not json");
    expect(syncMcpPort(dir, 41837)).toEqual([]);
  });
});

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("probeVetraRuntime while Vetra boots", () => {
  it("keeps the record of an instance whose /ready is not 200 yet", async () => {
    const dir = tmp();
    const port = await freePort();
    const server = http.createServer((_req, res) => res.writeHead(503).end());
    await new Promise<void>((resolve) => server.listen(port, resolve));
    const booting = { ...record, switchboardPort: port };
    writeVetraRuntime(dir, booting);

    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({
      status: "starting",
      record: booting,
    });
    expect(readVetraRuntime(dir)).toEqual(booting);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({
      status: "stale",
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import {
  checkWorkdir,
  checkCommand,
  checkPort,
  isPortFree,
} from "../src/core/preflight.js";
import { defineService, createServiceManager } from "../src/core/services.js";
import { createEventBus } from "../src/core/events.js";
import type { PreflightContext } from "../src/core/types.js";

const TEST_SERVICE = path.resolve(
  import.meta.dirname,
  "fixtures/test-service.js",
);

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ph-preflight-test-"));
}

function makeCtx(overrides?: Partial<PreflightContext>): PreflightContext {
  return {
    cwd: "/tmp",
    config: {},
    params: {},
    command: "echo ok",
    ...overrides,
  };
}

// ── checkWorkdir ──────────────────────────────────────────────────

describe("checkWorkdir", () => {
  it("passes when test function returns true", () => {
    const check = checkWorkdir(() => true, "Bad dir");
    const result = check(makeCtx());
    expect(result).toEqual({ ok: true });
  });

  it("fails when test function returns false", () => {
    const check = checkWorkdir(() => false, "Not a project", "Try another dir");
    const result = check(makeCtx({ cwd: "/some/path" }));
    expect(result).toEqual({
      ok: false,
      message: "Not a project (cwd: /some/path)",
      hint: "Try another dir",
    });
  });

  it("includes cwd in the failure message", async () => {
    const check = checkWorkdir(() => false, "Wrong dir");
    const result = await check(makeCtx({ cwd: "/my/dir" }));
    expect(result).toHaveProperty("ok", false);
    if (!result.ok) {
      expect(result.message).toContain("/my/dir");
    }
  });

  it("works with a real filesystem check", () => {
    const tmpDir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(tmpDir, "marker.txt"), "");
      const check = checkWorkdir(
        (cwd) => fs.existsSync(path.join(cwd, "marker.txt")),
        "Missing marker",
      );
      expect(check(makeCtx({ cwd: tmpDir }))).toEqual({ ok: true });
      expect(check(makeCtx({ cwd: "/nonexistent" }))).toHaveProperty(
        "ok",
        false,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── checkCommand ──────────────────────────────────────────────────

describe("checkCommand", () => {
  it("passes when binary exists", () => {
    const check = checkCommand("node");
    const result = check(makeCtx());
    expect(result).toEqual({ ok: true });
  });

  it("fails when binary does not exist", () => {
    const check = checkCommand("nonexistent-binary-xyz-123", {
      hint: "Install it",
    });
    const result = check(makeCtx());
    expect(result).toEqual({
      ok: false,
      message: "'nonexistent-binary-xyz-123' not found",
      hint: "Install it",
    });
  });

  it("provides default hint when none given", async () => {
    const check = checkCommand("nonexistent-binary-xyz-123");
    const result = await check(makeCtx());
    if (!result.ok) {
      expect(result.hint).toContain("nonexistent-binary-xyz-123");
    }
  });

  it("fails when versionTest rejects the output", async () => {
    const check = checkCommand("node", {
      versionTest: () => false, // always reject
      hint: "Need node v99",
    });
    const result = await check(makeCtx());
    expect(result).toHaveProperty("ok", false);
    if (!result.ok) {
      expect(result.message).toMatch(/node version mismatch/);
      expect(result.hint).toBe("Need node v99");
    }
  });

  it("passes when versionTest accepts the output", () => {
    const check = checkCommand("node", {
      versionTest: (v) => v.startsWith("v"),
    });
    const result = check(makeCtx());
    expect(result).toEqual({ ok: true });
  });
});

// ── checkPort ─────────────────────────────────────────────────────

describe("checkPort", () => {
  it("passes when port is free", async () => {
    // Use a high ephemeral port unlikely to be in use
    const check = checkPort(0, "Test");
    // Port 0 always binds, so isPortFree(0) returns true
    // Use a specific free port instead
    const freePort = await findFreePort();
    const portCheck = checkPort(freePort, "Test");
    const result = await portCheck(makeCtx());
    expect(result).toEqual({ ok: true });
  });

  it("fails when port is in use", async () => {
    const { port, server } = await bindPort();
    try {
      const check = checkPort(port, "MyService");
      const result = await check(makeCtx());
      expect(result).toEqual({
        ok: false,
        message: `MyService port ${port} is already in use`,
        hint: `Stop the process using port ${port}, or use a different port`,
      });
    } finally {
      await closeServer(server);
    }
  });

  it("accepts a function to extract port from context", async () => {
    const { port, server } = await bindPort();
    try {
      const check = checkPort((ctx) => ctx.params?.myPort as number);
      const result = await check(makeCtx({ params: { myPort: port } }));
      expect(result).toHaveProperty("ok", false);
    } finally {
      await closeServer(server);
    }
  });

  it("skips when port function returns undefined", async () => {
    const check = checkPort(() => undefined);
    const result = await check(makeCtx());
    expect(result).toEqual({ ok: true });
  });

  it("uses generic label when none provided", async () => {
    const { port, server } = await bindPort();
    try {
      const check = checkPort(port);
      const result = await check(makeCtx());
      expect(result).toHaveProperty("ok", false);
      if (!result.ok) {
        expect(result.message).toMatch(/^Port \d+ is already in use$/);
      }
    } finally {
      await closeServer(server);
    }
  });
});

// ── isPortFree ────────────────────────────────────────────────────

describe("isPortFree", () => {
  it("returns true for a free port", async () => {
    const port = await findFreePort();
    expect(await isPortFree(port)).toBe(true);
  });

  it("returns false for a bound port", async () => {
    const { port, server } = await bindPort();
    try {
      expect(await isPortFree(port)).toBe(false);
    } finally {
      await closeServer(server);
    }
  });
});

// ── Preflight in start() ──────────────────────────────────────────

describe("preflight in service start()", () => {
  let servicesDir: string;
  let eventBus: ReturnType<typeof createEventBus>;

  beforeEach(() => {
    servicesDir = makeTmpDir();
    eventBus = createEventBus();
  });

  afterEach(() => {
    fs.rmSync(servicesDir, { recursive: true, force: true });
  });

  it("throws before spawning when a preflight check fails", async () => {
    const svc = defineService({
      id: "test-preflight-fail",
      name: "Test Preflight Fail",
      command: `node ${TEST_SERVICE}`,
      preflight: [
        () => ({ ok: false, message: "Port 9999 in use", hint: "Stop it" }),
      ],
      readiness: { pattern: /Server listening/, timeout: 5_000 },
    });

    const mgr = createServiceManager([svc], {
      config: {},
      servicesDir,
      eventBus,
    });

    await expect(mgr.start("test-preflight-fail")).rejects.toThrow(
      "Test Preflight Fail: Port 9999 in use",
    );

    // No state file or log file should exist inside the service dir
    const svcDir = path.join(servicesDir, "test-preflight-fail");
    if (fs.existsSync(svcDir)) {
      const files = fs.readdirSync(svcDir);
      expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(0);
      expect(files.filter((f) => f.endsWith(".log"))).toHaveLength(0);
    }
  });

  it("includes hint in the error message", async () => {
    const svc = defineService({
      id: "test-preflight-hint",
      name: "Test Hint",
      command: `node ${TEST_SERVICE}`,
      preflight: [
        () => ({ ok: false, message: "Bad dir", hint: "Use --workdir" }),
      ],
    });

    const mgr = createServiceManager([svc], {
      config: {},
      servicesDir,
      eventBus,
    });

    await expect(mgr.start("test-preflight-hint")).rejects.toThrow(
      /Hint: Use --workdir/,
    );
  });

  it("runs checks in order and stops at first failure", async () => {
    const callOrder: string[] = [];

    const svc = defineService({
      id: "test-preflight-order",
      name: "Test Order",
      command: `node ${TEST_SERVICE}`,
      preflight: [
        () => {
          callOrder.push("a");
          return { ok: true };
        },
        () => {
          callOrder.push("b");
          return { ok: false, message: "fail-b" };
        },
        () => {
          callOrder.push("c");
          return { ok: true };
        },
      ],
    });

    const mgr = createServiceManager([svc], {
      config: {},
      servicesDir,
      eventBus,
    });
    await expect(mgr.start("test-preflight-order")).rejects.toThrow("fail-b");
    expect(callOrder).toEqual(["a", "b"]);
  });

  it("supports async preflight checks", async () => {
    const svc = defineService({
      id: "test-preflight-async",
      name: "Test Async",
      command: `node ${TEST_SERVICE}`,
      preflight: [
        async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { ok: false, message: "async fail" };
        },
      ],
    });

    const mgr = createServiceManager([svc], {
      config: {},
      servicesDir,
      eventBus,
    });
    await expect(mgr.start("test-preflight-async")).rejects.toThrow(
      "async fail",
    );
  });

  it("starts normally when all preflight checks pass", async () => {
    const svc = defineService({
      id: "test-preflight-pass",
      name: "Test Pass",
      command: `node ${TEST_SERVICE}`,
      preflight: [() => ({ ok: true }), async () => ({ ok: true })],
      readiness: { pattern: /Server listening/, timeout: 5_000 },
    });

    const mgr = createServiceManager([svc], {
      config: {},
      servicesDir,
      eventBus,
    });
    const instanceId = await mgr.start("test-preflight-pass");
    expect(instanceId).toBeDefined();

    // Cleanup: stop the service
    const instances = mgr.list("test-preflight-pass");
    if (
      instances.some((i) => i.status === "ready" || i.status === "starting")
    ) {
      await mgr.stop("test-preflight-pass");
    }
  }, 10_000);

  it("services without preflight still work", async () => {
    const svc = defineService({
      id: "test-no-preflight",
      name: "Test No Preflight",
      command: `node ${TEST_SERVICE}`,
      readiness: { pattern: /Server listening/, timeout: 5_000 },
    });

    const mgr = createServiceManager([svc], {
      config: {},
      servicesDir,
      eventBus,
    });
    const instanceId = await mgr.start("test-no-preflight");
    expect(instanceId).toBeDefined();

    await mgr.stop("test-no-preflight");
  }, 10_000);
});

// ── Helpers ───────────────────────────────────────────────────────

/** Find a free TCP port by binding to port 0. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("No address")));
      }
    });
    server.once("error", reject);
  });
}

/** Bind a TCP port and return the port number + server handle. */
function bindPort(): Promise<{ port: number; server: net.Server }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve({ port: addr.port, server });
      } else {
        server.close(() => reject(new Error("No address")));
      }
    });
    server.once("error", reject);
  });
}

/** Close a server, returning a promise. */
function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

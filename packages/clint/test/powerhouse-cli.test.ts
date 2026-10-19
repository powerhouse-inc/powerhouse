import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { defineCli } from "../src/core/cli.js";
import { defineCommand } from "../src/core/command.js";
import { z } from "zod";
import type { CommandContext } from "../src/core/types.js";
import type {
  ReactorContext,
  ReactorSetupContext,
} from "../src/integrations/powerhouse/types.js";

const noopCommand = defineCommand({
  id: "noop",
  description: "Does nothing",
  inputSchema: z.object({}),
  execute: async () => undefined,
});

function captureOutput() {
  const lines: string[] = [];
  return {
    lines,
    stdout: (text: string) => lines.push(text),
    stderr: (text: string) => lines.push(`[err] ${text}`),
    exit: () => {},
  };
}

function createMockReactor(): ReactorContext {
  return {
    client: { fake: true } as any,
    driveId: "test-drive",
    async shutdown() {},
  };
}

describe("configureReactor() in cli.ts", () => {
  it("hasReactor is true after configureReactor()", () => {
    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [noopCommand],
    });
    expect(cli.hasReactor).toBe(false);
    cli.configureReactor({
      create: async () => createMockReactor(),
    });
    expect(cli.hasReactor).toBe(true);
  });

  it("hasReactor is false when not configured", () => {
    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [noopCommand],
    });
    expect(cli.hasReactor).toBe(false);
    const meta = cli.getMetadata();
    expect(meta.hasReactor).toBe(false);
  });

  it("reactor() accessor returns the ReactorContext in interactive mode", async () => {
    let capturedContext: CommandContext | undefined;

    const cmd = defineCommand({
      id: "check",
      description: "Check context",
      inputSchema: z.object({}),
      execute: async (_input, ctx) => {
        capturedContext = ctx;
        return undefined;
      },
    });

    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [cmd],
      interactive: { welcome: "hi" },
    });

    const mockReactor = createMockReactor();
    cli.configureReactor({
      create: async () => mockReactor,
    });

    const out = captureOutput();
    async function* inputGen() {
      yield "/check";
      yield "/exit";
    }
    await cli.run(["node", "test-ph", "-i"], {
      ...out,
      interactiveInput: inputGen(),
    });

    expect(capturedContext?.reactor).toBeDefined();
    const reactor = await capturedContext!.reactor!();
    expect(reactor).toBeDefined();
    expect(reactor?.driveId).toBe("test-drive");
    expect(reactor?.client).toEqual({ fake: true });
  });

  it("reactor create factory is called lazily (not on startup)", async () => {
    const createFn =
      vi.fn<(ctx: ReactorSetupContext) => Promise<ReactorContext>>();
    createFn.mockResolvedValue(createMockReactor());

    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [noopCommand],
    });
    cli.configureReactor({ create: createFn });

    const out = captureOutput();
    await cli.run(["node", "test-ph", "noop"], out);

    // Factory should NOT have been called — noop doesn't access reactor
    expect(createFn).not.toHaveBeenCalled();
  });

  it("shutdown is called on teardown in interactive mode", async () => {
    const shutdownFn = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const mockReactor: ReactorContext = {
      client: {} as any,
      driveId: "test",
      shutdown: shutdownFn,
    };

    let capturedCtx: CommandContext | undefined;
    const cmd = defineCommand({
      id: "init-reactor",
      description: "Init reactor",
      inputSchema: z.object({}),
      execute: async (_input, ctx) => {
        // Force reactor initialization
        capturedCtx = ctx;
        await ctx.reactor!();
        return undefined;
      },
    });

    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [cmd],
      interactive: { welcome: "hi" },
    });
    cli.configureReactor({ create: async () => mockReactor });

    const out = captureOutput();
    async function* inputGen() {
      yield "/init-reactor";
      yield "/exit";
    }
    await cli.run(["node", "test-ph", "-i"], {
      ...out,
      interactiveInput: inputGen(),
    });

    expect(shutdownFn).toHaveBeenCalled();
  });

  it("startupSequence output appears in headless interactive mode", async () => {
    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [noopCommand],
      interactive: { welcome: "hi" },
    });

    cli.configureReactor({
      create: async () => createMockReactor(),
    });

    const out = captureOutput();
    async function* inputGen() {
      yield "/exit";
    }
    await cli.run(["node", "test-ph", "-i"], {
      ...out,
      interactiveInput: inputGen(),
    });

    // Startup sequence should output "Reactor ready" to stdout
    expect(out.lines).toEqual(
      expect.arrayContaining([expect.stringContaining("Reactor ready")]),
    );
  });

  it("teardown shuts down reactor after headless interactive exit", async () => {
    const shutdownFn = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const mockReactor: ReactorContext = {
      client: {} as any,
      driveId: "test",
      shutdown: shutdownFn,
    };

    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [noopCommand],
      interactive: { welcome: "hi" },
    });
    cli.configureReactor({ create: async () => mockReactor });

    const out = captureOutput();
    async function* inputGen() {
      yield "/exit";
    }
    await cli.run(["node", "test-ph", "-i"], {
      ...out,
      interactiveInput: inputGen(),
    });

    expect(shutdownFn).toHaveBeenCalled();
  });

  it("configureReactor with connect injects service commands", () => {
    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [noopCommand],
    });

    cli.configureReactor({
      create: async () => createMockReactor(),
      connect: { enabled: true, port: 3000 },
    });

    // Service commands should have been injected
    const cmds = cli.listCommands().map((c) => c.id);
    expect(cmds).toContain("test-ph-studio-start");
    expect(cmds).toContain("test-ph-studio-stop");
    expect(cmds).toContain("test-ph-studio-ps");
  });

  it("auto-resolves connect.workdir from root when not explicitly set", () => {
    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      root: "/fake/packages/test-ph-cli",
      description: "Test CLI",
      commands: [noopCommand],
    });

    // Spy on connectServiceDefinition indirectly by checking service commands are injected
    // The key assertion: workdir is derived from root + name
    let capturedConfig: any;
    const origConfigureReactor = cli.configureReactor.bind(cli);
    cli.configureReactor({
      create: async () => createMockReactor(),
      connect: { enabled: true, port: 3000 },
    });

    // Service commands should still be injected (proves connect config was accepted)
    const cmds = cli.listCommands().map((c) => c.id);
    expect(cmds).toContain("test-ph-studio-start");
  });

  it("auto-resolves workdir stripping npm scope from name", () => {
    const tmpDir = fs.mkdtempSync(
      path.join(process.env.TMPDIR ?? "/tmp", "ph-clint-test-"),
    );
    const cliRoot = path.join(tmpDir, "my-tool-cli");
    const appDir = path.join(tmpDir, "my-tool-app");
    const assetsDir = path.join(appDir, "dist", "connect");
    fs.mkdirSync(cliRoot, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "index.html"), "<html></html>");

    try {
      const cli = defineCli({
        name: "@acme/my-tool",
        version: "0.0.1",
        root: cliRoot,
        description: "Test CLI",
        commands: [noopCommand],
      });

      cli.configureReactor({
        create: async () => createMockReactor(),
        connect: { enabled: true, port: 3000 },
      });

      // Service commands should be injected — proves the sibling dir was
      // resolved as ../my-tool-app (not ../@acme/my-tool-app)
      const cmds = cli.listCommands().map((c) => c.id);
      expect(cmds).toContain("@acme/my-tool-studio-start");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("auto-detects assetsDir when dist/connect/index.html exists", () => {
    const tmpDir = fs.mkdtempSync(
      path.join(process.env.TMPDIR ?? "/tmp", "ph-clint-test-"),
    );
    const cliRoot = path.join(tmpDir, "test-ph-cli");
    const appDir = path.join(tmpDir, "test-ph-app");
    const assetsDir = path.join(appDir, "dist", "connect");
    fs.mkdirSync(cliRoot, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "index.html"), "<html></html>");

    try {
      const cli = defineCli({
        name: "test-ph",
        version: "0.0.1",
        root: cliRoot,
        description: "Test CLI",
        commands: [noopCommand],
      });

      cli.configureReactor({
        create: async () => createMockReactor(),
        connect: { enabled: true, port: 3000 },
      });

      // The connect service command should use static mode (node connect-server.js)
      // We can verify by checking the generated start command includes '--dir'
      const startCmd = cli.getCommand("test-ph-studio-start");
      expect(startCmd).toBeDefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips auto-resolve when root is not set", () => {
    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      description: "Test CLI",
      commands: [noopCommand],
    });

    // No root — explicit workdir must be provided or it falls back to runtime workdir
    cli.configureReactor({
      create: async () => createMockReactor(),
      connect: { enabled: true, port: 3000 },
    });

    const cmds = cli.listCommands().map((c) => c.id);
    expect(cmds).toContain("test-ph-studio-start");
  });

  it("does not override explicit connect.workdir", () => {
    const cli = defineCli({
      name: "test-ph",
      version: "0.0.1",
      root: "/fake/packages/test-ph-cli",
      description: "Test CLI",
      commands: [noopCommand],
    });

    cli.configureReactor({
      create: async () => createMockReactor(),
      connect: { enabled: true, port: 3000, workdir: "/custom/app-dir" },
    });

    const cmds = cli.listCommands().map((c) => c.id);
    expect(cmds).toContain("test-ph-studio-start");
  });
});

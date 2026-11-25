import { describe, it, expect, vi } from "vitest";
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
});

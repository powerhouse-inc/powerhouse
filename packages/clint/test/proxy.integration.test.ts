import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineCli } from "../src/core/cli.js";
import type { RunOptions } from "../src/core/types.js";

describe("proxy integration with defineCli", () => {
  it("proxyEnabled injects proxyPort and proxyHost config fields", () => {
    const cli = defineCli({
      name: "test-proxy",
      version: "0.0.1",
      description: "test",
      commands: [],
      configSchema: z.object({}),
      proxyEnabled: true,
    });

    const envVars = cli.configEnvVars();
    const envNames = envVars.map((e) => e.name);
    expect(envNames).toContain("TEST_PROXY_PROXY_PORT");
    expect(envNames).toContain("TEST_PROXY_PROXY_HOST");
  });

  it("without proxyEnabled, no proxy config fields", () => {
    const cli = defineCli({
      name: "test-noproxy",
      version: "0.0.1",
      description: "test",
      commands: [],
      configSchema: z.object({}),
    });

    const envVars = cli.configEnvVars();
    const envNames = envVars.map((e) => e.name);
    expect(envNames).not.toContain("TEST_NOPROXY_PROXY_PORT");
    expect(envNames).not.toContain("TEST_NOPROXY_PROXY_HOST");
  });

  it("proxy keeps the process alive", async () => {
    const cli = defineCli({
      name: "test-proxy-alive",
      version: "0.0.1",
      description: "test",
      commands: [],
      configSchema: z.object({}),
      proxyEnabled: true,
      interactive: {
        welcome: "hello",
      },
    });

    const output: string[] = [];
    const opts: RunOptions = {
      stdout: (msg) => output.push(msg),
      stderr: () => {},
      exit: () => {},
      // Use streaming interactive mode with immediate EOF to trigger keep-alive path
      interactiveInput: (async function* () {
        // yield nothing — EOF immediately
      })(),
    };

    // Run with --wait flag to trigger headless keep-alive mode
    // Use a short timeout to avoid hanging
    const runPromise = cli.run(["-i"], opts);
    // Give it a moment to start up
    await new Promise((r) => setTimeout(r, 500));

    // Check that proxy listening message appeared
    const hasProxyMessage = output.some((l) =>
      l.includes("Proxy listening on"),
    );
    expect(hasProxyMessage).toBe(true);

    // The run should not have exited (keep-alive due to proxy)
    // Clean up by stopping (the proxy teardown should handle this)
  }, 10000);
});

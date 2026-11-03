import type { RunnerContext } from "@powerhousedao/host-core";
import { describe, expect, it, vi } from "vitest";
import type { DesktopHost } from "../src/runner.js";

const compound = vi.hoisted(() => {
  const started = { shutdown: () => Promise.resolve() };
  return {
    run: vi.fn(() => Promise.resolve(started)),
    serve: vi.fn(() => Promise.resolve(started)),
  };
});
vi.mock("@powerhousedao/host-core/runners/compound", () => compound);

const { run, serve } = await import("../src/runner.js");

const host = { name: "desktop" } as DesktopHost;
const ctx = { projectRoot: "/p", verb: "serve" } as RunnerContext;

describe("desktop run and serve", () => {
  it("serve starts the generic compound at serve, as ph host check expects", async () => {
    await serve(host, ctx);
    expect(compound.serve).toHaveBeenCalledWith(host, ctx);
    expect(compound.run).not.toHaveBeenCalled();
  });

  it("run starts the generic compound at run", async () => {
    compound.serve.mockClear();
    await run(host, ctx);
    expect(compound.run).toHaveBeenCalledWith(host, ctx);
    expect(compound.serve).not.toHaveBeenCalled();
  });
});

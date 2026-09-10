// @vitest-environment happy-dom

import { render as renderNode, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootConnect, type BootDeps } from "../src/boot.js";

const Skeleton = () => <div data-testid="skeleton" />;

/** Records what the entry painted, in order, without needing a real DOM root. */
function fakeRoot() {
  const painted: ReactNode[] = [];
  return {
    painted,
    render: (node: ReactNode) => {
      painted.push(node);
    },
  };
}

type Harness = {
  deps: BootDeps;
  root: ReturnType<typeof fakeRoot>;
  calls: string[];
  resolveConfig: (value?: unknown) => void;
  rejectConfig: (error: unknown) => void;
  resolveSkeleton: () => void;
};

function harness(): Harness {
  const calls: string[] = [];
  const root = fakeRoot();

  let resolveConfig!: (value?: unknown) => void;
  let rejectConfig!: (error: unknown) => void;
  const config = new Promise<unknown>((res, rej) => {
    resolveConfig = res as (value?: unknown) => void;
    rejectConfig = rej;
  });

  let resolveSkeletonImport!: () => void;
  const skeletonImport = new Promise<void>((res) => {
    resolveSkeletonImport = res;
  });

  const deps: BootDeps = {
    loadConfig: () => {
      calls.push("loadConfig");
      return config;
    },
    importSkeleton: () => {
      calls.push("importSkeleton");
      return skeletonImport.then(() => ({ default: Skeleton }));
    },
    createRoot: () => {
      calls.push("createRoot");
      return root;
    },
    initObserver: () => {
      calls.push("initObserver");
      return () => undefined;
    },
  };

  return {
    deps,
    root,
    calls,
    resolveConfig,
    rejectConfig,
    resolveSkeleton: resolveSkeletonImport,
  };
}

beforeEach(() => {
  window.ph = undefined as never;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("bootConnect", () => {
  it("starts the runtime config fetch before importing the skeleton chunk", async () => {
    // Both are network round-trips and neither needs the other. Awaiting the
    // skeleton chunk first makes the config fetch a serial prefix to the app
    // being usable, which measured ~180ms on a 150ms-RTT connection.
    const h = harness();

    const booting = bootConnect(h.deps);
    await Promise.resolve();

    expect(h.calls.indexOf("loadConfig")).toBeLessThan(
      h.calls.indexOf("importSkeleton"),
    );

    h.resolveSkeleton();
    h.resolveConfig();
    await booting;
  });

  it("paints the skeleton before the config resolves", async () => {
    const h = harness();

    const booting = bootConnect(h.deps);
    h.resolveSkeleton();
    await vi.waitFor(() => expect(h.root.painted).toHaveLength(1));

    renderNode(h.root.painted[0]);
    expect(screen.getByTestId("skeleton")).toBeTruthy();

    h.resolveConfig();
    await booting;
  });

  it("hands back the root it painted into once the config resolves", async () => {
    const h = harness();

    const booting = bootConnect(h.deps);
    h.resolveSkeleton();
    h.resolveConfig({ connect: {} });

    await expect(booting).resolves.toBe(h.root);
  });

  it("creates window.ph before starting the observer", async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.deps.initObserver = () => {
      seen.push(window.ph);
      return () => undefined;
    };

    const booting = bootConnect(h.deps);
    h.resolveSkeleton();
    h.resolveConfig();
    await booting;

    expect(seen).toEqual([{}]);
  });

  it("paints an error state when the runtime config cannot be loaded", async () => {
    // Before, a rejected config left the skeleton up forever: a page that
    // looks like a working app and never loads, with the failure visible only
    // as an unhandled rejection in the console.
    const h = harness();

    const booting = bootConnect(h.deps);
    h.resolveSkeleton();
    h.rejectConfig(new Error("503 from powerhouse.config.json"));
    await booting;

    renderNode(h.root.painted[h.root.painted.length - 1]);
    expect(screen.getByRole("alert").textContent).toContain(
      "503 from powerhouse.config.json",
    );
  });

  it("resolves with null when the runtime config cannot be loaded", async () => {
    // null tells the entry not to import the config-dependent app, without
    // rejecting — a rejection here becomes an unhandled rejection at the
    // module's top-level await.
    const h = harness();

    const booting = bootConnect(h.deps);
    h.resolveSkeleton();
    h.rejectConfig(new Error("offline"));

    await expect(booting).resolves.toBeNull();
  });

  it("paints the error state even when the skeleton chunk is what failed", async () => {
    const h = harness();
    h.deps.importSkeleton = () => Promise.reject(new Error("chunk 404"));

    const root = await bootConnect(h.deps);

    expect(root).toBeNull();
    renderNode(h.root.painted[h.root.painted.length - 1]);
    expect(screen.getByRole("alert").textContent).toContain("chunk 404");
  });
});

/**
 * @vitest-environment happy-dom
 */
import { act, render, waitFor } from "@testing-library/react";
import { createElement, useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ReactorMonitorRegistry,
  type ManagedReactorEntry,
  type ReactorDescriptor,
} from "../src/index.js";
import {
  ReactorMonitorProvider,
  useManagedReactor,
  useManagedReactors,
  useReactorMonitorRegistry,
} from "../src/react/index.js";

function descriptor(name: string): ReactorDescriptor {
  return { kind: "in-process", name, storage: { kind: "memory" } };
}

// Each assertion below waits on a real reactor booting (PGlite plus
// migrations), which outlasts waitFor's 1s default on a loaded machine.
const WAIT = { timeout: 30_000 } as const;

/** Renders the hook results as text so assertions read off the DOM. */
function Probe({ watch }: { watch?: string }): ReactNode {
  const entries = useManagedReactors();
  const one = useManagedReactor(watch ?? "");
  return createElement(
    "div",
    null,
    createElement(
      "span",
      { "data-testid": "entries" },
      entries
        .map((e: ManagedReactorEntry) => `${e.name}:${e.status}`)
        .join(","),
    ),
    createElement(
      "span",
      { "data-testid": "watched" },
      one ? one.kind : "none",
    ),
  );
}

/** Reports the context registry from an effect, so render stays pure. */
function Capture({
  onRegistry,
}: {
  onRegistry: (registry: ReactorMonitorRegistry) => void;
}): ReactNode {
  const registry = useReactorMonitorRegistry();
  useEffect(() => onRegistry(registry), [onRegistry, registry]);
  return null;
}

describe("ReactorMonitorProvider", () => {
  const registries: ReactorMonitorRegistry[] = [];

  function registry(): ReactorMonitorRegistry {
    const next = new ReactorMonitorRegistry();
    registries.push(next);
    return next;
  }

  afterEach(async () => {
    for (const r of registries.splice(0)) {
      await r.killAll();
    }
  });

  it("exposes the registry it was given", () => {
    const monitor = registry();
    const captured: { registry?: ReactorMonitorRegistry } = {};

    render(
      createElement(ReactorMonitorProvider, {
        registry: monitor,
        children: createElement(Capture, {
          onRegistry: (value: ReactorMonitorRegistry) => {
            captured.registry = value;
          },
        }),
      }),
    );

    expect(captured.registry).toBe(monitor);
  });

  it("throws outside a provider", () => {
    function Peek(): ReactNode {
      useReactorMonitorRegistry();
      return null;
    }

    expect(() => render(createElement(Peek))).toThrow(
      /inside a <ReactorMonitorProvider>/,
    );
  });

  it("provisions declared descriptors and re-renders as they become ready", async () => {
    const monitor = registry();

    const view = render(
      createElement(ReactorMonitorProvider, {
        registry: monitor,
        descriptors: [descriptor("ui-a")],
        children: createElement(Probe, { watch: "ui-a" }),
      }),
    );

    await waitFor(
      () => expect(view.getByTestId("entries").textContent).toBe("ui-a:ready"),
      WAIT,
    );
    expect(view.getByTestId("watched").textContent).toBe("in-process");
  });

  it("kills a descriptor that disappears from the list", async () => {
    const monitor = registry();
    const children = createElement(Probe);

    const view = render(
      createElement(ReactorMonitorProvider, {
        registry: monitor,
        descriptors: [descriptor("gone-a"), descriptor("gone-b")],
        children,
      }),
    );
    await waitFor(
      () =>
        expect(view.getByTestId("entries").textContent).toBe(
          "gone-a:ready,gone-b:ready",
        ),
      WAIT,
    );
    const removed = monitor.reactor("gone-b");

    view.rerender(
      createElement(ReactorMonitorProvider, {
        registry: monitor,
        descriptors: [descriptor("gone-a")],
        children,
      }),
    );

    await waitFor(
      () =>
        expect(view.getByTestId("entries").textContent).toBe("gone-a:ready"),
      WAIT,
    );
    expect(removed?.isShutdown()).toBe(true);
  });

  it("does not re-provision when only the options object changes identity", async () => {
    const monitor = registry();
    const children = createElement(Probe);
    const props = (options: object) => ({
      registry: monitor,
      descriptors: [descriptor("stable")],
      options,
      children,
    });

    const view = render(
      createElement(ReactorMonitorProvider, props({ buildId: "a" })),
    );
    await waitFor(
      () =>
        expect(view.getByTestId("entries").textContent).toBe("stable:ready"),
      WAIT,
    );
    const first = monitor.reactor("stable");

    view.rerender(
      createElement(ReactorMonitorProvider, props({ buildId: "a" })),
    );
    await act(() => Promise.resolve());

    expect(monitor.reactor("stable")).toBe(first);
    expect(first?.isShutdown()).toBe(false);
  });

  it("reports a failure through onError and keeps it on the entry", async () => {
    const monitor = registry();
    const errors: string[] = [];

    const view = render(
      createElement(ReactorMonitorProvider, {
        registry: monitor,
        descriptors: [{ kind: "remote", name: "far" }],
        onError: (error: Error) => errors.push(error.message),
        children: createElement(Probe),
      }),
    );

    await waitFor(
      () => expect(view.getByTestId("entries").textContent).toBe("far:failed"),
      WAIT,
    );
    expect(errors[0]).toMatch(/NotImplemented/);
    expect(monitor.get("far")?.error?.message).toMatch(/NotImplemented/);
  });

  it("kills the reactors of a registry it created when it unmounts", async () => {
    const captured: { registry?: ReactorMonitorRegistry } = {};
    const view = render(
      createElement(ReactorMonitorProvider, {
        descriptors: [descriptor("owned")],
        children: createElement(Capture, {
          onRegistry: (value: ReactorMonitorRegistry) => {
            captured.registry = value;
          },
        }),
      }),
    );
    await waitFor(
      () => expect(captured.registry?.reactor("owned")).toBeDefined(),
      WAIT,
    );
    const reactor = captured.registry?.reactor("owned");

    view.unmount();

    await waitFor(() => expect(reactor?.isShutdown()).toBe(true), WAIT);
  });
});

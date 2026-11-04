// @vitest-environment happy-dom
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MonitoringSetsStore } from "../monitoring-sets.js";
import type { Instance } from "./api.js";
import type { ControllerClient } from "./client.js";
import { useManagedDescriptors } from "./use-managed-descriptors.js";

const drive = (port: number) => `http://127.0.0.1:${port}/d/powerhouse`;

const plain = (name: string, port: number): ReactorDescriptor =>
  ({ kind: "remote", name, remote: { url: drive(port) } }) as ReactorDescriptor;

function running(id: string, port: number): Instance {
  return {
    id,
    project: "/work/proj",
    host: "cli",
    status: "running",
    startedAt: "2026-11-04T00:00:00.000Z",
    outputs: {
      origin: `http://127.0.0.1:${port}`,
      graphql: `http://127.0.0.1:${port}/graphql`,
      drives: { powerhouse: { id: "powerhouse", url: drive(port) } },
    },
  };
}

const exited = (instance: Instance): Instance => ({
  ...instance,
  status: "exited",
});

function setup(initial: ReactorDescriptor[]) {
  const cells = new Map<string, string>();
  const store = new MonitoringSetsStore({
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
  });
  const client = {} as ControllerClient;
  return renderHook(() => {
    const [descriptors, setDescriptors] = useState(initial);
    const managed = useManagedDescriptors({
      store,
      descriptors,
      setDescriptors,
      client,
    });
    return { managed, descriptors, setDescriptors };
  });
}

describe("useManagedDescriptors reachability", () => {
  it("links a start to the set's own remote instead of adding another", () => {
    const view = setup([plain("main", 5401)]);
    act(() => view.result.current.managed.attach(running("a", 5401)));
    expect(view.result.current.descriptors.map((d) => d.name)).toEqual([
      "main",
    ]);
    expect(view.result.current.managed.isAttached(running("a", 5401))).toBe(
      true,
    );
    expect([...view.result.current.managed.covered]).toEqual([["main", ["a"]]]);
  });

  it("keeps a remote reachable when one poll sees its switchboard stop and start again", () => {
    const view = setup([plain("main", 5401)]);
    const a = running("a", 5401);
    const b = running("b", 5401);
    act(() => view.result.current.managed.attach(a));
    act(() => view.result.current.managed.reconcile([exited(a), b]));
    expect([...view.result.current.managed.unreachable]).toEqual([]);
    expect([...view.result.current.managed.covered]).toEqual([["main", ["b"]]]);

    act(() => view.result.current.managed.reconcile([exited(b)]));
    expect([...view.result.current.managed.unreachable]).toEqual([
      ["main", "its switchboard is exited"],
    ]);
  });

  it("does not carry a mark to a same-named remote at another address", () => {
    const view = setup([plain("main", 5401)]);
    act(() => view.result.current.managed.attach(running("a", 5401)));
    act(() => view.result.current.managed.reconcile([]));
    expect(view.result.current.managed.unreachable.get("main")).toBe(
      "the controller no longer runs its switchboard",
    );

    act(() => view.result.current.setDescriptors([plain("main", 5402)]));
    expect([...view.result.current.managed.unreachable]).toEqual([]);
  });

  it("ignores a late mark for a remote that already left the set", () => {
    const view = setup([plain("main", 5401)]);
    act(() => view.result.current.managed.forget("main"));
    act(() => view.result.current.setDescriptors([]));
    act(() => view.result.current.managed.setUnreachable("main", "timed out"));
    act(() => view.result.current.setDescriptors([plain("main", 5401)]));
    expect([...view.result.current.managed.unreachable]).toEqual([]);
  });
});

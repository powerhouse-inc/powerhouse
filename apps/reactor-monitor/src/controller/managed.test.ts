import { describe, expect, it } from "vitest";
import type { Instance } from "./api.js";
import {
  managedByOf,
  managedDescriptors,
  servesDescriptor,
} from "./managed.js";

const outputsOf = (port: number) => ({
  origin: `http://127.0.0.1:${port}`,
  graphql: `http://127.0.0.1:${port}/graphql`,
  drives: {
    workflows: { id: "w", url: `http://127.0.0.1:${port}/d/workflows` },
    powerhouse: { id: "p", url: `http://127.0.0.1:${port}/d/powerhouse` },
  },
});

const base: Instance = {
  id: "0123456789abcdef",
  project: "/tmp/copy/project",
  host: "duo",
  status: "running",
  startedAt: "2026-10-28T00:00:00.000Z",
};

describe("managed descriptors", () => {
  it("gives a standalone host one descriptor without a member", () => {
    const [descriptor, ...rest] = managedDescriptors(
      { ...base, host: "sb", outputs: outputsOf(5001) },
      [],
    );
    expect(rest).toEqual([]);
    expect(descriptor).toMatchObject({
      kind: "remote",
      name: "sb-01234567",
      remote: { url: "http://127.0.0.1:5001/d/powerhouse" },
      managedBy: { instanceId: base.id, project: base.project, host: "sb" },
    });
    expect(descriptor.managedBy).not.toHaveProperty("member");
  });

  it("gives each compound member with outputs its own descriptor", () => {
    const instance: Instance = {
      ...base,
      members: {
        a: { host: "sb-a", outputs: outputsOf(5001) },
        b: { host: "sb-b", outputs: outputsOf(5002) },
        ui: { host: "connect" },
      },
    };
    const descriptors = managedDescriptors(instance, ["b-01234567"]);
    expect(
      descriptors.map((d) => [d.name, d.remote.url, d.managedBy.member]),
    ).toEqual([
      ["a-01234567", "http://127.0.0.1:5001/d/powerhouse", "a"],
      ["b-01234567-2", "http://127.0.0.1:5002/d/powerhouse", "b"],
    ]);
    for (const descriptor of descriptors) {
      expect(managedByOf(descriptor)).toEqual(descriptor.managedBy);
      expect(servesDescriptor(instance, descriptor)).toBe(true);
    }
    const [a] = descriptors;
    expect(
      servesDescriptor(
        {
          ...instance,
          members: { a: { host: "sb-a", outputs: outputsOf(6001) } },
        },
        a,
      ),
    ).toBe(false);
  });

  it("gives a switchboard that reports no drive no descriptor", () => {
    expect(
      managedDescriptors(
        { ...base, outputs: { ...outputsOf(5001), drives: {} } },
        [],
      ),
    ).toEqual([]);
  });

  it("gives an instance that is not running none", () => {
    expect(
      managedDescriptors(
        { ...base, status: "starting", outputs: outputsOf(5001) },
        [],
      ),
    ).toEqual([]);
  });

  it("refuses a marker whose member is not a string", () => {
    expect(
      managedByOf({
        kind: "remote",
        name: "x",
        remote: { url: "http://h/d/powerhouse" },
        managedBy: { instanceId: "i", project: "/p", host: "h", member: 1 },
      } as never),
    ).toBeUndefined();
  });
});

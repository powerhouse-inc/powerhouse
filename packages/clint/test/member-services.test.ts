import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { MemberStatus } from "@powerhousedao/host-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemberServiceManager } from "../src/core/member-services.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function members(): { list: MemberStatus[]; logFile: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "clint-members-"));
  dirs.push(dir);
  const logFile = path.join(dir, "switchboard.1.log");
  writeFileSync(logFile, "one\ntwo\nthree\n");
  return {
    logFile,
    list: [
      {
        name: "switchboard",
        host: "switchboard",
        process: "own",
        status: "ready",
        pid: 77,
        endpoints: { "drives.lab.url": "http://localhost:1/d/lab" },
        logFile,
      },
      {
        name: "connect",
        host: "connect",
        process: "shared",
        status: "failed",
        endpoints: {},
        error: "exited (code 1) while the stack runs",
      },
    ],
  };
}

describe("createMemberServiceManager", () => {
  it("lists each member as one service instance, by its name", () => {
    const { list } = members();
    const services = createMemberServiceManager(() => list);
    expect(services.list()).toEqual([
      {
        serviceId: "switchboard",
        instanceId: "switchboard",
        name: "switchboard",
        status: "ready",
        pid: 77,
        endpoints: { "drives.lab.url": "http://localhost:1/d/lab" },
      },
      {
        serviceId: "connect",
        instanceId: "connect",
        name: "connect",
        status: "failed",
        endpoints: {},
        error: "exited (code 1) while the stack runs",
      },
    ]);
    expect(services.list("connect").map((s) => s.serviceId)).toEqual([
      "connect",
    ]);
    // live: the compound's view, read when asked
    list[0].status = "stopping";
    expect(services.list("switchboard")[0].status).toBe("stopping");
  });

  it("reads a member's log file, and says where a shared member's output goes", () => {
    const { list } = members();
    const services = createMemberServiceManager(() => list);
    expect(services.logs("switchboard", undefined, 2)).toBe(
      "three\n\n— switchboard [ready] log",
    );
    expect(services.logs("connect")).toContain(
      "connect runs in this process: its output is this process's.",
    );
    expect(() => services.logs("nope")).toThrow(/Unknown service: nope/);
  });

  it("watches a member's log file for new lines", async () => {
    const { list, logFile } = members();
    const services = createMemberServiceManager(() => list);
    const lines: string[] = [];
    const stop = services.watchLogs("switchboard", "switchboard", (line) =>
      lines.push(line),
    );
    appendFileSync(logFile, "four\n");
    await vi.waitFor(() => expect(lines).toEqual(["four"]));
    stop();
  });

  it("refuses to start or stop a member, and leaves them to the compound on stopAll", async () => {
    const { list } = members();
    const services = createMemberServiceManager(() => list);
    await expect(services.stop("switchboard")).rejects.toThrow(
      /switchboard is a member of the stack this CLI runs in: it starts and stops with the stack/,
    );
    await expect(services.start("switchboard")).rejects.toThrow(
      /starts and stops with the stack/,
    );
    await expect(services.stopAll()).resolves.toBeUndefined();
    expect(services.getDefinition("switchboard")).toBeUndefined();
  });
});

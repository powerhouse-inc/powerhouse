import { describe, expect, it } from "vitest";
import type { Member } from "./members.js";
import { copyPortClashes, copyPortOf } from "./ports.js";

const CONNECT = "@powerhousedao/ph-cli/runners/connect";

type Holder = Pick<Member, "key" | "role" | "runner">;

function connect(key: string, port?: unknown): Holder {
  return {
    key,
    role: "connect",
    runner: { module: CONNECT, ...(port === undefined ? {} : { port }) },
  };
}

function agent(key: string, port: number): Holder {
  return {
    key,
    role: "other",
    runner: { module: "@powerhousedao/clint/mastra-runner", port },
  };
}

describe("copy port clashes", () => {
  it("explains each port form by what the copy does with it", () => {
    const at13000 = agent("agent", 13_000);
    const cases: [Holder, string][] = [
      [connect("ui", 3000), "ui is on 3000, which the copy moves up by 10000"],
      [connect("ui"), "ui names no port, so the copy starts it on 13000"],
      [
        connect("ui", { $env: "UI_PORT" }),
        "ui takes its port from UI_PORT, which the copy doesn't read, so the copy starts it on 13000",
      ],
      [
        connect("ui", { $output: { host: "x", path: ["port"] } }),
        "ui takes its port when it starts, which the copy doesn't read, so the copy starts it on 13000",
      ],
    ];
    for (const [ui, reason] of cases) {
      expect(copyPortOf(ui)).toBe(13_000);
      expect(copyPortClashes([ui, at13000]).map((c) => c.message)).toEqual([
        `ui and agent would both use port 13000 when the monitor starts its copy: ${reason}; agent keeps port 13000. Give ui another port.`,
      ]);
    }
  });
});

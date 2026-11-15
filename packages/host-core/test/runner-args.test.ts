import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRunnerArgv,
  isRunnerArgsSchema,
  splitCompoundArgv,
  splitRunArgv,
  type RunnerArgsSchema,
} from "../src/runner-args.js";
import { RunnerError } from "../src/runner-resolver.js";

const switchboard: RunnerArgsSchema = {
  options: ["--port", "--db-path", "--remote-drives"],
  flags: ["--strictPort", "--https"],
  memberOptions: { "--switchboard-port": "--port" },
  retired: {
    "--watch": "it is no longer needed.",
    "--disable-connect": "use `ph run switchboard dev` instead.",
  },
};

const connect: RunnerArgsSchema = {
  options: ["--port", "--host"],
  flags: ["--strictPort", "--open"],
  memberOptions: { "--connect-port": "--port" },
  retired: { "--watch": "it is no longer needed." },
};

const members = [
  { key: "vetra-switchboard", runner: "sb-runner", schema: switchboard },
  { key: "vetra-studio", runner: "connect-runner", schema: connect },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("splitRunArgv", () => {
  it("reads the host and the verb, and nothing else, from a bare run", () => {
    expect(splitRunArgv(["vetra"])).toEqual({
      host: "vetra",
      own: [],
      argv: [],
    });
    expect(splitRunArgv(["vetra", "dev"])).toEqual({
      host: "vetra",
      verb: "dev",
      own: [],
      argv: [],
    });
  });

  it("hands what follows the host and the verb to the runner", () => {
    expect(
      splitRunArgv(["switchboard", "dev", "--port", "4001", "--strictPort"]),
    ).toEqual({
      host: "switchboard",
      verb: "dev",
      own: [],
      argv: ["--port", "4001", "--strictPort"],
    });
  });

  it("does not read a runner argument's value as the verb", () => {
    expect(splitRunArgv(["switchboard", "--port", "4001"])).toEqual({
      host: "switchboard",
      own: [],
      argv: ["--port", "4001"],
    });
  });

  it("keeps `ph run`'s own arguments, wherever they are", () => {
    expect(
      splitRunArgv(["--debug", "vetra", "--port=1", "--explain", "drives"]),
    ).toEqual({
      host: "vetra",
      own: ["--debug", "--explain", "drives"],
      argv: ["--port=1"],
    });
    expect(splitRunArgv(["vetra", "--explain=outputs", "-h"]).own).toEqual([
      "--explain=outputs",
      "-h",
    ]);
  });

  it("hands over everything after a literal `--`", () => {
    expect(splitRunArgv(["vetra", "run", "--", "--debug", "x"])).toEqual({
      host: "vetra",
      verb: "run",
      own: [],
      argv: ["--debug", "x"],
    });
  });
});

describe("isRunnerArgsSchema", () => {
  it("takes the declared shape only", () => {
    expect(isRunnerArgsSchema(switchboard)).toBe(true);
    expect(isRunnerArgsSchema({ options: [], flags: [] })).toBe(true);
    expect(isRunnerArgsSchema(undefined)).toBe(false);
    expect(isRunnerArgsSchema({ options: ["--port"] })).toBe(false);
    expect(isRunnerArgsSchema({ options: [1], flags: [] })).toBe(false);
  });
});

describe("checkRunnerArgv", () => {
  const target = { host: "switchboard", runner: "sb-runner" };

  it("returns the accepted arguments as typed", () => {
    expect(
      checkRunnerArgv(["--port", "4001", "--db-path=./x", "--strictPort"], {
        ...target,
        schema: switchboard,
      }),
    ).toEqual(["--port", "4001", "--db-path=./x", "--strictPort"]);
  });

  it("takes no arguments as none, schema or not", () => {
    expect(checkRunnerArgv([], { ...target, schema: undefined })).toEqual([]);
  });

  it("refuses an unknown argument, naming the host, the runner and what it accepts", () => {
    const check = () =>
      checkRunnerArgv(["--port", "4001", "--interactive"], {
        ...target,
        schema: switchboard,
      });
    expect(check).toThrow(RunnerError);
    expect(check).toThrow(
      /hosts\/switchboard: its runner sb-runner does not accept --interactive\./,
    );
    expect(check).toThrow(
      /It accepts: --port, --db-path, --remote-drives, --strictPort, --https\./,
    );
  });

  it("refuses any argument for a runner without a schema", () => {
    expect(() =>
      checkRunnerArgv(["--port", "4001"], { ...target, schema: undefined }),
    ).toThrow(
      /hosts\/switchboard: its runner sb-runner accepts no arguments, but got: --port 4001/,
    );
  });

  it("refuses an option without its value", () => {
    expect(() =>
      checkRunnerArgv(["--port"], { ...target, schema: switchboard }),
    ).toThrow(/--port needs a value/);
  });

  it("accepts a retired switch with one warning and drops it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      checkRunnerArgv(["--watch", "--port", "4001", "--disable-connect"], {
        ...target,
        schema: switchboard,
      }),
    ).toEqual(["--port", "4001"]);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      "--watch is retired and has no effect: it is no longer needed.",
      "--disable-connect is retired and has no effect: use `ph run switchboard dev` instead.",
    ]);
  });
});

describe("splitCompoundArgv", () => {
  it("gives every member nothing when there are no arguments", () => {
    expect(splitCompoundArgv([], "vetra", members)).toEqual(
      new Map([
        ["vetra-switchboard", []],
        ["vetra-studio", []],
      ]),
    );
  });

  it("routes a member option to its member under the plain name", () => {
    const split = splitCompoundArgv(
      ["--switchboard-port", "4001", "--connect-port=3001"],
      "vetra",
      members,
    );
    expect(split.get("vetra-switchboard")).toEqual(["--port", "4001"]);
    expect(split.get("vetra-studio")).toEqual(["--port=3001"]);
  });

  it("forwards an argument to each member that accepts it", () => {
    const split = splitCompoundArgv(
      ["--strictPort", "--open", "--db-path", "./x"],
      "vetra",
      members,
    );
    expect(split.get("vetra-switchboard")).toEqual([
      "--strictPort",
      "--db-path",
      "./x",
    ]);
    expect(split.get("vetra-studio")).toEqual(["--strictPort", "--open"]);
  });

  it("refuses a plain option that members take under their own name", () => {
    const split = () => splitCompoundArgv(["--port", "4001"], "vetra", members);
    expect(split).toThrow(
      /hosts\/vetra: --port does not say which member it is for\./,
    );
    expect(split).toThrow(/Use --switchboard-port or --connect-port\./);
  });

  it("refuses an argument no member accepts, listing what each accepts", () => {
    const split = () =>
      splitCompoundArgv(["--open", "--interactive"], "vetra", [
        ...members,
        { key: "worker", runner: "plain-runner", schema: undefined },
      ]);
    expect(split).toThrow(/hosts\/vetra: no member accepts --interactive\./);
    expect(split).toThrow(
      /- vetra-switchboard \(sb-runner\): --switchboard-port, --db-path, --remote-drives, --strictPort, --https/,
    );
    expect(split).toThrow(/- worker \(plain-runner\): no arguments/);
  });

  it("warns once about a retired switch and gives it to no member", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const split = splitCompoundArgv(
      ["--watch", "--disable-connect", "--watch"],
      "vetra",
      members,
    );
    expect(split.get("vetra-switchboard")).toEqual([]);
    expect(split.get("vetra-studio")).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/^--watch is retired/);
  });

  it("refuses a member name that two members answer to", () => {
    expect(() =>
      splitCompoundArgv(["--switchboard-port", "1"], "pair", [
        { key: "a", runner: "sb-runner", schema: switchboard },
        { key: "b", runner: "sb-runner", schema: switchboard },
      ]),
    ).toThrow(/--switchboard-port matches the members a, b\./);
  });
});

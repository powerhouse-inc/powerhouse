import { describe, expect, it } from "vitest";
import {
  type BuildStep,
  BuildStopped,
  orderBuildSteps,
} from "../src/services/package-build/pipeline/steps.js";
import { runBuildSteps } from "../src/services/package-build/pipeline/run-steps.js";
import { standardBuildSteps } from "../src/services/package-build/steps/standard.js";

const step = (
  id: string,
  after?: string[],
  when?: "committed",
): BuildStep<unknown> => ({
  id,
  ...(after !== undefined && { after }),
  ...(when !== undefined && { when }),
  run: () => Promise.resolve(),
});

const committed = (id: string, after?: string[]) =>
  step(id, after, "committed");

const ids = (steps: readonly BuildStep<unknown>[]) =>
  orderBuildSteps(steps).map(({ id }) => id);

describe("orderBuildSteps", () => {
  it("keeps list order when no step names another", () => {
    expect(ids([step("a"), step("b"), step("c")])).toEqual(["a", "b", "c"]);
  });

  it("runs an appended step right after the step it names", () => {
    expect(ids([step("a"), step("b"), step("c"), step("x", ["a"])])).toEqual([
      "a",
      "x",
      "b",
      "c",
    ]);
  });

  it("waits for the last of several named steps", () => {
    expect(
      ids([step("a"), step("b"), step("c"), step("x", ["c", "a"])]),
    ).toEqual(["a", "b", "c", "x"]);
  });

  it("keeps the list order of two steps inserted after the same step", () => {
    expect(
      ids([step("a"), step("b"), step("y", ["a"]), step("x", ["a"])]),
    ).toEqual(["a", "y", "x", "b"]);
  });

  it("moves a listed step behind a later one it names", () => {
    expect(ids([step("a", ["c"]), step("b", []), step("c", [])])).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("throws on a duplicate id", () => {
    expect(() => ids([step("a"), step("b"), step("a")])).toThrow(
      'Build step "a" is listed twice.',
    );
  });

  it("throws on an unknown after id", () => {
    expect(() => ids([step("a"), step("x", ["nope"])])).toThrow(
      'Build step "x" runs after "nope", which no step provides.',
    );
  });

  it("throws on steps that wait on each other", () => {
    expect(() => ids([step("a", ["b"]), step("b")])).toThrow(
      'Build steps "a", "b" wait on each other.',
    );
  });

  it("runs committed steps after every other step", () => {
    expect(
      ids([
        committed("c1"),
        step("a"),
        committed("c2"),
        step("b"),
        committed("c3", ["a"]),
      ]),
    ).toEqual(["a", "b", "c3", "c1", "c2"]);
  });

  it("throws on a step before the commit that waits on a committed one", () => {
    expect(() => ids([committed("c"), step("a", ["c"])])).toThrow(
      'Build step "a" runs before the output is replaced, so it cannot run after "c", which runs once it is.',
    );
  });

  it("orders ph build's own steps as main's build ran them", () => {
    expect(orderBuildSteps(standardBuildSteps).map(({ id }) => id)).toEqual([
      "release-start",
      "manifest-name",
      "pieces-out-dir",
      "connect-routes",
      "typecheck",
      "definitions",
      "browser-bundle",
      "node-bundle",
      "pieces",
      "dist-manifest",
      "offered-routes",
      "stylesheet",
      "release-approval",
    ]);
  });
});

describe("runBuildSteps", () => {
  it("runs the steps in their order, commits, then runs committed steps", async () => {
    const seen: string[] = [];
    const record = (listed: BuildStep<unknown>): BuildStep<unknown> => ({
      ...listed,
      run: () => {
        seen.push(listed.id);
        return Promise.resolve();
      },
    });

    await runBuildSteps(
      [committed("after"), step("a"), step("b"), step("x", ["a"])].map(record),
      undefined,
      {
        commit: () => void seen.push("commit"),
        rollback: () => void seen.push("rollback"),
        stopped: () => undefined,
      },
    );

    expect(seen).toEqual(["a", "x", "b", "commit", "after"]);
  });

  it("rolls back on a failure before the commit, and not after it", async () => {
    const run = async (failing: BuildStep<unknown>) => {
      const seen: string[] = [];
      const failure = await runBuildSteps([failing], undefined, {
        commit: () => void seen.push("commit"),
        rollback: () => void seen.push("rollback"),
        stopped: () => undefined,
      }).catch((error: unknown) => error);
      return { seen, failure };
    };
    const fail = () => Promise.reject(new Error("no"));

    expect(await run({ id: "x", run: fail })).toEqual({
      seen: ["rollback"],
      failure: new Error("no"),
    });
    expect(await run({ id: "x", when: "committed", run: fail })).toEqual({
      seen: ["commit"],
      failure: new Error("no"),
    });
  });

  it("starts no step and does not commit once the build was stopped", async () => {
    const seen: string[] = [];
    let stopped = false;
    const session = {
      commit: () => void seen.push("commit"),
      rollback: () => void seen.push("rollback"),
      stopped: () => (stopped ? "SIGTERM" : undefined),
    };
    const steps: BuildStep<unknown>[] = [
      {
        id: "a",
        run: () => {
          seen.push("a");
          stopped = true;
          return Promise.resolve();
        },
      },
      {
        id: "b",
        run: () => {
          seen.push("b");
          return Promise.resolve();
        },
      },
    ];

    const failure = await runBuildSteps(steps, undefined, session).catch(
      (error: unknown) => error,
    );

    expect(seen).toEqual(["a", "rollback"]);
    expect(failure).toEqual(new BuildStopped("SIGTERM"));
    expect(String(failure)).toBe(
      "BuildStopped: The build was stopped by SIGTERM before it finished.",
    );
  });

  it("reports the stop, not the error, of a step that throws once the build was stopped", async () => {
    const seen: string[] = [];
    let stopped = false;

    const failure = await runBuildSteps(
      [
        {
          id: "a",
          run: () => {
            stopped = true;
            return Promise.reject(new Error("killed"));
          },
        },
      ],
      undefined,
      {
        commit: () => void seen.push("commit"),
        rollback: () => void seen.push("rollback"),
        stopped: () => (stopped ? "SIGTERM" : undefined),
      },
    ).catch((error: unknown) => error);

    expect(failure).toEqual(new BuildStopped("SIGTERM"));
    expect(new Set(seen)).toEqual(new Set(["rollback"]));
  });
});

import {
  clearCoreJob,
  reducer,
  setCoreJob,
  updateCoreJob,
  utils,
} from "document-models/problem-sheet/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

describe("Core job operations", () => {
  it("sets the core job", () => {
    const doc = utils.createDocument();
    const next = reducer(
      doc,
      setCoreJob({
        motivation: "HAVE_TO",
        verb: "coordinate",
        object: "shared procurement",
        clarifier: "for groups sharing resources",
      }),
    );
    expect(next.state.global.coreJob).toEqual({
      motivation: "HAVE_TO",
      verb: "coordinate",
      object: "shared procurement",
      clarifier: "for groups sharing resources",
    });
  });

  it("defaults a missing clarifier to null", () => {
    const doc = utils.createDocument();
    const next = reducer(
      doc,
      setCoreJob({ motivation: "WANT_TO", verb: "build", object: "a house" }),
    );
    expect(next.state.global.coreJob?.clarifier).toBeNull();
  });

  it("updates fields of an existing core job", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      setCoreJob({ motivation: "WANT_TO", verb: "build", object: "a house" }),
    );
    doc = reducer(doc, updateCoreJob({ verb: "renovate" }));
    expect(doc.state.global.coreJob?.verb).toBe("renovate");
    expect(doc.state.global.coreJob?.object).toBe("a house");
  });

  it("rejects updating when no core job is set", () => {
    const doc = utils.createDocument();
    expect(
      failure(() => reducer(doc, updateCoreJob({ verb: "x" }))),
    ).toBeTruthy();
  });

  it("clears the core job", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      setCoreJob({ motivation: "WANT_TO", verb: "build", object: "a house" }),
    );
    doc = reducer(doc, clearCoreJob({}));
    expect(doc.state.global.coreJob).toBeNull();
  });
});

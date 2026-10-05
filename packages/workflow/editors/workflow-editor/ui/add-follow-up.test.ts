import { describe, expect, it } from "vitest";
import { planFollowUp, type AddedBlock } from "./add-follow-up.js";
import type { BlockForm } from "./forms.js";

const HTTP = {
  pieceName: "@activepieces/piece-http",
  pieceVersion: "0.11.19",
  kind: "action" as const,
  name: "send_request",
};

const form: BlockForm = {
  title: "Send request",
  requireAuth: false,
  ports: ["next", "error"],
  props: [
    {
      name: "method",
      displayName: "Method",
      type: "STATIC_DROPDOWN",
      required: true,
      defaultValue: "GET",
    },
    {
      name: "timeout",
      displayName: "Timeout",
      type: "NUMBER",
      required: false,
      defaultValue: 30,
    },
    { name: "url", displayName: "URL", type: "SHORT_TEXT", required: true },
  ],
};

const added: AddedBlock = { id: "s1", group: "g1", block: HTTP };

describe("planFollowUp", () => {
  it("writes only the defaults still unset", () => {
    expect(
      planFollowUp(
        added,
        { block: HTTP, config: { url: "https://x" } },
        [],
        form,
      ),
    ).toEqual({
      config: { url: "https://x", method: "GET", timeout: 30 },
    });
  });

  it("keeps what the author set while the form loaded", () => {
    expect(
      planFollowUp(
        added,
        { block: HTTP, config: { method: "POST", timeout: 5 } },
        [],
        form,
      ),
    ).toBeNull();
    expect(
      planFollowUp(added, { block: HTTP, config: { method: "POST" } }, [], form)
        ?.config,
    ).toEqual({ method: "POST", timeout: 30 });
  });

  it("skips a block that was removed or replaced meanwhile", () => {
    expect(planFollowUp(added, undefined, [], form)).toBeNull();
    expect(
      planFollowUp(
        added,
        { block: { ...HTTP, name: "other" }, config: {} },
        [],
        form,
      ),
    ).toBeNull();
  });

  it("re-points a guessed continuation the form disagrees with", () => {
    const edge = { id: "c1", from: "s1", to: "s2", port: "next" };
    const branch: BlockForm = {
      ...form,
      props: [],
      ports: ["true", "false", "error"],
    };
    const guessed = { ...added, continuation: { edgeId: "c1", port: "next" } };
    expect(
      planFollowUp(guessed, { block: HTTP, config: {} }, [edge], branch),
    ).toEqual({ repoint: { edge, port: "true" } });
    // The author moved it already: left alone.
    expect(
      planFollowUp(
        guessed,
        { block: HTTP, config: {} },
        [{ ...edge, port: "false" }],
        branch,
      ),
    ).toBeNull();
    // The guess was right.
    expect(
      planFollowUp(guessed, { block: HTTP, config: {} }, [edge], {
        ...form,
        props: [],
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  BARE,
  FULL,
  hostExport,
  stack,
} from "../host-rules/__fixtures__/hosts.js";
import { addEdit, newDraft } from "./draft.js";
import { builderEngine, memberOf, stepOf } from "./engine.js";

const DIGEST = "0".repeat(64);

function draftOf(envelope = stack()) {
  return newDraft(
    {
      kind: "project",
      project: "/project",
      host: envelope.name,
      export: envelope,
    },
    DIGEST,
  );
}

describe("builderEngine", () => {
  it("reports a refused setter and still runs every rule", () => {
    const draft = addEdit(draftOf(), [
      { path: "host.runner.module", value: "evil" },
      { path: "host.name", value: "renamed" },
    ]);
    const engine = builderEngine(draft, FULL);
    expect(engine.issues[0]).toMatchObject({
      rule: "setter",
      path: "host.runner.module",
    });
    expect((engine.envelope.host as { name: string }).name).toBe("renamed");
    expect(engine.members.map((member) => member.key)).toEqual(["sb", "ui"]);
    expect(engine.options.length).toBeGreaterThan(0);
  });

  it("judges the vetra host's options quickly", () => {
    const draft = draftOf(hostExport("vetra"));
    builderEngine(draft, BARE);
    const started = performance.now();
    builderEngine(draft, BARE);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("stepOf", () => {
  it("sends each issue to the step that fixes it", () => {
    expect(stepOf("env.REACTOR_WORKERS")).toBe("environment");
    expect(stepOf("host.name")).toBe("basics");
    expect(stepOf("members.sb.name")).toBe("basics");
    expect(stepOf("name")).toBe("basics");
    expect(stepOf("host")).toBe("members");
    expect(stepOf("host.children.sb")).toBe("members");
    expect(stepOf("members.switchboard")).toBe("members");
    expect(stepOf("host.config.startOrder.0")).toBe("members");
    expect(stepOf("host.children.sb.runner.port")).toBe("reactor");
    expect(stepOf("members.switchboard.reactor.backends.main.storage")).toBe(
      "reactor",
    );
  });

  it("finds the member a path belongs to", () => {
    const { members } = builderEngine(draftOf(), FULL);
    expect(memberOf(members, "host.children.ui.runner.dev")?.key).toBe("ui");
    expect(
      memberOf(members, "members.switchboard.reactor.backends.main")?.key,
    ).toBe("sb");
    expect(memberOf(members, "env.X")).toBeUndefined();
  });
});

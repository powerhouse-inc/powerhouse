// The engine's blocks belong to no package, so nothing fetches them for an
// author. Every discovery surface has to carry them itself.
import {
  CORE_DESCRIPTOR,
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
  coreBlockDescriptor,
  isCoreBlock,
} from "./core-catalog.js";
import {
  actionsResult,
  catalogEntry,
  localSearchHits,
  triggersResult,
} from "./local-catalog.js";

describe("core block catalog", () => {
  it("lists the core piece the way a package piece is listed", () => {
    const entry = catalogEntry(
      CORE_DESCRIPTOR,
      CORE_PIECE_NAME,
      CORE_PIECE_VERSION,
    );

    expect(entry.name).toBe("core");
    expect(entry.actionCount).toBe(2);
    expect(entry.triggerCount).toBe(3);
  });

  it("hands out ready-to-use block types", () => {
    const actions = actionsResult(
      CORE_DESCRIPTOR,
      CORE_PIECE_NAME,
      CORE_PIECE_VERSION,
    );
    const triggers = triggersResult(
      CORE_DESCRIPTOR,
      CORE_PIECE_NAME,
      CORE_PIECE_VERSION,
    );

    expect(actions.actions.map((a) => a.blockType)).toEqual([
      "core#branch",
      "core#assert",
    ]);
    expect(triggers.triggers.map((t) => t.blockType)).toEqual([
      "core#trigger:schedule",
      "core#trigger:webhook",
      "core#trigger:manual",
    ]);
  });

  it("is searchable by name", () => {
    const hits = localSearchHits(CORE_DESCRIPTOR, CORE_PIECE_NAME);

    expect(hits.map((hit) => hit.blockType)).toContain("core#branch");
  });

  // `equals` is the difference between a branch that decides and one that
  // always takes the true port, so a descriptor that omits it is the bug.
  it("describes core#branch, equals included", () => {
    const descriptor = coreBlockDescriptor("core#branch") as {
      action: { name: string; props: { name: string }[] };
    };

    expect(descriptor.action.name).toBe("branch");
    expect(descriptor.action.props.map((prop) => prop.name)).toEqual([
      "condition",
      "equals",
    ]);
  });

  it("describes a core trigger, and nothing it does not have", () => {
    const trigger = coreBlockDescriptor("core#trigger:manual") as {
      trigger: { name: string; strategy: string };
    };

    expect(trigger.trigger).toMatchObject({
      name: "manual",
      strategy: "MANUAL",
    });
    expect(coreBlockDescriptor("core#nonsense")).toBeNull();
    expect(coreBlockDescriptor("core#trigger:nonsense")).toBeNull();
  });

  it("recognises a core block type, and only a core one", () => {
    expect(isCoreBlock("core#branch")).toBe(true);
    expect(isCoreBlock("core#trigger:manual")).toBe(true);
    expect(isCoreBlock("@acme/piece-crm#core")).toBe(false);
    expect(isCoreBlock("coreish#branch")).toBe(false);
  });
});

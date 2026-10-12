import {
  reducer,
  setLastTest,
  setTrigger,
  setTriggerConfig,
  setTriggerConnection,
  setTriggerPieceVersion,
  utils,
  type WorkflowAction,
  type WorkflowDocument,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

const TRIGGER = "trigger-tttttt";

function apply(
  document: WorkflowDocument,
  ...actions: WorkflowAction[]
): WorkflowDocument {
  return actions.reduce(
    (current, action) => reducer(current, action),
    document,
  );
}

function lastError(document: WorkflowDocument): string | undefined {
  return document.operations.global.at(-1)?.error;
}

// Pins an action's timestamp, which the reducer copies into updatedAt.
function at<T extends { timestampUtcMs: string }>(action: T, time: string): T {
  return { ...action, timestampUtcMs: time };
}

function withTrigger(): WorkflowDocument {
  return apply(
    utils.createDocument(),
    at(
      setTrigger({
        id: TRIGGER,
        pieceName: "@acme/piece-mail",
        pieceVersion: "1.0.0",
        triggerName: "new_mail",
        connectionId: "phd:mail-1",
        reactorConnectionId: "phd:reactor-1",
        config: { folder: "inbox" },
        propertySettings: [{ prop: "folder", mode: "EXPRESSION" }],
      }),
      "2026-09-28T09:00:00.000Z",
    ),
  );
}

describe("SET_TRIGGER_CONFIG", () => {
  it("changes only the config and its settings", () => {
    const before = withTrigger().state.global.trigger!;
    const document = apply(
      withTrigger(),
      setTriggerConfig({ config: { folder: "sent" } }),
    );
    expect(lastError(document)).toBeUndefined();
    const { updatedAt: _updatedAt, ...after } = document.state.global.trigger!;
    const { updatedAt: _before, ...unchanged } = before;
    expect(after).toEqual({ ...unchanged, config: { folder: "sent" } });
  });

  it("replaces the settings when given, and clears them on null", () => {
    const set = apply(
      withTrigger(),
      setTriggerConfig({
        config: { folder: "sent" },
        propertySettings: [{ prop: "folder", mode: "MANUAL" }],
      }),
    );
    expect(set.state.global.trigger?.propertySettings).toEqual([
      { prop: "folder", mode: "MANUAL", schema: null },
    ]);
    const cleared = apply(
      set,
      setTriggerConfig({ config: { folder: "sent" }, propertySettings: null }),
    );
    expect(cleared.state.global.trigger?.propertySettings).toBeNull();
  });

  it("stamps the trigger only when the config changed", () => {
    const same = apply(
      withTrigger(),
      at(
        setTriggerConfig({ config: { folder: "inbox" } }),
        "2026-09-28T10:00:00.000Z",
      ),
    );
    expect(same.state.global.trigger?.updatedAt).toBe(
      "2026-09-28T09:00:00.000Z",
    );
    const changed = apply(
      withTrigger(),
      at(
        setTriggerConfig({ config: { folder: "sent" } }),
        "2026-09-28T10:00:00.000Z",
      ),
    );
    expect(changed.state.global.trigger?.updatedAt).toBe(
      "2026-09-28T10:00:00.000Z",
    );
  });

  it("refuses a config that is not an object, and a missing trigger", () => {
    const notObject = apply(withTrigger(), setTriggerConfig({ config: [] }));
    expect(lastError(notObject)).toMatch(/must be an object/);
    expect(notObject.state.global.trigger?.config).toEqual({
      folder: "inbox",
    });
    const none = apply(
      utils.createDocument(),
      setTriggerConfig({ config: {} }),
    );
    expect(lastError(none)).toMatch(/no trigger to configure/);
  });
});

describe("SET_TRIGGER_CONNECTION", () => {
  it("changes only the connection it names", () => {
    const document = apply(
      withTrigger(),
      setTriggerConnection({ connectionId: "phd:mail-2" }),
    );
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.trigger).toMatchObject({
      connectionId: "phd:mail-2",
      reactorConnectionId: "phd:reactor-1",
      config: { folder: "inbox" },
    });
  });

  it("clears a connection on null", () => {
    const document = apply(
      withTrigger(),
      setTriggerConnection({ reactorConnectionId: null }),
    );
    expect(document.state.global.trigger).toMatchObject({
      connectionId: "phd:mail-1",
      reactorConnectionId: null,
    });
  });

  it("refuses a missing trigger", () => {
    const document = apply(
      utils.createDocument(),
      setTriggerConnection({ connectionId: "phd:mail-2" }),
    );
    expect(lastError(document)).toMatch(/no trigger to connect/);
  });
});

describe("SET_TRIGGER_PIECE_VERSION", () => {
  it("changes the version and drops the old version's test", () => {
    const tested = apply(
      withTrigger(),
      setLastTest({
        id: TRIGGER,
        runId: "run-1",
        testedAt: "2026-09-28T09:30:00.000Z",
      }),
    );
    expect(tested.state.global.trigger?.lastTest).not.toBeNull();
    const document = apply(
      tested,
      setTriggerPieceVersion({ pieceVersion: "1.1.0" }),
    );
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.trigger).toMatchObject({
      pieceVersion: "1.1.0",
      connectionId: "phd:mail-1",
      reactorConnectionId: "phd:reactor-1",
      config: { folder: "inbox" },
      propertySettings: [{ prop: "folder", mode: "EXPRESSION" }],
      lastTest: null,
    });
  });

  it("changes nothing for the version it already has", () => {
    const before = withTrigger();
    const document = apply(
      before,
      setTriggerPieceVersion({ pieceVersion: "1.0.0" }),
    );
    expect(document.state.global).toEqual(before.state.global);
  });

  it("refuses an inexact version, and a missing trigger", () => {
    const inexact = apply(
      withTrigger(),
      setTriggerPieceVersion({ pieceVersion: "^1.0.0" }),
    );
    expect(lastError(inexact)).toMatch(/not an exact semver/);
    expect(inexact.state.global.trigger?.pieceVersion).toBe("1.0.0");
    const none = apply(
      utils.createDocument(),
      setTriggerPieceVersion({ pieceVersion: "1.1.0" }),
    );
    expect(lastError(none)).toMatch(/no trigger to update/);
  });
});

// The panel builds each edit from the trigger as last echoed; both must land.
describe("two trigger edits made before either echoes", () => {
  it("keeps a picked connection and a config edit", () => {
    const document = apply(
      withTrigger(),
      setTriggerConnection({ connectionId: "phd:mail-2" }),
      setTriggerConfig({ config: { folder: "sent" } }),
    );
    expect(document.state.global.trigger).toMatchObject({
      connectionId: "phd:mail-2",
      config: { folder: "sent" },
    });
  });

  it("keeps a config edit and a version update", () => {
    const document = apply(
      withTrigger(),
      setTriggerConfig({ config: { folder: "sent" } }),
      setTriggerPieceVersion({ pieceVersion: "1.1.0" }),
      setTriggerConnection({ reactorConnectionId: "phd:reactor-2" }),
    );
    expect(document.state.global.trigger).toMatchObject({
      pieceVersion: "1.1.0",
      connectionId: "phd:mail-1",
      reactorConnectionId: "phd:reactor-2",
      config: { folder: "sent" },
    });
  });
});

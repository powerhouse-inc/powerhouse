// What this editor substitutes for the reactor piece's props, and what it
// leaves alone.
import { describe, expect, it } from "vitest";
import type { BlockFormProp } from "./forms.js";
import {
  adaptReactorProps,
  isReactorPieceBlock,
  REACTOR_PIECE,
} from "./reactor-piece-form.js";

const prop = (name: string, type = "DROPDOWN"): BlockFormProp => ({
  name,
  displayName: name,
  type,
  required: false,
});

describe("isReactorPieceBlock", () => {
  it("claims the piece's blocks, versioned or not", () => {
    expect(isReactorPieceBlock(`${REACTOR_PIECE}#document-create`)).toBe(true);
    expect(isReactorPieceBlock(`${REACTOR_PIECE}@1.0.0#document-create`)).toBe(
      true,
    );
    expect(isReactorPieceBlock(`${REACTOR_PIECE}#trigger:document-event`)).toBe(
      true,
    );
  });

  it("leaves every other piece to render its props as declared", () => {
    expect(isReactorPieceBlock("@activepieces/piece-http#send_request")).toBe(
      false,
    );
    expect(isReactorPieceBlock("core#branch")).toBe(false);
  });
});

describe("adaptReactorProps", () => {
  it("renders document and model values as autocomplete, not a select", () => {
    const adapted = adaptReactorProps([
      prop("documentType"),
      prop("documentId"),
      prop("parentId"),
      prop("driveId"),
    ]);

    expect(adapted.map((entry) => entry.type)).toEqual([
      "PH_AUTOCOMPLETE",
      "PH_AUTOCOMPLETE",
      "PH_AUTOCOMPLETE",
      "PH_AUTOCOMPLETE",
    ]);
    // The editor loads their options from the piece, as before.
    expect(adapted.every((entry) => entry.hasDynamicResolver)).toBe(true);
  });

  it("renders the action list, and folds its type picker into it", () => {
    const adapted = adaptReactorProps([
      prop("documentId"),
      prop("actions", "JSON"),
      prop("actionType"),
      prop("allowedActions", "SHORT_TEXT"),
    ]);

    expect(adapted.map((entry) => entry.name)).toEqual([
      "documentId",
      "actions",
      "allowedActions",
    ]);
    expect(adapted[1].type).toBe("PH_ACTIONS");
  });

  it("keeps actionType as a field of its own where no list needs it", () => {
    const adapted = adaptReactorProps([
      prop("documentType"),
      prop("actionType"),
    ]);

    expect(adapted.map((entry) => [entry.name, entry.type])).toEqual([
      ["documentType", "PH_AUTOCOMPLETE"],
      ["actionType", "PH_AUTOCOMPLETE"],
    ]);
  });

  it("passes anything else through untouched", () => {
    const name = prop("name", "SHORT_TEXT");
    const [adapted] = adaptReactorProps([name]);

    expect(adapted).toBe(name);
  });
});
